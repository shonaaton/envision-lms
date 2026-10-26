import "server-only";

import { academyDateTime } from "@/lib/academyTime";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { exitStudentId as idOf } from "@/lib/classroomStudentExits";
import { dbConnect } from "@/lib/db";
import {
  decideWeeklyMessage,
  engagementWeekKey,
  engagementWhatsAppEnabled,
  inSendWindow,
  portalLink,
  type WeeklyDecision,
  type WeeklySnapshot,
} from "@/lib/engagement/engagementRules";
import { STUDENT_FIELDS, loadWeeklySnapshots } from "@/lib/engagement/weeklySnapshot";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { templateUnavailable } from "@/lib/whatsappTemplateErrors";
import { EngagementMessage, EngagementWeekRun } from "@/models/EngagementMessage";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

// Reachable from instrumentation.ts: nothing here may import lib/studentPause.ts
// or lib/fees.ts (Node's crypto breaks the instrumentation bundle).

const CHUNK = 10;
/** A send that was claimed and never finished (a crash mid-chunk) is retried after this. */
const STALE_CLAIM_MS = 30 * 60_000;
/** Template-pending sends are retried each hour of the window, this many times. */
const MAX_ATTEMPTS = 5;

type Summary = { weekKey: string; considered: number; digest: number; nudge: number; skipped: Record<string, number>; sent: number; failed: number; templatePending: number };

/**
 * Hourly job. On Sunday evening (ENGAGEMENT_SEND_HOUR, 18:00 IST, until 22:00)
 * it sends each family one WhatsApp about the week: a progress digest, or a
 * practice nudge for a child who has gone quiet. Off unless
 * ENGAGEMENT_WHATSAPP_ENABLED=true. `force` ignores the switch, the window and
 * the week's "done" mark - for admins and tests; the per-student claim still
 * holds, so a forced run never sends a family a second message.
 */
export async function processWeeklyEngagement(now = new Date(), options: { force?: boolean } = {}) {
  if (!options.force && !engagementWhatsAppEnabled()) return { skipped: "disabled" as const };
  if (!options.force && !inSendWindow(now)) return { skipped: "outside_window" as const };
  await dbConnect();
  const weekKey = engagementWeekKey(now);
  if (!options.force && (await EngagementWeekRun.exists({ weekKey, finishedAt: { $exists: true } }))) return { skipped: "already_ran" as const };
  await EngagementWeekRun.updateOne({ weekKey }, { $setOnInsert: { weekKey, startedAt: now } }, { upsert: true }).catch((error: any) => {
    if (error?.code !== 11000) throw error;
  });

  const summary = await runWeek(weekKey, now);
  // Done for the week unless something is waiting on Meta; then the next hour tries again.
  if (!summary.templatePending) {
    await EngagementWeekRun.updateOne({ weekKey }, { $set: { finishedAt: new Date(), summary } });
  } else {
    await EngagementWeekRun.updateOne({ weekKey }, { $set: { summary } });
  }
  return summary;
}

async function runWeek(weekKey: string, now: Date): Promise<Summary> {
  const weekStart = academyDateTime(weekKey, "00:00");
  const previousWeekKey = engagementWeekKey(new Date(weekStart.getTime() - 12 * 60 * 60_000));
  const summary: Summary = { weekKey, considered: 0, digest: 0, nudge: 0, skipped: {}, sent: 0, failed: 0, templatePending: 0 };

  const students: any[] = await User.find({
    role: "student",
    accountStatus: { $ne: "demo" },
    isActive: { $ne: false },
    isPaused: { $ne: true },
    "engagementOptOut.optedOut": { $ne: true },
    phone: { $nin: [null, ""] },
  })
    .select(STUDENT_FIELDS)
    .lean();
  if (!students.length) return summary;

  const rows: any[] = await EngagementMessage.find({ weekKey: { $in: [weekKey, previousWeekKey] }, student: { $in: students.map((student) => student._id) } })
    .select("student weekKey kind status attempts updatedAt")
    .lean();
  const thisWeek = new Map(rows.filter((row) => row.weekKey === weekKey).map((row) => [idOf(row.student), row]));
  const lastWeekKind = new Map(rows.filter((row) => row.weekKey === previousWeekKey && row.status === "sent").map((row) => [idOf(row.student), row.kind]));

  const due = students.filter((student) => {
    const row = thisWeek.get(idOf(student));
    if (!row) return true;
    if (row.status === "template_pending") return Number(row.attempts || 0) < MAX_ATTEMPTS;
    return row.status === "claimed" && now.getTime() - new Date(row.updatedAt).getTime() > STALE_CLAIM_MS;
  });
  if (!due.length) return summary;

  const weeks = await loadWeeklySnapshots(due, weekStart, now);
  const portalUrl = resolvePublicAppUrl();
  const work: Array<{ student: any; decision: Exclude<WeeklyDecision, { kind: "skip" }>; snapshot: WeeklySnapshot }> = [];
  for (const student of due) {
    const week = weeks.get(idOf(student));
    if (!week) continue;
    summary.considered += 1;
    const existing = thisWeek.get(idOf(student));
    const decision = decideWeeklyMessage({
      audience: week.audience,
      snapshot: week.snapshot,
      now,
      previousKind: (lastWeekKind.get(idOf(student)) as any) || null,
      portalUrl,
    });
    if (decision.kind === "skip") {
      summary.skipped[decision.reason] = (summary.skipped[decision.reason] || 0) + 1;
      continue;
    }
    if (!(await claim(student, weekKey, decision, week.snapshot, existing, now))) continue;
    summary[decision.kind] += 1;
    work.push({ student, decision, snapshot: week.snapshot });
  }

  for (let index = 0; index < work.length; index += CHUNK) {
    await Promise.all(work.slice(index, index + CHUNK).map(async ({ student, decision, snapshot }) => {
      const outcome = await deliver(student, weekKey, decision, snapshot, portalUrl);
      if (outcome === "sent") summary.sent += 1;
      else if (outcome === "template_pending") summary.templatePending += 1;
      else summary.failed += 1;
    }));
  }
  return summary;
}

