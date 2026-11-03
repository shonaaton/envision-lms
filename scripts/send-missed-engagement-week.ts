/**
 * One-off catch-up for a weekly engagement Sunday that never went out (the
 * switch was off). Counts the missed Monday-Sunday week, but reads "next
 * class", the suggested task and idle days as of now, so a late message never
 * names a class that has already happened.
 *
 * Dry run by default; `--apply` sends. Uses the job's {student, weekKey} slot,
 * so a family can never get two messages for the same week.
 *
 *   WEEK=2026-10-26 node send-missed-engagement-week.js [--apply]
 */
import { academyDateTime } from "@/lib/academyTime";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { exitStudentId as idOf } from "@/lib/classroomStudentExits";
import { dbConnect } from "@/lib/db";
import { decideWeeklyMessage, engagementWeekKey, portalLink } from "@/lib/engagement/engagementRules";
import { STUDENT_FIELDS, loadWeeklySnapshots } from "@/lib/engagement/weeklySnapshot";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { templateUnavailable } from "@/lib/whatsappTemplateErrors";
import { EngagementMessage, EngagementWeekRun } from "@/models/EngagementMessage";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");
const WEEK = String(process.env.WEEK || "");
const CHUNK = 10;

async function main() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(WEEK) || engagementWeekKey(academyDateTime(WEEK, "12:00")) !== WEEK) throw new Error(`WEEK must be a Monday, got "${WEEK}"`);
  const now = new Date();
  const weekStart = academyDateTime(WEEK, "00:00");
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000 - 1);
  if (weekEnd > now) throw new Error("That week has not finished yet");
  const previousWeekKey = engagementWeekKey(new Date(weekStart.getTime() - 12 * 60 * 60_000));
  await dbConnect();

  const students: any[] = await User.find({
    role: "student",
    accountStatus: { $ne: "demo" },
    isActive: { $ne: false },
    isPaused: { $ne: true },
    "engagementOptOut.optedOut": { $ne: true },
    phone: { $nin: [null, ""] },
  }).select(STUDENT_FIELDS).lean();

  const rows: any[] = await EngagementMessage.find({ weekKey: { $in: [WEEK, previousWeekKey] } }).select("student weekKey kind status").lean();
  const taken = new Set(rows.filter((row) => row.weekKey === WEEK).map((row) => idOf(row.student)));
  const lastWeekKind = new Map(rows.filter((row) => row.weekKey === previousWeekKey && row.status === "sent").map((row) => [idOf(row.student), row.kind]));
  const due = students.filter((student) => !taken.has(idOf(student)));

  const [past, current] = await Promise.all([loadWeeklySnapshots(due, weekStart, weekEnd), loadWeeklySnapshots(due, weekStart, now)]);
  const portalUrl = resolvePublicAppUrl();
  const skipped: Record<string, number> = {};
  const work: any[] = [];
  for (const student of due) {
    const week = past.get(idOf(student));
    const today = current.get(idOf(student));
    if (!week || !today) continue;
    const snapshot = {
      ...week.snapshot,
      nextClassAt: today.snapshot.nextClassAt,
      task: today.snapshot.task,
      lastActivityAt: today.snapshot.lastActivityAt,
      lastSeenAt: today.snapshot.lastSeenAt,
    };
    const decision = decideWeeklyMessage({ audience: today.audience, snapshot, now, previousKind: (lastWeekKind.get(idOf(student)) as any) || null, portalUrl });
    if (decision.kind === "skip") {
      skipped[decision.reason] = (skipped[decision.reason] || 0) + 1;
      continue;
    }
    work.push({ student, decision, snapshot });
  }

  const digest = work.filter((item) => item.decision.kind === "digest");
  const nudge = work.filter((item) => item.decision.kind === "nudge");
  console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", week: WEEK, students: students.length, alreadyTaken: taken.size, digest: digest.length, nudge: nudge.length, skipped }, null, 1));
  for (const item of [...digest.slice(0, 3), ...nudge.slice(0, 2)]) console.log(item.decision.kind, JSON.stringify(item.decision.bodyParameters));
  if (!APPLY) return;

  await EngagementWeekRun.updateOne({ weekKey: WEEK }, { $setOnInsert: { weekKey: WEEK, startedAt: now } }, { upsert: true });
  const result = { sent: 0, failed: 0, templatePending: 0, lostClaim: 0, errors: {} as Record<string, number> };
  for (let index = 0; index < work.length; index += CHUNK) {
    await Promise.all(work.slice(index, index + CHUNK).map(async ({ student, decision, snapshot }) => {
      const claimed = await EngagementMessage.updateOne(
        { student: student._id, weekKey: WEEK },
        { $setOnInsert: { student: student._id, weekKey: WEEK, status: "claimed", attempts: 1, kind: decision.kind, templateName: decision.templateName, bodyParameters: decision.bodyParameters, phone: String(student.phone || ""), snapshot } },
        { upsert: true }
      ).catch((error: any) => (error?.code === 11000 ? { upsertedCount: 0 } : Promise.reject(error)));
      if (!claimed.upsertedCount) return void (result.lostClaim += 1);

      const studentId = idOf(student);
      const dedupKey = `engagement:${WEEK}`;
      const isNudge = decision.kind === "nudge";
      await Notification.updateOne(
        { user: student._id, "metadata.dedupKey": dedupKey },
        {
          $setOnInsert: {
            user: student._id,
            type: "weekly_progress",
            title: isNudge ? "Time for a little chess practice" : "Your week at the academy",
            message: isNudge
              ? `It has been ${decision.idleDays} days since your last practice. Try ${snapshot.task.label}.`
              : `Classes: ${snapshot.classesAttended} of ${snapshot.classesScheduled}. Homework done: ${snapshot.homeworkSubmitted}. Puzzles and lessons solved: ${snapshot.puzzlesSolved + snapshot.lessonsCompleted}. XP earned: ${snapshot.xpEarned}.`,
            metadata: { dedupKey, href: isNudge ? snapshot.task.href : "/dashboard", kind: decision.kind },
          },
        },
        { upsert: true }
      ).catch(() => undefined);

      const sent: any = await sendWhatsAppAutomationTemplate({
        user: student,
        templateName: decision.templateName,
        bodyParameters: decision.bodyParameters,
        metadata: {
          kind: "weekly_engagement",
          event: decision.kind,
          studentId,
          recipientType: "parent",
          href: portalLink(portalUrl, isNudge ? snapshot.task.href : "/dashboard"),
          notificationDedupKey: `engagement:${WEEK}:${studentId}`,
        },
      }).catch((error) => ({ delivered: false, error: error instanceof Error ? error.message : String(error) }));
      const status = sent.delivered ? "sent" : templateUnavailable(sent) ? "template_pending" : "failed";
      const error = status === "sent" ? "" : String(sent.errorMessage || sent.error || sent.debug?.reason || "not_delivered");
      await EngagementMessage.updateOne(
        { student: student._id, weekKey: WEEK },
        { $set: { status, error, metaMessageId: sent.metaMessageId || "", ...(status === "sent" ? { sentAt: new Date() } : {}) } }
      );
      if (status === "sent") result.sent += 1;
      else if (status === "template_pending") result.templatePending += 1;
      else {
        result.failed += 1;
        result.errors[error.slice(0, 80)] = (result.errors[error.slice(0, 80)] || 0) + 1;
      }
    }));
  }
  await EngagementWeekRun.updateOne({ weekKey: WEEK }, { $set: { finishedAt: new Date(), summary: { weekKey: WEEK, catchUp: true, digest: digest.length, nudge: nudge.length, skipped, ...result } } });
  console.log(JSON.stringify(result, null, 1));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => undefined));
