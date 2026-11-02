import "server-only";

import { Types } from "mongoose";
import { academyDateKey, academyTimeOfDay } from "@/lib/academyTime";
import { exitStudentId as idOf } from "@/lib/classroomStudentExits";
import { dbConnect } from "@/lib/db";
import { recentlyCalled } from "@/lib/retention/familyRules";
import { LEVEL_RANK, assessRisk, coachHeadsUp, needsCall, type RiskResult } from "@/lib/retention/riskRules";
import { lastConnectedCalls, loadStudentContexts, type StudentContext } from "@/lib/retention/studentSignals";
import { raiseRetentionRiskTask, resolveRetentionRiskTask } from "@/lib/tasks/taskTriggers";
import { Notification } from "@/models/Fee";
import { RetentionFlag, RetentionSweepRun } from "@/models/RetentionFlag";
import { User } from "@/models/User";

// Nothing here may import lib/studentPause.ts or lib/fees.ts: both pull in
// Node's crypto, and this file is reachable from instrumentation.ts, whose
// bundle then fails to compile. Pause and fee state are read from the models
// (see studentSignals.ts).

const DAY = 86_400_000;
/** A family a person settled is left alone this long, unless it gets worse. */
const SETTLED_QUIET_DAYS = 14;

/** IST hour from which the day's sweep runs - before the 9:00 task digest picks the tasks up. */
export function retentionSweepHour() {
  const hour = Number(process.env.RETENTION_SWEEP_HOUR);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 8;
}

/**
 * Hourly job. Once a day (after `retentionSweepHour()` IST) it scores every
 * active student and keeps the RetentionFlag records, the admins' "call this
 * family" tasks and the coaches' heads-up in step with the result.
 * `force` runs it again regardless of the hour and the day's claim.
 */
export async function processRetentionSweep(now = new Date(), options: { force?: boolean } = {}) {
  await dbConnect();
  if (!options.force) {
    const hour = Number(academyTimeOfDay(now).split(":")[0]);
    if (hour < retentionSweepHour()) return { skipped: "before_sweep_hour" as const };
  }
  const dateKey = academyDateKey(now);
  if (!options.force) {
    if (await RetentionSweepRun.exists({ dateKey, finishedAt: { $exists: true } })) return { skipped: "already_ran" as const };
    // A crashed run is retried after an hour rather than waiting for tomorrow.
    // The unique index on dateKey settles two instances claiming at once.
    const stale = new Date(now.getTime() - 60 * 60_000);
    const claimed = await RetentionSweepRun.updateOne(
      { dateKey, finishedAt: { $exists: false }, startedAt: { $lt: stale } },
      { $set: { startedAt: now }, $setOnInsert: { dateKey } },
      { upsert: true }
    ).catch((error: any) => {
      if (error?.code === 11000) return { modifiedCount: 0, upsertedCount: 0 };
      throw error;
    });
    if (!claimed.modifiedCount && !claimed.upsertedCount) return { skipped: "already_ran" as const };
  }

  const snapshots = await loadStudentContexts(now);
  const summary = await syncFlags(snapshots, now);
  await RetentionSweepRun.updateOne({ dateKey }, { $set: { finishedAt: new Date(), summary }, $setOnInsert: { startedAt: now } }, { upsert: true });
  return summary;
}

type SweepSummary = { scored: number; opened: number; updated: number; recovered: number; left: number; tasks: number; tasksHeldBack: number; coachNotes: number };