/**
 * Takes this week's slot for the student. A brand-new row is an insert that
 * only one caller can win; a retry flips an existing row back to "claimed"
 * only if it is still in the state we read.
 */
async function claim(student: any, weekKey: string, decision: Exclude<WeeklyDecision, { kind: "skip" }>, snapshot: WeeklySnapshot, existing: any, now: Date) {
  const fields = {
    kind: decision.kind,
    templateName: decision.templateName,
    bodyParameters: decision.bodyParameters,
    phone: String(student.phone || ""),
    snapshot: snapshotForRecord(snapshot),
  };
  if (!existing) {
    const result = await EngagementMessage.updateOne(
      { student: student._id, weekKey },
      { $setOnInsert: { student: student._id, weekKey, status: "claimed", attempts: 1, ...fields } },
      { upsert: true }
    ).catch((error: any) => {
      if (error?.code === 11000) return { upsertedCount: 0 };
      throw error;
    });
    return Boolean(result.upsertedCount);
  }
  const retry = await EngagementMessage.updateOne(
    { _id: existing._id, status: existing.status, updatedAt: existing.updatedAt },
    { $set: { status: "claimed", ...fields, updatedAt: now }, $inc: { attempts: 1 } }
  );
  return retry.modifiedCount > 0;
}

async function deliver(student: any, weekKey: string, decision: Exclude<WeeklyDecision, { kind: "skip" }>, snapshot: WeeklySnapshot, portalUrl: string) {
  const studentId = idOf(student);
  await notifyInApp(student, weekKey, decision, snapshot).catch((error) => console.error("weekly engagement in-app notice failed", { studentId, error }));
  const result = await sendWhatsAppAutomationTemplate({
    user: student,
    templateName: decision.templateName,
    bodyParameters: decision.bodyParameters,
    metadata: {
      kind: "weekly_engagement",
      event: decision.kind,
      studentId,
      recipientType: "parent",
      href: portalLink(portalUrl, decision.kind === "nudge" ? snapshot.task.href : "/dashboard"),
      notificationDedupKey: `engagement:${weekKey}:${studentId}`,
    },
  }).catch((error) => ({ ok: false, delivered: false, skipped: false, error: error instanceof Error ? error.message : String(error) }) as any);

  const status = result.delivered ? "sent" : templateUnavailable(result) ? "template_pending" : "failed";
  await EngagementMessage.updateOne(
    { student: student._id, weekKey },
    {
      $set: {
        status,
        error: status === "sent" ? "" : String(result.errorMessage || result.error || (result.debug as any)?.reason || "not_delivered"),
        metaMessageId: result.metaMessageId || "",
        ...(status === "sent" ? { sentAt: new Date() } : {}),
      },
    }
  );
  return status;
}

/** The same recap in the bell, so a family that never opens WhatsApp still sees it. */
async function notifyInApp(student: any, weekKey: string, decision: Exclude<WeeklyDecision, { kind: "skip" }>, snapshot: WeeklySnapshot) {
  const dedupKey = `engagement:${weekKey}`;
  const nudge = decision.kind === "nudge";
  const title = nudge ? "Time for a little chess practice" : "Your week at the academy";
  const message = nudge
    ? `It has been ${decision.idleDays} days since your last practice. Try ${snapshot.task.label}.`
    : `Classes: ${snapshot.classesAttended} of ${snapshot.classesScheduled}. Homework done: ${snapshot.homeworkSubmitted}. Puzzles and lessons solved: ${snapshot.puzzlesSolved + snapshot.lessonsCompleted}. XP earned: ${snapshot.xpEarned}.`;
  await Notification.updateOne(
    { user: student._id, "metadata.dedupKey": dedupKey },
    { $setOnInsert: { user: student._id, type: "weekly_progress", title, message, metadata: { dedupKey, href: nudge ? snapshot.task.href : "/dashboard", kind: decision.kind } } },
    { upsert: true }
  );
}

function snapshotForRecord(snapshot: WeeklySnapshot) {
  return {
    classesScheduled: snapshot.classesScheduled,
    classesAttended: snapshot.classesAttended,
    homeworkSubmitted: snapshot.homeworkSubmitted,
    puzzlesSolved: snapshot.puzzlesSolved,
    lessonsCompleted: snapshot.lessonsCompleted,
    xpEarned: snapshot.xpEarned,
    nextClassAt: snapshot.nextClassAt,
    task: snapshot.task,
  };
}
