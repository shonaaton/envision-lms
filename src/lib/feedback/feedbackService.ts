import "server-only";

import { Types } from "mongoose";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { hasStudentExited } from "@/lib/classroomStudentExits";
import { classroomTier } from "@/lib/courseTiers";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { feedbackEmailHtml, feedbackEmailSubject, feedbackEmailText } from "@/lib/feedback/feedbackEmail";
import {
  cycleDueAt,
  cycleOpensAt,
  academyMonthOf,
  isFeedbackMonth,
  monthBounds,
  monthLabel,
  openCycleMonth,
  shiftMonth,
} from "@/lib/feedback/feedbackCycleDates";
import { QUESTION_SET_VERSION } from "@/lib/feedback/feedbackQuestions";
import {
  COACH_EDITABLE_STATUSES,
  SKIP_REASONS,
  cleanRatings,
  isParentNoteComplete,
  isReviewer,
  missingForSubmit,
  serializeFeedback,
  type FeedbackActionInput,
  type FeedbackViewer,
} from "@/lib/feedback/feedbackRules";
import { resolveStudentContact } from "@/lib/studentContact";
import {
  raiseFeedbackReviewTask,
  raiseMonthlyFeedbackTask,
  reopenMonthlyFeedbackTask,
  resolveFeedbackReviewTask,
  resolveMonthlyFeedbackTask,
} from "@/lib/tasks/taskTriggers";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { FeedbackCycle } from "@/models/FeedbackCycle";
import { Notification } from "@/models/Fee";
import { MonthlyFeedback } from "@/models/MonthlyFeedback";
import { StudentPause } from "@/models/StudentPause";
import { User } from "@/models/User";

export class FeedbackError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function idOf(value: any) {
  if (!value) return "";
  return String(value._id ?? value);
}

function toObjectId(value: unknown) {
  const raw = idOf(value);
  return Types.ObjectId.isValid(raw) ? new Types.ObjectId(raw) : null;
}

const ATTENDED = ["present", "late"];
const NOT_HELD = ["cancelled", "rescheduled", "coach_no_show"];

// ---------------------------------------------------------------------------
// Month stats (attendance + topics), computed - never typed by the coach
// ---------------------------------------------------------------------------

async function classroomFamilyIds(classroom: any) {
  const instances: any[] = await Classroom.find({ parentClassroom: classroom._id, isSessionInstance: true }).select("_id").lean();
  return [classroom._id, ...instances.map((row) => row._id)];
}

export async function computeMonthStats(classroom: any, studentId: string, month: string) {
  const { start, end } = monthBounds(month);
  const classroomIds = await classroomFamilyIds(classroom);
  const student = toObjectId(studentId);
  const rows: any[] = await Attendance.aggregate([
    { $match: { classroom: { $in: classroomIds }, sessionDate: { $gte: start, $lte: end } } },
    { $unwind: "$records" },
    { $match: { "records.student": student } },
    {
      $group: {
        _id: null,
        attended: { $sum: { $cond: [{ $in: ["$records.status", ATTENDED] }, 1, 0] } },
        held: { $sum: { $cond: [{ $in: ["$records.status", ["excused", "coach_no_show", "coach_no_show_pending", "technical_issue"]] }, 0, 1] } },
      },
    },
  ]);
  const sessions = (classroom.generatedSessions || []).filter((session: any) => {
    const at = new Date(session.scheduledFor || 0);
    if (at < start || at > end) return false;
    const roster = (session.students || []).map(idOf);
    return !roster.length || roster.includes(studentId);
  });
  const scheduled = sessions.filter((session: any) => !NOT_HELD.includes(String(session.status || ""))).length;
  const topics = Array.from(
    new Set(
      sessions
        .filter((session: any) => session.status === "completed" && session.topicName)
        .map((session: any) => String(session.topicName).trim())
    )
  ) as string[];
  const attended = Number(rows[0]?.attended || 0);
  const held = Number(rows[0]?.held || 0);
  return {
    classesAttended: attended,
    // Registers are the truth once marked; the schedule covers the rest of the month.
    classesScheduled: Math.max(held, scheduled, attended),
    topicsCovered: topics.slice(0, 20),
  };
}

// ---------------------------------------------------------------------------
// The monthly sweep
// ---------------------------------------------------------------------------

async function ensureCycle(month: string) {
  return FeedbackCycle.findOneAndUpdate(
    { month },
    { $setOnInsert: { month, opensAt: cycleOpensAt(month), dueAt: cycleDueAt(month) } },
    { upsert: true, new: true }
  ).lean<any>();
}

