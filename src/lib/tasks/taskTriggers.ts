import "server-only";

import { formatAcademyDateTime } from "@/lib/academyTime";
import {
  cancelAutoTask,
  ensureAutoTask,
  reassignAutoTasks,
  resolveAutoTask,
  resolveAutoTasksWhere,
  type AutoTaskInput,
} from "@/lib/tasks/taskService";
import { dbConnect } from "@/lib/db";
import { OPEN_TASK_STATUSES } from "@/lib/tasks/taskRules";
import { InternalTask } from "@/models/InternalTask";
import { User } from "@/models/User";

export function raisePtmApprovalTask(ptm: any) {
  return raise({ kind: "ptm_approval", referenceType: "PtmApproval", referenceId: ptm._id, assignedTo: ptm.coach,
    title: `Approve PTM — ${ptm.studentName}`, details: `Preferred: ${when(ptm.preferredAt)}. ${ptm.preferredNote || ""}\nTopic: ${ptm.reason}`,
    actionHref: "/ptm?tab=requested", dueAt: new Date(new Date(ptm.createdAt).getTime() + 48 * 3600_000) });
}
export function resolvePtmApprovalTask(id: unknown, by?: unknown) { return settle("PtmApproval", id, by, "PTM reviewed."); }
export function raisePtmScheduleTask(ptm: any) {
  return raise({ kind: "ptm_schedule", referenceType: "PtmSchedule", referenceId: ptm._id, pool: "admins",
    title: `Confirm PTM timing & add Meet link — ${ptm.studentName} with ${ptm.coachName}`,
    details: `Preferred: ${when(ptm.preferredAt)}. ${ptm.preferredNote || ""}\nTopic: ${ptm.reason}`,
    actionHref: `/ptm?tab=to_schedule&id=${idOf(ptm)}` });
}
export function resolvePtmScheduleTask(id: unknown, by?: unknown) { return settle("PtmSchedule", id, by, "PTM scheduled."); }
export async function cancelPtmTasks(id: unknown, reason: string) { await withdraw("PtmApproval", id, reason); await withdraw("PtmSchedule", id, reason); }

/**
 * An approved coach leave: admins arrange a substitute for each class on it.
 * Settled by `syncLeaveCoverage` once every class is taught by someone else,
 * cancelled or moved off the day. `reopen` is passed only when classes were
 * added to the leave after the task closed. The leave's own notice already
 * emails and WhatsApps the admins, so the task itself stays quiet.
 */
export function raiseLeaveSubstitutionTask(leave: any, options: { reopen?: boolean } = {}) {
  const sessions: any[] = [...(leave.sessions || [])].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  if (!sessions.length) return Promise.resolve(null);
  return raise({
    kind: "leave_substitution", referenceType: "LeaveSubstitution", referenceId: leave._id, pool: "admins", priority: "high",
    title: `Arrange substitutes — ${leave.applicantName || "Coach"} on leave ${when(leave.startsAt).split(",")[0] || leave.dateKey}`,
    details: [`${leave.applicantName || "The coach"} has approved ${leave.type === "full_day" ? "full-day" : "half-day"} leave on ${leave.dateKey}.`, "Classes needing a substitute:", ...sessions.map((s) => `• ${when(s.start)} — ${s.title || "Class"}`)].join("\n"),
    actionHref: `/leave?id=${idOf(leave)}`, dueAt: sessions[0]?.start ? new Date(sessions[0].start) : null,
    metadata: { leaveId: idOf(leave), applicantId: idOf(leave.applicant) }, reopenIfClosed: Boolean(options.reopen), notify: false,
  });
}
export function resolveLeaveSubstitutionTask(id: unknown, by?: unknown, note = "Every class on the leave is covered.") { return settle("LeaveSubstitution", id, by, note); }
export function cancelLeaveSubstitutionTask(id: unknown, reason: string) { return withdraw("LeaveSubstitution", id, reason); }

/**
 * One function per app event that should put work in someone's Tasks list,
 * and one per event that settles it. Every function here swallows its own
 * failure: a task is bookkeeping, and must never break the real action it
 * rides on (the same rule as `recordActivity`).
 */

function idOf(value: any): string {
  if (!value) return "";
  return String(value._id ?? value);
}

function nameOf(value: any, fallback: string) {
  return String(value?.name || value?.username || fallback);
}