async function syncFlags(contexts: Map<string, StudentContext>, now: Date): Promise<SweepSummary> {
  const summary: SweepSummary = { scored: contexts.size, opened: 0, updated: 0, recovered: 0, left: 0, tasks: 0, tasksHeldBack: 0, coachNotes: 0 };
  const lastCall = await lastConnectedCalls(Array.from(contexts.values()).map((context) => context.student._id));
  const open: any[] = await RetentionFlag.find({ status: "open" }).lean();
  const openByStudent = new Map(open.map((flag) => [idOf(flag.student), flag]));
  const quietSince = new Date(now.getTime() - SETTLED_QUIET_DAYS * DAY);
  const settled: any[] = await RetentionFlag.find({ status: "resolved", "resolution.auto": { $ne: true }, "resolution.at": { $gte: quietSince } })
    .select("student peakLevel level")
    .lean();
  const settledLevel = new Map<string, number>();
  settled.forEach((flag) => {
    const key = idOf(flag.student);
    settledLevel.set(key, Math.max(settledLevel.get(key) || 0, LEVEL_RANK[(flag.peakLevel || flag.level) as keyof typeof LEVEL_RANK] || 0));
  });

  for (const [studentId, context] of contexts) {
    const result = assessRisk(context.snapshot);
    const existing = openByStudent.get(studentId);
    openByStudent.delete(studentId);
    try {
      if (result.level === "none") {
        if (existing) {
          await settleFlag(existing, { outcome: "recovered", note: "The warning signs cleared.", auto: true });
          summary.recovered += 1;
        }
        continue;
      }
      // A family someone just spoke to is not re-flagged for the same signs.
      if (!existing && (settledLevel.get(studentId) || 0) >= LEVEL_RANK[result.level]) continue;
      const flag = await upsertFlag(existing, studentId, result, now);
      if (existing) summary.updated += 1;
      else summary.opened += 1;
      if (needsCall(result.level)) {
        const calledAt = lastCall.get(studentId) || null;
        if (recentlyCalled(calledAt, now)) {
          // Someone spoke to the family in the last 15 days: the flag shows on
          // the Retention Center, but nobody is asked to call them again yet.
          await RetentionFlag.updateOne({ _id: flag._id }, { $set: { taskSuppressedByCall: { at: now, callAt: calledAt } } });
          summary.tasksHeldBack += 1;
        } else {
          if (flag.taskSuppressedByCall) await RetentionFlag.updateOne({ _id: flag._id }, { $unset: { taskSuppressedByCall: 1 } });
          // A call closes the flag's task; once the quiet days are over and
          // the signs are still there, the same task comes back.
          await raiseRetentionRiskTask({ flag, student: context.student, level: result.level, reasons: result.reasons, reopen: Boolean(calledAt) });
          summary.tasks += 1;
        }
        if (!flag.coachNotifiedAt && (await notifyCoaches(flag, context, result))) summary.coachNotes += 1;
      }
    } catch (error) {
      console.error(`[retention] could not update the flag for student ${studentId}`, error);
    }
  }

  // Open flags for students the sweep no longer scores: left the academy, or out of every class.
  for (const flag of openByStudent.values()) {
    try {
      const student: any = await User.findById(flag.student).select("isActive exitReason").lean();
      if (!student || student.isActive === false) {
        await settleFlag(flag, { outcome: "left", note: student?.exitReason?.note || "The student was deactivated.", auto: true });
        summary.left += 1;
      } else {
        await settleFlag(flag, { outcome: "recovered", note: "No longer in a class to score.", auto: true });
        summary.recovered += 1;
      }
    } catch (error) {
      console.error(`[retention] could not close the flag ${idOf(flag)}`, error);
    }
  }
  return summary;
}

async function upsertFlag(existing: any, studentId: string, result: RiskResult, now: Date) {
  const level = result.level as "watch" | "at_risk" | "high";
  if (existing) {
    const peak = LEVEL_RANK[level] > LEVEL_RANK[(existing.peakLevel || existing.level) as keyof typeof LEVEL_RANK] ? level : existing.peakLevel || existing.level;
    return RetentionFlag.findByIdAndUpdate(
      existing._id,
      { $set: { level, peakLevel: peak, reasons: result.reasons, inWindow: result.inWindow, lastEvaluatedAt: now } },
      { new: true }
    ).lean() as Promise<any>;
  }
  try {
    const created = await RetentionFlag.create({
      student: new Types.ObjectId(studentId),
      status: "open",
      level,
      peakLevel: level,
      reasons: result.reasons,
      inWindow: result.inWindow,
      firstFlaggedAt: now,
      lastEvaluatedAt: now,
    });
    return created.toObject();
  } catch (error: any) {
    // Another instance opened it a moment ago; use theirs.
    if (error?.code === 11000) return RetentionFlag.findOne({ student: studentId, status: "open" }).lean() as Promise<any>;
    throw error;
  }
}

async function notifyCoaches(flag: any, context: StudentContext, result: RiskResult) {
  const note = coachHeadsUp(String(context.student.name || context.student.username || "Your student"), result.reasons);
  if (!note || !context.coachIds.length) return false;
  const claimed = await RetentionFlag.updateOne({ _id: flag._id, coachNotifiedAt: { $exists: false } }, { $set: { coachNotifiedAt: new Date() } });
  if (!claimed.modifiedCount) return false;
  await Notification.insertMany(context.coachIds.map((coachId) => ({
    user: new Types.ObjectId(coachId),
    type: "retention_heads_up",
    title: note.title,
    message: note.message,
    metadata: { studentId: idOf(context.student), flagId: idOf(flag) },
  })));
  return true;
}

export async function settleFlag(
  flag: any,
  input: { outcome: "stayed" | "paused" | "left" | "recovered" | "false_alarm"; note?: string; by?: unknown; byName?: string; auto?: boolean }
) {
  const updated = await RetentionFlag.findOneAndUpdate(
    { _id: flag._id, status: "open" },
    {
      $set: {
        status: "resolved",
        resolution: {
          outcome: input.outcome,
          note: input.note || "",
          by: input.by ? new Types.ObjectId(String(input.by)) : undefined,
          byName: input.byName || "",
          at: new Date(),
          auto: Boolean(input.auto),
        },
      },
    },
    { new: true }
  ).lean();
  if (updated) await resolveRetentionRiskTask(flag._id, input.by, outcomeNote(input.outcome, input.note));
  return updated;
}

function outcomeNote(outcome: string, note?: string) {
  const head = outcome === "stayed" ? "Family is staying."
    : outcome === "paused" ? "Family chose a pause."
    : outcome === "left" ? "Student left the academy."
    : outcome === "recovered" ? "The warning signs cleared."
    : "Not a real risk.";
  return note ? `${head} ${note}` : head;
}