/**
 * Creates the month's empty reports and the coach tasks for them. Swept hourly
 * from the 25th until the due date, so a restart cannot miss it and a student
 * who joins a class late in the month still gets a report. Idempotent: the
 * unique {month, student, coach} index makes every re-run a no-op for reports
 * that already exist.
 */
export async function processMonthlyFeedbackCycle(now = new Date(), options: { month?: string } = {}) {
  const month = options.month || openCycleMonth(now);
  if (!month) return { month: null, created: 0 };
  await dbConnect();
  const cycle = await ensureCycle(month);
  const { start, end } = monthBounds(month);
  const label = monthLabel(month);

  const classrooms: any[] = await Classroom.find({
    isActive: { $ne: false },
    isTestClassroom: { $ne: true },
    isSessionInstance: { $ne: true },
    classroomType: { $ne: "demo" },
    status: { $ne: "cancelled" },
    $and: [
      { $or: [{ coach: { $ne: null } }, { instructor: { $ne: null } }] },
      { $or: [{ "generatedSessions.scheduledFor": { $gte: start, $lte: end } }, { classDate: { $gte: start, $lte: end } }] },
    ],
  })
    .select("title level levelName courseName coach instructor students studentExits closedForStudents generatedSessions")
    .lean();
  if (!classrooms.length) return { month, created: 0 };

  // Read directly rather than via studentPause.ts: that module pulls in the fees
  // code (and Node's crypto), which the instrumentation bundle cannot load.
  const pauses: any[] = await StudentPause.find({ status: "active" }).select("student").lean();
  const paused = new Set(pauses.map((row) => idOf(row.student)));
  const studentIds = Array.from(new Set(classrooms.flatMap((row) => (row.students || []).map(idOf))));
  const coachIds = Array.from(new Set(classrooms.map((row) => idOf(row.coach || row.instructor))));
  const people: any[] = await User.find({ _id: { $in: [...studentIds, ...coachIds] } }).select("name username role isActive").lean();
  const byId = new Map(people.map((person) => [idOf(person), person]));

  const createdByCoach = new Map<string, number>();
  let created = 0;

  for (const classroom of classrooms) {
    const coachId = idOf(classroom.coach || classroom.instructor);
    const coach = byId.get(coachId);
    if (!coach || coach.isActive === false) continue;
    const closed = new Set((classroom.closedForStudents || []).map(idOf));
    for (const studentId of (classroom.students || []).map(idOf)) {
      const student = byId.get(studentId);
      if (!student || student.role !== "student" || student.isActive === false) continue;
      if (paused.has(studentId) || closed.has(studentId) || hasStudentExited(classroom, studentId)) continue;

      const exists = await MonthlyFeedback.exists({ month, student: studentId, coach: coachId });
      if (exists) continue;
      const stats = await computeMonthStats(classroom, studentId, month);
      const result: any = await MonthlyFeedback.findOneAndUpdate(
        { month, student: studentId, coach: coachId },
        {
          $setOnInsert: {
            month,
            student: studentId,
            coach: coachId,
            classroom: classroom._id,
            cycle: cycle?._id,
            tier: classroomTier(classroom.level),
            questionSetVersion: QUESTION_SET_VERSION,
            studentName: String(student.name || student.username || "Student"),
            coachName: String(coach.name || coach.username || "Coach"),
            courseName: String(classroom.courseName || classroom.title || ""),
            levelName: String(classroom.levelName || ""),
            stats,
            status: "pending",
            dueAt: cycle?.dueAt || cycleDueAt(month),
          },
        },
        { upsert: true, new: true, includeResultMetadata: true }
      );
      if (!result?.lastErrorObject?.upserted) continue;
      created += 1;
      createdByCoach.set(coachId, (createdByCoach.get(coachId) || 0) + 1);
      await raiseMonthlyFeedbackTask({ feedback: result.value, monthLabel: label, silent: true });
    }
  }

  const dueLabel = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(cycle?.dueAt || cycleDueAt(month));
  for (const [coachId, count] of Array.from(createdByCoach.entries())) {
    await notifyCoachOfNewReports({ coachId, count, month, label, dueLabel }).catch((error) => console.error("[feedback] coach notice failed", error));
  }
  await FeedbackCycle.updateOne({ _id: cycle?._id }, { $set: { lastSweepAt: new Date() } });
  return { month, created };
}

/**
 * An admin opening a month by hand - for the month a feature launches after
 * the 25th, or to pick up students added since the last sweep. Limited to the
 * current academy month (even before the 25th) or the cycle still open, so
 * nobody can back-fill reports for a month long gone.
 */