function when(value: unknown) {
  try {
    return value ? formatAcademyDateTime(value as Date, { timeZoneName: "short" }) : "";
  } catch {
    return "";
  }
}

async function raise(input: AutoTaskInput) {
  try {
    return await ensureAutoTask(input);
  } catch (error) {
    console.error(`[tasks] could not raise ${input.kind}`, error);
    return null;
  }
}

async function settle(referenceType: string, referenceId: unknown, by?: unknown, note?: string) {
  try {
    return await resolveAutoTask(referenceType, referenceId, { by, note });
  } catch (error) {
    console.error(`[tasks] could not resolve ${referenceType}`, error);
    return null;
  }
}

async function settleWhere(kind: string, match: Record<string, string>, by?: unknown, note?: string) {
  try {
    return await resolveAutoTasksWhere(kind, match, { by, note });
  } catch (error) {
    console.error(`[tasks] could not resolve ${kind}`, error);
    return 0;
  }
}

async function withdraw(referenceType: string, referenceId: unknown, reason: string) {
  try {
    return await cancelAutoTask(referenceType, referenceId, reason);
  } catch (error) {
    console.error(`[tasks] could not cancel ${referenceType}`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sales & demos
// ---------------------------------------------------------------------------

/** The demo request task ("DemoBooking") already exists; confirming the demo settles it. */
export function resolveDemoRequestTask(bookingId: unknown, by?: unknown) {
  return settle("DemoBooking", bookingId, by, "Demo was confirmed.");
}

/** A demo account that never booked: the lead owner should call. Recurs if the lead goes quiet again. */
export function raiseLeadFollowUpTask(input: { student: any; ownerId: unknown; hours: number }) {
  const studentId = idOf(input.student);
  return raise({
    kind: "lead_follow_up",
    referenceType: "LeadFollowUp",
    referenceId: studentId,
    title: `Follow up: ${nameOf(input.student, "demo lead")} hasn't booked a demo`,
    details: `The demo account was created more than ${input.hours} hour(s) ago and no demo has been requested yet. Call the family and help them pick a slot.`,
    assignedTo: input.ownerId,
    pool: "sales",
    priority: "high",
    actionHref: "/dashboard",
    metadata: { studentId },
  });
}

/** Any new demo booking for a student settles their follow-up and rebook tasks. */
export async function resolveLeadTasksOnBooking(studentId: unknown, by?: unknown) {
  const id = idOf(studentId);
  if (!id) return;
  await settle("LeadFollowUp", id, by, "The student requested a demo.");
  await settleWhere("demo_rebook", { studentId: id }, by, "A new demo was booked.");
}

export function raiseDemoRebookTask(input: { booking: any; student: any; ownerId?: unknown; reason: string }) {
  const studentId = idOf(input.student || input.booking?.student);
  return raise({
    kind: "demo_rebook",
    referenceType: "DemoRebook",
    referenceId: idOf(input.booking),
    title: `Rebook demo for ${nameOf(input.student, "the student")}`,
    details: `The demo on ${when(input.booking?.startAt) || "the scheduled date"} was ${input.reason}. Contact the family and set up a new slot.`,
    assignedTo: input.ownerId || input.booking?.salesOwner,
    pool: "sales",
    priority: "high",
    actionHref: "/admin/demo-center",
    metadata: { studentId, bookingId: idOf(input.booking) },
  });
}

export function raiseConversionCallTask(input: { booking: any; student: any; ownerId?: unknown; level?: string }) {
  const studentId = idOf(input.student || input.booking?.student);
  return raise({
    kind: "demo_conversion_call",
    referenceType: "DemoConversionCall",
    referenceId: idOf(input.booking),
    title: `Conversion call: ${nameOf(input.student, "demo student")}`,
    details: `The coach has submitted the demo assessment${input.level ? ` (level: ${input.level})` : ""}. Share it with the family and discuss enrolment.`,
    assignedTo: input.ownerId || input.booking?.salesOwner,
    pool: "sales",
    priority: "high",
    actionHref: `/admin/demo-center`,
    metadata: { studentId, bookingId: idOf(input.booking) },
  });
}

/** Converting a student (portal or CRM) settles their conversion call. */
export function resolveConversionCallTasks(studentId: unknown, by?: unknown) {
  return settleWhere("demo_conversion_call", { studentId: idOf(studentId) }, by, "The student was converted.");
}

/** A lead closed as lost — nothing left to chase. */
export async function cancelLeadTasks(studentId: unknown, bookingIds: unknown[], reason: string) {
  await withdraw("LeadFollowUp", studentId, reason);
  for (const bookingId of bookingIds) {
    await withdraw("DemoRebook", bookingId, reason);
    await withdraw("DemoConversionCall", bookingId, reason);
  }
}

/** A lead owner changed by hand: their open sales tasks follow. */
export async function reassignLeadTasks(input: { studentId: unknown; bookingIds: unknown[]; ownerId: unknown }) {
  try {
    await reassignAutoTasks("LeadFollowUp", [input.studentId], input.ownerId);
    await reassignAutoTasks("DemoRebook", input.bookingIds, input.ownerId);
    await reassignAutoTasks("DemoConversionCall", input.bookingIds, input.ownerId);
  } catch (error) {
    console.error("[tasks] could not reassign lead tasks", error);
  }
}

export function raiseContactEnquiryTask(message: any) {
  return raise({
    kind: "contact_enquiry",
    referenceType: "ContactEnquiry",
    referenceId: idOf(message),
    title: `Reply to website enquiry from ${nameOf(message, "a visitor")}`,
    details: [message?.email && `Email: ${message.email}`, message?.phone && `Phone: ${message.phone}`, message?.message && `Message: ${String(message.message).slice(0, 1000)}`]
      .filter(Boolean)
      .join("\n"),
    pool: "sales",
    actionHref: "/sales/enquiries",
    metadata: { contactMessageId: idOf(message) },
  });
}

// ---------------------------------------------------------------------------
// Coaches
// ---------------------------------------------------------------------------

export function raiseDemoAssessmentTask(input: { booking: any; coachId: unknown; student?: any }) {
  const bookingId = idOf(input.booking);
  return raise({
    kind: "demo_assessment",
    referenceType: "DemoAssessment",
    referenceId: bookingId,
    title: `Fill demo assessment${input.student?.name ? ` for ${input.student.name}` : ""}`,
    details: "The demo class is done. Submit the assessment so sales can follow up with the family while the class is fresh.",
    assignedTo: input.coachId,
    pool: "admins",
    priority: "high",
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    actionHref: `/demo-feedback/${bookingId}`,
    metadata: { bookingId, studentId: idOf(input.student || input.booking?.student) },
  });
}

export function resolveDemoAssessmentTask(bookingId: unknown, by?: unknown) {
  return settle("DemoAssessment", bookingId, by, "Assessment submitted.");
}

export function raiseAttendanceTask(input: { classroom: any; session: any; coachId: unknown }) {
  const title = String(input.classroom?.title || input.classroom?.courseName || "class");
  return raise({
    kind: "attendance_unmarked",
    referenceType: "AttendanceSession",
    referenceId: idOf(input.session),
    title: `Mark attendance: ${title}`,
    details: `The class on ${when(input.session?.scheduledFor)} has ended and the register is still empty. Credits and the class summary depend on it.`,
    assignedTo: input.coachId,
    priority: "high",
    actionHref: "/attendance",
    metadata: { classroomId: idOf(input.classroom), sessionId: idOf(input.session) },
  });
}

export function resolveAttendanceTask(sessionId: unknown, by?: unknown) {
  return settle("AttendanceSession", sessionId, by, "Attendance was marked.");
}

export function raiseHomeworkReviewTask(input: { submission: any; homework: any; student: any; coachId: unknown }) {
  return raise({
    kind: "homework_review",
    referenceType: "HomeworkReview",
    referenceId: idOf(input.submission),
    title: `Review homework: ${String(input.homework?.title || "assignment")} — ${nameOf(input.student, "student")}`,
    details: "This submission has written answers that need a coach's review.",
    assignedTo: input.coachId,
    actionHref: `/homework/${idOf(input.homework)}`,
    metadata: { homeworkId: idOf(input.homework), studentId: idOf(input.student) },
    reopenIfClosed: true,
  });
}

export async function raiseSubstituteTask(input: { classroom: any; sessionId: unknown; scheduledFor?: unknown; coachId: unknown }) {
  const task = await raise({
    kind: "substitute_class",
    referenceType: "SubstituteSession",
    referenceId: input.sessionId,
    title: `Substitute class: ${String(input.classroom?.title || "class")}`,
    details: `You are covering this class${input.scheduledFor ? ` on ${when(input.scheduledFor)}` : ""}. Review the batch's recent topics before joining.`,
    assignedTo: input.coachId,
    dueAt: input.scheduledFor ? new Date(input.scheduledFor as any) : null,
    actionHref: `/classrooms/${idOf(input.classroom)}`,
    metadata: { classroomId: idOf(input.classroom), sessionId: idOf(input.sessionId) },
    reopenIfClosed: true,
  });
  // Substitute changed again: the task moves with it.
  if (task && idOf(task.assignedTo) !== idOf(input.coachId)) {
    await reassignAutoTasks("SubstituteSession", [input.sessionId], input.coachId).catch(() => 0);
  }
  // Arranging cover is what the "coach missing" alert asked for.
  await settle("CoachMissing", input.sessionId, undefined, "A substitute coach was assigned.");
  return task;
}

// ---------------------------------------------------------------------------
// Admins & sub-admins
// ---------------------------------------------------------------------------

export function raiseEnrolmentSetupTask(input: { booking?: any; student: any }) {
  const referenceId = idOf(input.booking) || idOf(input.student);
  return raise({
    kind: "enrolment_setup",
    referenceType: input.booking ? "DemoConversion" : "EnrolmentSetup",
    referenceId,
    title: `Complete enrolment setup for ${nameOf(input.student, "new student")}`,
    details: "The student has converted. Assign a course, batch, fee plan and start date.",
    pool: "admins",
    priority: "high",
    actionHref: "/admin/users",
    metadata: { studentId: idOf(input.student) },
  });
}

export function raiseDuplicateReviewTask(user: any, matches: number) {
  return raise({
    kind: "duplicate_review",
    referenceType: "DuplicateReview",
    referenceId: idOf(user),
    title: `Review possible duplicate account: ${nameOf(user, "new account")}`,
    details: `This signup shares contact details with ${matches} existing account(s). Decide whether it's a sibling or the same person.`,
    pool: "admins",
    actionHref: "/admin/demo-center?tab=duplicates",
    metadata: { userId: idOf(user) },
    reopenIfClosed: true,
  });
}

export function resolveDuplicateReviewTask(userId: unknown, by?: unknown) {
  return settle("DuplicateReview", userId, by, "Duplicate review was ruled on.");
}

export function raiseModerationTask(message: any, reasons: string[] = [], href = "/ask-coach") {
  return raise({
    kind: "ask_coach_moderation",
    referenceType: "AskCoachModeration",
    referenceId: idOf(message),
    title: "Moderate a flagged Ask Coach message",
    details: reasons.length ? `Flagged for: ${reasons.join(", ")}.` : "A message was flagged by the safety filter.",
    pool: "admins",
    priority: "high",
    actionHref: href,
    metadata: { messageId: idOf(message), conversationId: idOf(message?.conversation) },
  });
}

export function resolveModerationTask(messageId: unknown, by?: unknown, action?: string) {
  return settle("AskCoachModeration", messageId, by, action ? `Moderated: ${action}.` : undefined);
}

export function raiseCoachMissingTask(input: { classroom: any; session: any; coachName?: string }) {
  return raise({
    kind: "coach_missing",
    referenceType: "CoachMissing",
    referenceId: idOf(input.session),
    title: `Coach hasn't joined: ${String(input.classroom?.title || "class")}`,
    details: `${input.coachName || "The coach"} has not joined the class scheduled for ${when(input.session?.scheduledFor)}. Reach the coach or arrange a substitute.`,
    pool: "admins",
    priority: "high",
    actionHref: `/classrooms/${idOf(input.classroom)}`,
    metadata: { classroomId: idOf(input.classroom), sessionId: idOf(input.session) },
  });
}

export function resolveCoachMissingTask(sessionId: unknown, by?: unknown, note?: string) {
  return settle("CoachMissing", sessionId, by, note || "The coach joined the class.");
}

export function raiseNoShowRulingTask(input: { classroom: any; sessionId: unknown; outcome: string; scheduledFor?: unknown }) {
  return raise({
    kind: "no_show_ruling",
    referenceType: "NoShowRuling",
    referenceId: input.sessionId,
    title: `Rule on no-show: ${String(input.classroom?.title || "class")}`,
    details: `The class${input.scheduledFor ? ` on ${when(input.scheduledFor)}` : ""} ended as "${input.outcome.replace(/_/g, " ")}". Decide coach pay and student credits.`,
    pool: "admins",
    actionHref: "/coach-pay",
    metadata: { classroomId: idOf(input.classroom), sessionId: idOf(input.sessionId) },
  });
}

export function resolveNoShowRulingTask(sessionId: unknown, by?: unknown) {
  return settle("NoShowRuling", sessionId, by, "No-show ruling saved.");
}

export async function raisePayProposalTask(input: { proposal: any; coachName?: string }) {
  let coachName = input.coachName;
  if (!coachName && input.proposal?.coach) {
    const coach: any = await User.findById(idOf(input.proposal.coach)).select("name username").lean().catch(() => null);
    coachName = coach ? nameOf(coach, "a coach") : undefined;
  }
  return raise({
    kind: "coach_pay_proposal",
    referenceType: "CoachPayProposal",
    referenceId: idOf(input.proposal),
    title: `Review pay proposal from ${coachName || "a coach"}`,
    details: `${
      input.proposal?.kind === "session"
        ? input.proposal?.payKind === "substitute"
          ? "Pay for a substitution class they covered."
          : "Pay for a class they took."
        : input.proposal?.kind === "coach_rate"
          ? "Proposed a rate for all their demo classes."
          : "Proposed rates for a classroom they teach."
    }${input.proposal?.note ? ` Note: ${String(input.proposal.note).slice(0, 500)}` : ""}`,
    pool: "admins",
    actionHref: "/coach-pay/proposals",
    metadata: { proposalId: idOf(input.proposal) },
  });
}

export function resolvePayProposalTask(proposalId: unknown, by?: unknown, decision?: string) {
  return settle("CoachPayProposal", proposalId, by, decision ? `Proposal ${decision}.` : "Proposal reviewed.");
}

export function cancelPayProposalTask(proposalId: unknown) {
  return withdraw("CoachPayProposal", proposalId, "The coach withdrew the proposal.");
}

export function raiseCoachApplicationTask(application: any, applicant: any) {
  return raise({
    kind: "coach_application",
    referenceType: "CoachApplication",
    referenceId: idOf(application),
    title: `Review coach application: ${nameOf(applicant, "new applicant")}`,
    details: "A coach has applied through the portal. Review their profile and shortlist or reject.",
    pool: "admins",
    actionHref: "/admin/coach-applications",
    metadata: { applicationId: idOf(application), userId: idOf(applicant) },
  });
}

// ---------------------------------------------------------------------------
// Invoices: Saptarshi's alone
// ---------------------------------------------------------------------------

/** Payment chasing belongs to one person, not the admin queue. */
export const INVOICE_TASK_KINDS = ["invoice_overdue", "credits_exhausted"];

export function invoiceTaskOwnerEmail() {
  return String(process.env.INVOICE_TASK_OWNER_EMAIL || "saptarshi2856@gmail.com").trim().toLowerCase();
}

/** Saptarshi's account id, or "" if it is missing - then the task falls back to the admin queue rather than vanishing. */
async function invoiceTaskOwnerId() {
  try {
    await dbConnect();
    const owner: any = await User.findOne({ email: invoiceTaskOwnerEmail(), isActive: { $ne: false } }).select("_id").lean();
    return owner ? String(owner._id) : "";
  } catch (error) {
    console.error("[tasks] could not resolve the invoice task owner", error);
    return "";
  }
}

/**
 * Hands every open "Chase payment" / "Credits exhausted" task that sits with
 * anyone else (or in a queue) to Saptarshi. Run from the hourly task sweep, so
 * tasks raised before this rule existed move over on the first run after
 * deploy. Silent: the reassigned tasks reach Saptarshi in the daily digest
 * instead of one notice each.
 */
export async function moveInvoiceTasksToOwner() {
  try {
    const ownerId = await invoiceTaskOwnerId();
    if (!ownerId) return { moved: 0 };
    const result = await InternalTask.updateMany(
      { kind: { $in: INVOICE_TASK_KINDS }, status: { $in: OPEN_TASK_STATUSES }, assignedTo: { $ne: ownerId } },
      { $set: { assignedTo: ownerId, pool: null } }
    );
    return { moved: result.modifiedCount || 0 };
  } catch (error) {
    console.error("[tasks] could not move invoice tasks to their owner", error);
    return { moved: 0 };
  }
}

export async function raiseOverdueInvoiceTask(input: { invoice: any; student: any; daysOverdue: number }) {
  const ownerId = await invoiceTaskOwnerId();
  return raise({
    kind: "invoice_overdue",
    referenceType: "InvoiceOverdue",
    referenceId: idOf(input.invoice),
    title: `Chase payment: ${nameOf(input.student, "student")} — ${String(input.invoice?.invoiceNumber || "invoice")}`,
    details: `This invoice is ${input.daysOverdue} day(s) overdue. Contact the family about payment.`,
    ...(ownerId ? { assignedTo: ownerId } : { pool: "admins" as const }),
    priority: input.daysOverdue >= 7 ? "high" : "normal",
    actionHref: "/fees/invoices",
    metadata: { invoiceId: idOf(input.invoice), studentId: idOf(input.student) },
  });
}

/** Paying an invoice settles "chase payment" and, for a recharge, "credits exhausted". */
export async function resolveInvoiceTasks(invoice: any, by?: unknown) {
  await settle("InvoiceOverdue", invoice, by, "Invoice was paid.");
  const studentId = idOf(invoice?.student);
  if (studentId && (invoice?.type === "credits" || invoice?.credits)) await settle("CreditsExhausted", studentId, by, "Credits were recharged.");
}

export async function raiseCreditsExhaustedTask(input: { student: any; balance: number }) {
  const ownerId = await invoiceTaskOwnerId();
  return raise({
    kind: "credits_exhausted",
    referenceType: "CreditsExhausted",
    referenceId: idOf(input.student),
    title: `Credits exhausted: ${nameOf(input.student, "student")}`,
    details: `Credit balance is ${input.balance}. Arrange a recharge before the next class.`,
    ...(ownerId ? { assignedTo: ownerId } : { pool: "admins" as const }),
    priority: "high",
    actionHref: "/fees/credit-monitoring",
    metadata: { studentId: idOf(input.student) },
    reopenIfClosed: true,
  });
}

export function raisePauseReinstateTask(input: { pause: any; student: any }) {
  return raise({
    kind: "pause_reinstate",
    referenceType: "PauseReinstate",
    referenceId: idOf(input.pause),
    title: `Reinstate ${nameOf(input.student, "student")} after pause`,
    // Families most often drift away at the end of a pause, so the call comes first.
    details: `The pause ends on ${when(input.pause?.pausedUntil)}. Call the family to confirm they are coming back, then confirm the restart batch and reinstate the student so billing resumes correctly.`,
    pool: "admins",
    dueAt: input.pause?.pausedUntil ? new Date(input.pause.pausedUntil) : null,
    actionHref: "/admin/paused-students",
    metadata: { pauseId: idOf(input.pause), studentId: idOf(input.student) },
  });
}

export function resolvePauseReinstateTask(pauseId: unknown, by?: unknown) {
  return settle("PauseReinstate", pauseId, by, "Student was reinstated.");
}

export function cancelPauseReinstateTask(pauseId: unknown) {
  return withdraw("PauseReinstate", pauseId, "The pause was cancelled.");
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

type RetentionReasonLine = { label: string; detail?: string };

function retentionDetails(level: string, reasons: RetentionReasonLine[]) {
  const lines = reasons.map((reason) => `• ${reason.label}${reason.detail ? ` - ${reason.detail}` : ""}`);
  return [
    level === "high" ? "Strong signs this family may leave." : "This family may be about to leave.",
    ...lines,
    "Call the family: ask how classes are going, listen, and log the call on the Retention page.",
  ].join("\n");
}

/**
 * One task per flag, not per student: a family who wobbles again months later
 * is a new conversation, and its own task keeps the old call notes apart.
 * Re-raised every day the flag stays open, which refreshes the reasons and
 * lifts the priority if it got worse.
 */
export async function raiseRetentionRiskTask(input: { flag: any; student: any; level: string; reasons: RetentionReasonLine[] }) {
  const flagId = idOf(input.flag);
  const title = `${input.level === "high" ? "High risk" : "At risk"}: call ${nameOf(input.student, "student")}'s family`;
  const details = retentionDetails(input.level, input.reasons);
  const priority = input.level === "high" ? "high" as const : "normal" as const;
  const task = await raise({
    kind: "retention_risk",
    referenceType: "RetentionRisk",
    referenceId: flagId,
    title,
    details,
    pool: "admins",
    priority,
    actionHref: `/admin/retention?flag=${flagId}`,
    metadata: { flagId, studentId: idOf(input.student) },
  });
  // ensureAutoTask only writes on insert; keep an open task's reasons current.
  if (task && OPEN_TASK_STATUSES.includes(task.status) && (task.details !== details || task.priority !== priority)) {
    await InternalTask.updateOne({ _id: task._id }, { $set: { title, details, priority } }).catch((error: unknown) => console.error("[tasks] could not refresh retention task", error));
  }
  return task;
}

export function resolveRetentionRiskTask(flagId: unknown, by?: unknown, note = "Retention flag settled.") {
  return settle("RetentionRisk", flagId, by, note);
}

// ---------------------------------------------------------------------------
// Monthly feedback
// ---------------------------------------------------------------------------

/**
 * One task per student report. Raised silently: the monthly sweep sends each
 * coach one summary ("12 reports due by 5 Oct") instead of one alert per task.
 */
export function raiseMonthlyFeedbackTask(input: { feedback: any; monthLabel: string; silent?: boolean }) {
  const feedbackId = idOf(input.feedback);
  return raise({
    kind: "monthly_feedback",
    referenceType: "MonthlyFeedback",
    referenceId: feedbackId,
    title: `Monthly feedback: ${nameOf({ name: input.feedback?.studentName }, "student")} (${input.monthLabel})`,
    details: "Rate this month's progress - it takes under a minute. An admin reviews it before it goes to the family.",
    assignedTo: input.feedback?.coach,
    priority: "normal",
    dueAt: input.feedback?.dueAt || null,
    actionHref: `/feedback?month=${input.feedback?.month}&open=${feedbackId}`,
    metadata: { feedbackId, month: input.feedback?.month, studentId: idOf(input.feedback?.student) },
    notify: !input.silent,
  });
}

export function resolveMonthlyFeedbackTask(feedbackId: unknown, by?: unknown, note = "Feedback submitted.") {
  return settle("MonthlyFeedback", feedbackId, by, note);
}

/** The report was withdrawn (e.g. the student attended too few classes), so the coach's task goes too. */
export function withdrawMonthlyFeedbackTask(feedbackId: unknown, reason: string) {
  return withdraw("MonthlyFeedback", feedbackId, reason);
}

/** The admin sent a report back: the coach's task comes back with the admin's note. */
export function reopenMonthlyFeedbackTask(input: { feedback: any; monthLabel: string; note: string }) {
  const feedbackId = idOf(input.feedback);
  return raise({
    kind: "monthly_feedback",
    referenceType: "MonthlyFeedback",
    referenceId: feedbackId,
    title: `Update feedback: ${nameOf({ name: input.feedback?.studentName }, "student")} (${input.monthLabel})`,
    details: `An admin asked for changes: ${input.note}`,
    assignedTo: input.feedback?.coach,
    priority: "high",
    dueAt: input.feedback?.dueAt || null,
    actionHref: `/feedback?month=${input.feedback?.month}&open=${feedbackId}`,
    metadata: { feedbackId, month: input.feedback?.month, studentId: idOf(input.feedback?.student) },
    reopenIfClosed: true,
  });
}

/** One pooled admin task per month while any report is waiting for approval. */
export function raiseFeedbackReviewTask(input: { cycle: any; monthLabel: string; waiting: number }) {
  return raise({
    kind: "monthly_feedback_review",
    referenceType: "MonthlyFeedbackReview",
    referenceId: idOf(input.cycle),
    title: `Approve monthly feedback (${input.monthLabel})`,
    details: `${input.waiting} report${input.waiting === 1 ? " is" : "s are"} waiting for approval before going to families.`,
    pool: "admins",
    priority: "normal",
    actionHref: `/feedback?month=${input.cycle?.month}&tab=submitted`,
    metadata: { month: input.cycle?.month },
    reopenIfClosed: true,
  });
}

export function resolveFeedbackReviewTask(cycleId: unknown, by?: unknown) {
  return settle("MonthlyFeedbackReview", cycleId, by, "Every submitted report has been reviewed.");
}
