import { formatAcademyDateTime } from "@/lib/academyTime";
import { messageFamily } from "@/lib/familyMessaging";
import { whatsappParam } from "@/lib/leave/leaveNotifications";
import { whatsappRecipientName } from "@/lib/whatsappAutomationEvents";
import { coreStaffFilter } from "@/lib/staffAudience";
import { EXAM_DURATION_MINUTES, examLevelLabel, type ReminderKind } from "@/lib/exams/examRules";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * Who hears what about an exam. Families get the assignment and the two
 * reminders on every channel (in-app, email, WhatsApp); the result and the
 * certificate are in-app, where the student is when they finish.
 *
 * Runs from the exam sweep in instrumentation.ts, so nothing here may reach a
 * module with a static `crypto` or `fs` import.
 */

export const EXAM_ASSIGNED_TEMPLATE = "exam_assigned";
export const EXAM_REMINDER_TEMPLATE = "exam_reminder";

const STUDENT_FIELDS = "_id name email role phone countryCode parentName parentEmail isActive";

function examHref(assignment: any) {
  return `/exams/${assignment._id}`;
}

export function examDeadlineLabel(value: Date) {
  return `${formatAcademyDateTime(value, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} IST`;
}

async function inApp(user: unknown, dedupKey: string, title: string, message: string, metadata: Record<string, unknown>) {
  await Notification.updateOne(
    { user, "metadata.dedupKey": dedupKey },
    { $setOnInsert: { user, type: "exam", title, message, metadata: { ...metadata, dedupKey } } },
    { upsert: true }
  );
}

async function loadStudent(assignment: any) {
  if (assignment.student?.name !== undefined) return assignment.student;
  return User.findById(assignment.student).select(STUDENT_FIELDS).lean();
}

export async function notifyExamAssigned(assignment: any) {
  const student: any = await loadStudent(assignment);
  if (!student) return;
  const level = examLevelLabel(assignment.tier, assignment.levelNumber);
  const deadline = examDeadlineLabel(assignment.availableUntil);
  const dedupKey = `exam:${assignment._id}:assigned`;
  const metadata = { kind: "exam_assigned", examId: String(assignment._id), href: examHref(assignment) };
  const title = `New exam: ${level}`;
  const body = [
    `Your ${level} exam is ready in the Exam Center.`,
    `It is open until ${deadline}. Once you press Start you have ${EXAM_DURATION_MINUTES} minutes, and you cannot pause or leave, so start when you have time and a steady connection.`,
    "You get your certificate after you complete it.",
  ].join("\n\n");

  await inApp(student._id, dedupKey, title, body, metadata);
  await messageFamily({
    student,
    subject: title,
    message: [`Hello ${student.name || "there"},`, "", body, "", "Team Envision Chess Academy"].join("\n"),
    parentMessage: [
      `Hello ${student.parentName || "there"},`,
      "",
      `${student.name || "Your child"}'s ${level} exam is ready in the Exam Center on the academy portal.`,
      "",
      `It is open until ${deadline}. Once started it runs for ${EXAM_DURATION_MINUTES} minutes and cannot be paused or left, so please make sure they start it with enough time and a steady connection. The certificate follows once it is completed.`,
      "",
      "Team Envision Chess Academy",
    ].join("\n"),
    templateName: EXAM_ASSIGNED_TEMPLATE,
    bodyParameters: [whatsappRecipientName(student), level, deadline].map((value) => whatsappParam(value)),
    metadata: { ...metadata, studentId: String(student._id), notificationDedupKey: dedupKey },
  });
}

export async function notifyExamReminder(assignment: any, kind: ReminderKind) {
  const student: any = await loadStudent(assignment);
  if (!student) return;
  const level = examLevelLabel(assignment.tier, assignment.levelNumber);
  const deadline = examDeadlineLabel(assignment.availableUntil);
  const timeLeft = kind === "last_day" ? "today is the last day" : "3 days are left";
  const dedupKey = `exam:${assignment._id}:reminder:${kind}`;
  const metadata = { kind: "exam_reminder", examId: String(assignment._id), href: examHref(assignment), reminder: kind };
  const title = kind === "last_day" ? `Last day for your ${level} exam` : `Reminder: ${level} exam`;
  const body = `Your ${level} exam is still waiting: ${timeLeft}. It closes at ${deadline}. Once started you have ${EXAM_DURATION_MINUTES} minutes and cannot leave the exam.`;

  await inApp(student._id, dedupKey, title, body, metadata);
  await messageFamily({
    student,
    subject: title,
    message: [`Hello ${student.name || "there"},`, "", body, "", "Team Envision Chess Academy"].join("\n"),
    parentMessage: [`Hello ${student.parentName || "there"},`, "", `${student.name || "Your child"}'s ${level} exam is still waiting: ${timeLeft}. It closes at ${deadline}.`, "", "Team Envision Chess Academy"].join("\n"),
    templateName: EXAM_REMINDER_TEMPLATE,
    bodyParameters: [whatsappRecipientName(student), level, timeLeft, deadline].map((value) => whatsappParam(value)),
    metadata: { ...metadata, studentId: String(student._id), notificationDedupKey: dedupKey },
  });
}

export async function notifyExamResult(assignment: any) {
  const level = examLevelLabel(assignment.tier, assignment.levelNumber);
  const score = assignment.score || {};
  await inApp(
    assignment.student?._id || assignment.student,
    `exam:${assignment._id}:result`,
    `${level} exam result: ${score.total ?? 0}/${score.max ?? 100}`,
    `MCQs ${score.mcq ?? 0}/20, positions ${score.positions ?? 0}/80. Your certificate will appear in the Exam Center shortly.`,
    { kind: "exam_result", examId: String(assignment._id), href: examHref(assignment) }
  );
}

export async function notifyCertificateIssued(assignment: any) {
  const level = examLevelLabel(assignment.tier, assignment.levelNumber);
  await inApp(
    assignment.student?._id || assignment.student,
    `exam:${assignment._id}:certificate`,
    `Your ${level} certificate is ready`,
    "Open the Exam Center to download it.",
    { kind: "exam_certificate", examId: String(assignment._id), href: examHref(assignment) }
  );
}

/** One in-app note to every admin and plain sub-admin, once per `dedupKey`. */
export async function notifyExamStaff(dedupKey: string, title: string, message: string, href = "/admin/exams") {
  const staff: any[] = await User.find(coreStaffFilter()).select("_id").lean();
  await Promise.all(staff.map((user) => inApp(user._id, `${dedupKey}:${user._id}`, title, message, { kind: "exam_staff", href })));
}