export async function generateFeedbackNow(viewer: FeedbackViewer, month?: string) {
  if (!isReviewer(viewer)) throw new FeedbackError("Only admins can generate feedback.", 403);
  const now = new Date();
  const allowed = Array.from(new Set([academyMonthOf(now), openCycleMonth(now)].filter(Boolean))) as string[];
  const target = month && isFeedbackMonth(month) ? month : openCycleMonth(now) || academyMonthOf(now);
  if (!allowed.includes(target)) throw new FeedbackError(`Reports can only be generated for ${allowed.map(monthLabel).join(" or ")}.`);
  return processMonthlyFeedbackCycle(now, { month: target });
}

async function notifyCoachOfNewReports(input: { coachId: string; count: number; month: string; label: string; dueLabel: string }) {
  const coach: any = await User.findById(input.coachId).select("name email").lean();
  if (!coach) return;
  const title = `${input.label} feedback: ${input.count} student${input.count === 1 ? "" : "s"} due by ${input.dueLabel}`;
  const message = `It's feedback time. Rate each student's month in a few taps - it takes under a minute per student. Due by ${input.dueLabel}.`;
  const href = `/feedback?month=${input.month}`;
  await Notification.create({ user: coach._id, type: "monthly_feedback", title, message, metadata: { href, month: input.month } });
  if (coach.email) {
    const appUrl = resolvePublicAppUrl();
    await sendAutomationEmail({
      to: String(coach.email),
      subject: title,
      message: [`Hello ${coach.name || "Coach"},`, "", message, "", appUrl ? `Open feedback: ${appUrl}${href}` : ""].filter(Boolean).join("\n"),
      metadata: { kind: "monthly_feedback_due", month: input.month, href, actionLabel: "Open Feedback" },
    });
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type FeedbackListFilter = { month?: string; status?: string; coach?: string; q?: string };

export async function listFeedback(viewer: FeedbackViewer, filter: FeedbackListFilter) {
  await dbConnect();
  const scope: Record<string, any> = {};
  if (viewer.role === "instructor") scope.coach = toObjectId(viewer.id);
  else if (viewer.role === "student") Object.assign(scope, { student: toObjectId(viewer.id), status: "sent" });

  const months: string[] = (await MonthlyFeedback.distinct("month", scope)).filter(isFeedbackMonth).sort().reverse();
  const month = isFeedbackMonth(filter.month) ? filter.month : viewer.role === "student" ? "" : months[0] || openCycleMonth(new Date()) || "";

  const query: Record<string, any> = { ...scope };
  if (month) query.month = month;
  const staff = viewer.role === "admin" || viewer.role === "sub-admin";
  if (staff && filter.coach && Types.ObjectId.isValid(filter.coach)) query.coach = new Types.ObjectId(filter.coach);
  if (filter.q) query.studentName = { $regex: filter.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

  const docs: any[] = await MonthlyFeedback.find(query).sort({ month: -1, studentName: 1 }).limit(1500).lean();

  const counts: Record<string, number> = {};
  for (const doc of docs) counts[doc.status] = (counts[doc.status] || 0) + 1;
  const items = docs
    .filter((doc) => !filter.status || filter.status === "all" || doc.status === filter.status)
    .map((doc) => serializeFeedback(doc, viewer))
    .filter(Boolean);

  // A coach starts from last month's ratings, so they only tap what changed.
  let previous: Record<string, Record<string, number>> = {};
  if (viewer.role === "instructor" && month) {
    const prior: any[] = await MonthlyFeedback.find({ coach: scope.coach, month: shiftMonth(month, -1), status: { $in: ["submitted", "approved", "sent"] } })
      .select("student ratings")
      .lean();
    previous = Object.fromEntries(prior.map((doc) => [idOf(doc.student), doc.ratings instanceof Map ? Object.fromEntries(doc.ratings) : { ...(doc.ratings || {}) }]));
  }

  // Per-coach progress for the admin overview (all statuses, ignoring the tab).
  let coaches: { id: string; name: string; total: number; done: number; waiting: number; overdue: number }[] = [];
  if (staff) {
    const now = Date.now();
    const byCoach = new Map<string, { id: string; name: string; total: number; done: number; waiting: number; overdue: number }>();
    const monthDocs = filter.coach || filter.q ? await MonthlyFeedback.find(month ? { month } : {}).select("coach coachName status dueAt").lean<any[]>() : docs;
    for (const doc of monthDocs) {
      const id = idOf(doc.coach);
      const row = byCoach.get(id) || { id, name: String(doc.coachName || "Coach"), total: 0, done: 0, waiting: 0, overdue: 0 };
      row.total += 1;
      if (["submitted", "approved", "sent", "skipped"].includes(doc.status)) row.done += 1;
      else {
        row.waiting += 1;
        if (doc.dueAt && new Date(doc.dueAt).getTime() < now) row.overdue += 1;
      }
      byCoach.set(id, row);
    }
    coaches = Array.from(byCoach.values()).sort((a, b) => b.waiting - a.waiting || a.name.localeCompare(b.name));
  }

  const cycle: any = month ? await FeedbackCycle.findOne({ month }).select("dueAt").lean() : null;
  return {
    month,
    monthLabel: month ? monthLabel(month) : "",
    dueAt: cycle?.dueAt ? new Date(cycle.dueAt).toISOString() : month ? cycleDueAt(month).toISOString() : null,
    months,
    counts,
    items,
    previous,
    coaches,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function loadForAction(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new FeedbackError("Feedback not found.", 404);
  await dbConnect();
  const doc: any = await MonthlyFeedback.findById(id);
  if (!doc) throw new FeedbackError("Feedback not found.", 404);
  return doc;
}

async function syncReviewTask(month: string, by?: unknown) {
  const cycle: any = await FeedbackCycle.findOne({ month }).lean();
  if (!cycle) return;
  const waiting = await MonthlyFeedback.countDocuments({ month, status: "submitted" });
  if (waiting > 0) await raiseFeedbackReviewTask({ cycle, monthLabel: monthLabel(month), waiting });
  else await resolveFeedbackReviewTask(cycle._id, by);
}

export async function applyFeedbackAction(id: string, input: FeedbackActionInput, viewer: FeedbackViewer) {
  const doc = await loadForAction(id);
  const isCoach = viewer.role === "instructor" && idOf(doc.coach) === viewer.id;
  const reviewer = isReviewer(viewer);
  const label = monthLabel(doc.month);

  switch (input.action) {
    case "save_draft":
    case "submit": {
      if (!isCoach && !reviewer) throw new FeedbackError("Only the student's coach can fill in this report.", 403);
      if (isCoach && viewer.canEdit === false) throw new FeedbackError("You do not have permission to submit feedback.", 403);
      if (!COACH_EDITABLE_STATUSES.includes(doc.status) && !(reviewer && doc.status === "submitted")) {
        throw new FeedbackError("This report has already been submitted.", 409);
      }
      const ratings = cleanRatings(doc.tier, input.ratings);
      doc.ratings = ratings;
      doc.highlights = input.highlights;
      doc.focusAreas = input.focusAreas;
      doc.parentNote = input.parentNote;
      doc.internalNote = input.internalNote;
      if (input.action === "submit") {
        const missing = missingForSubmit(doc.tier, { ratings, parentNote: input.parentNote });
        if (missing.length) throw new FeedbackError(`Add ${missing.join(", ")} before submitting.`);
        doc.status = "submitted";
        doc.submittedAt = new Date();
        doc.reviewNote = "";
      } else if (doc.status === "pending") {
        doc.status = "draft";
      }
      await doc.save();
      if (input.action === "submit") {
        await resolveMonthlyFeedbackTask(doc._id, viewer.id);
        await syncReviewTask(doc.month, viewer.id);
      }
      break;
    }
    case "skip": {
      if (!isCoach && !reviewer) throw new FeedbackError("Only the student's coach can skip this report.", 403);
      if (!COACH_EDITABLE_STATUSES.includes(doc.status)) throw new FeedbackError("This report has already been submitted.", 409);
      const reason = SKIP_REASONS.find((row) => row.value === input.reason)?.label || input.reason;
      doc.status = "skipped";
      doc.skipReason = [reason, input.note].filter(Boolean).join(" - ");
      await doc.save();
      await resolveMonthlyFeedbackTask(doc._id, viewer.id, `Skipped: ${doc.skipReason}`);
      break;
    }
    case "approve": {
      if (!reviewer) throw new FeedbackError("Only admins can approve feedback.", 403);
      if (!["submitted", "approved"].includes(doc.status)) throw new FeedbackError("Only submitted reports can be approved.", 409);
      if (typeof input.parentNote === "string") doc.parentNote = input.parentNote;
      // Reports submitted before the note became required may still lack one.
      if (!isParentNoteComplete(doc.parentNote)) throw new FeedbackError("Write the note for parents before approving.");
      doc.status = "approved";
      doc.reviewedBy = toObjectId(viewer.id);
      doc.reviewedAt = new Date();
      await doc.save();
      await releaseToFamily(doc);
      await syncReviewTask(doc.month, viewer.id);
      break;
    }
    case "request_changes": {
      if (!reviewer) throw new FeedbackError("Only admins can send feedback back.", 403);
      if (doc.status !== "submitted") throw new FeedbackError("Only submitted reports can be sent back.", 409);
      doc.status = "changes_requested";
      doc.reviewNote = input.note;
      doc.reviewedBy = toObjectId(viewer.id);
      doc.reviewedAt = new Date();
      await doc.save();
      await reopenMonthlyFeedbackTask({ feedback: doc, monthLabel: label, note: input.note });
      await syncReviewTask(doc.month, viewer.id);
      break;
    }
    case "resend": {
      if (!reviewer) throw new FeedbackError("Only admins can resend feedback.", 403);
      if (!["approved", "sent"].includes(doc.status)) throw new FeedbackError("Only approved reports can be sent.", 409);
      await releaseToFamily(doc, { resend: true });
      break;
    }
    case "reopen": {
      if (!reviewer) throw new FeedbackError("Only admins can reopen feedback.", 403);
      if (doc.status !== "skipped") throw new FeedbackError("Only skipped reports can be reopened.", 409);
      doc.status = "pending";
      doc.skipReason = "";
      await doc.save();
      await reopenMonthlyFeedbackTask({ feedback: doc, monthLabel: label, note: "This report was reopened - please fill it in." });
      break;
    }
  }
  const fresh: any = await MonthlyFeedback.findById(doc._id).lean();
  return serializeFeedback(fresh, viewer);
}

export async function bulkApprove(ids: string[], viewer: FeedbackViewer) {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    try {
      await applyFeedbackAction(id, { action: "approve" }, viewer);
      results.push({ id, ok: true });
    } catch (error) {
      results.push({ id, ok: false, error: error instanceof Error ? error.message : "Failed" });
    }
  }
  return results;
}

/**
 * Makes an approved report visible to the student and emails it to the family.
 * The report is released even when the email fails - the family can still read
 * it in the portal, and the admin sees the email error with a Resend button.
 */
async function releaseToFamily(doc: any, options: { resend?: boolean } = {}) {
  const month = String(doc.month);
  // Refresh the numbers: approval happens after the month has closed, when the
  // last registers are in.
  const classroom: any = doc.classroom ? await Classroom.findById(doc.classroom).select("generatedSessions").lean() : null;
  if (classroom && !options.resend) {
    doc.stats = await computeMonthStats(classroom, idOf(doc.student), month).catch(() => doc.stats);
  }

  const student: any = await User.findById(doc.student).select("name username email parentName parentEmail").lean();
  const contact = resolveStudentContact(student || { name: doc.studentName });
  const view = serializeFeedback({ ...(doc.toObject?.() || doc), status: "sent" }, { id: idOf(doc.student), role: "student" })!;
  const appUrl = resolvePublicAppUrl();
  const portalUrl = appUrl ? `${appUrl}/feedback?month=${month}` : "";

  let emailError = "";
  if (!contact.email) {
    emailError = "No parent or student email on file.";
  } else {
    const input = { parentName: contact.parentName || contact.contactName, portalUrl };
    const result: any = await sendAutomationEmail({
      to: contact.email,
      subject: feedbackEmailSubject(view),
      message: feedbackEmailText(view, input),
      htmlBody: feedbackEmailHtml(view, input),
      htmlIsFinal: true,
      metadata: { kind: "monthly_feedback_report", feedbackId: idOf(doc), month, recipientType: contact.emailSource },
    }).catch(() => ({ ok: false }));
    if (!result?.ok) emailError = result?.skipped ? "Email is not configured." : "The email could not be delivered.";
  }

  const firstRelease = doc.status !== "sent";
  doc.status = "sent";
  doc.sentAt = doc.sentAt || new Date();
  doc.emailTo = contact.email;
  doc.emailError = emailError;
  await doc.save();

  if (firstRelease && student?._id) {
    await Notification.create({
      user: student._id,
      type: "monthly_feedback",
      title: `Your ${monthLabel(month)} progress report is ready`,
      message: `${doc.coachName ? `Coach ${doc.coachName}` : "Your coach"} shared how your month went. Take a look!`,
      metadata: { href: `/feedback?month=${month}`, feedbackId: idOf(doc) },
    }).catch(() => null);
  }
}

