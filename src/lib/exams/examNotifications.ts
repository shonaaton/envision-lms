import { formatAcademyDateTime } from "@/lib/academyTime";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { messageFamily } from "@/lib/familyMessaging";
import { whatsappParam } from "@/lib/leave/leaveNotifications";
import { studentCoachGroups } from "@/lib/studentDiscontinuedNotifications";
import { whatsappRecipientName } from "@/lib/whatsappAutomationEvents";
import { coreStaffFilter } from "@/lib/staffAudience";
import { topicBreakdown, topicReportLines } from "@/lib/exams/examReport";
import { EXAM_DURATION_MINUTES, SUBMIT_REASON_LABELS, examLevelLabel, type ReminderKind, type SubmitReason } from "@/lib/exams/examRules";
import { Classroom } from "@/models/Classroom";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * Who hears what about an exam. Families get the assignment and the two
 * reminders on every channel (in-app, email, WhatsApp); the result and the
 * certificate are in-app, where the student is when they finish. The topic
 * report goes to the family by email and to the student's coaches; coaches
 * also hear on the last day about students who have not started, and admins
 * about exams that closed without an attempt.
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

/* ------------------------------------------------------------- reports and chasing */

const COACH_FIELDS = "_id name email isActive";

/** Who teaches this student: the classroom that earned the exam, and every group they are in now. */
async function examCoachIds(assignment: any) {
  const ids = new Set<string>();
  if (assignment.classroom) {
    const classroom: any = await Classroom.findById(assignment.classroom?._id || assignment.classroom).select("coach instructor").lean();
    const coach = String(classroom?.coach || classroom?.instructor || "");
    if (coach) ids.add(coach);
  }
  const groups = await studentCoachGroups(String(assignment.student?._id || assignment.student));
  groups.forEach((_names, coachId) => ids.add(coachId));
  return Array.from(ids);
}

async function emailCoach(coach: any, subject: string, message: string, metadata: Record<string, unknown>) {
  if (!coach.email) return;
  await sendAutomationEmail({ to: String(coach.email), subject, message, metadata: { ...metadata, recipientType: "coach", userId: String(coach._id) } }).catch((error: unknown) =>
    console.error("[exams] coach email failed", error)
  );
}

function scoreLine(score: any) {
  return `${score?.total ?? 0}/${score?.max ?? 100} (MCQs ${score?.mcq ?? 0}/20, positions ${score?.positions ?? 0}/80)`;
}

/**
 * The topic report, sent once the exam is marked: the family by email, the
 * student's coaches in-app and by email. Marks by topic only, never an answer:
 * every student at a level sits the same paper.
 */
export async function notifyExamReport(assignment: any) {
  const student: any = await loadStudent(assignment);
  if (!student) return;
  const level = examLevelLabel(assignment.tier, assignment.levelNumber);
  const breakdown = topicBreakdown(assignment);
  const lines = topicReportLines(breakdown);
  const name = student.name || "The student";
  const strongLine = breakdown.strong.length ? `Strong in: ${breakdown.strong.join(", ")}.` : "";
  const weakLine = breakdown.weak.length ? `Needs more work: ${breakdown.weak.join(", ")}.` : "";
  const metadata = { kind: "exam_report", examId: String(assignment._id), studentId: String(student._id), href: examHref(assignment), actionLabel: "Open the Exam Center" };
  const topicBlock = ["Marks by topic:", ...lines.map((line) => `- ${line}`)];

  await messageFamily({
    student,
    subject: `${level} exam report: ${name}`,
    message: [
      `Hello ${student.name || "there"},`,
      "",
      `Here is how your ${level} exam went. You scored ${scoreLine(assignment.score)}.`,
      "",
      ...topicBlock,
      "",
      ...[strongLine, weakLine].filter(Boolean),
      "",
      "Open the Exam Center to see the right answers to the questions you missed.",
      "",
      "Team Envision Chess Academy",
    ].join("\n"),
    parentMessage: [
      `Hello ${student.parentName || "there"},`,
      "",
      `${name} has completed the ${level} exam and scored ${scoreLine(assignment.score)}.`,
      "",
      ...topicBlock,
      "",
      ...[strongLine, weakLine].filter(Boolean),
      "",
      `${name}'s coach has the same report and will work on the weaker topics in class. The certificate follows by email.`,
      "",
      "Team Envision Chess Academy",
    ].join("\n"),
    metadata: { ...metadata, notificationDedupKey: `exam:${assignment._id}:report` },
  }).catch((error) => console.error("[exams] family report failed", error));

  const coaches: any[] = await User.find({ _id: { $in: await examCoachIds(assignment) }, isActive: { $ne: false } }).select(COACH_FIELDS).lean();
  const reason = assignment.submitReason && assignment.submitReason !== "completed" ? SUBMIT_REASON_LABELS[assignment.submitReason as SubmitReason] : "";
  const progress: any[] = assignment.positionProgress || [];
  const wrongMoves = progress.reduce((sum, item) => sum + Number(item.wrongMoves || 0), 0);
  const hints = progress.reduce((sum, item) => sum + Number(item.hintsUsed || 0), 0);
  for (const coach of coaches) {
    const title = `${name}: ${level} exam ${assignment.score?.total ?? 0}/${assignment.score?.max ?? 100}`;
    const message = [
      `${name} scored ${scoreLine(assignment.score)} with ${wrongMoves} wrong ${wrongMoves === 1 ? "move" : "moves"} and ${hints} ${hints === 1 ? "hint" : "hints"} in the positions.`,
      ...(reason ? [reason + "."] : []),
      "",
      ...topicBlock,
      "",
      ...[strongLine, weakLine].filter(Boolean),
    ].join("\n");
    const coachMetadata = { kind: "exam_report_coach", examId: String(assignment._id), studentId: String(student._id), href: "/exams", actionLabel: "Open exam results" };
    await inApp(coach._id, `exam:${assignment._id}:report:${coach._id}`, title, message, coachMetadata);
    await emailCoach(coach, title, [`Hello ${coach.name || "Coach"},`, "", message, "", "Team Envision Chess Academy"].join("\n"), {
      ...coachMetadata,
      notificationDedupKey: `exam:${assignment._id}:report:${coach._id}`,
    });
  }
}

/**
 * The last-day heads-up: each coach gets one note listing their students
 * whose exam closes tonight and who have not started it.
 */
export async function notifyCoachesExamsNotStarted(assignments: any[]) {
  if (!assignments.length) return;
  const studentIds = Array.from(new Set(assignments.map((assignment) => String(assignment.student?._id || assignment.student))));
  const students: any[] = await User.find({ _id: { $in: studentIds } }).select("_id name username").lean();
  const studentName = new Map(students.map((student) => [String(student._id), student.name || student.username || "A student"]));

  const byCoach = new Map<string, any[]>();
  for (const assignment of assignments) {
    for (const coachId of await examCoachIds(assignment)) byCoach.set(coachId, [...(byCoach.get(coachId) || []), assignment]);
  }
  const coaches: any[] = await User.find({ _id: { $in: Array.from(byCoach.keys()) }, isActive: { $ne: false } }).select(COACH_FIELDS).lean();
  for (const coach of coaches) {
    const list = byCoach.get(String(coach._id)) || [];
    if (!list.length) continue;
    const nameOf = (assignment: any) => studentName.get(String(assignment.student?._id || assignment.student)) || "A student";
    const rows = list.map((assignment) => `- ${nameOf(assignment)}: ${examLevelLabel(assignment.tier, assignment.levelNumber)}`);
    const deadline = examDeadlineLabel(list[0].availableUntil);
    const title = list.length === 1 ? `${nameOf(list[0])} has not started their exam` : `${list.length} students have not started their exam`;
    const message = [
      `The exam closes tonight (${deadline}) and these students have not started it yet:`,
      ...rows,
      "",
      "Their families were reminded this morning. A word from you in class or on the group may help.",
    ].join("\n");
    const key = `exam:not_started:${coach._id}:${list.map((assignment) => String(assignment._id)).sort().join(",")}`;
    const metadata = { kind: "exam_not_started_coach", href: "/exams", actionLabel: "Open exam results" };
    await inApp(coach._id, key, title, message, metadata);
    await emailCoach(coach, title, [`Hello ${coach.name || "Coach"},`, "", message, "", "Team Envision Chess Academy"].join("\n"), { ...metadata, notificationDedupKey: key });
  }
}

/** Admins hear about exams whose window closed with no attempt, so they can be followed up or assigned again. */
export async function notifyExamsClosedUnattempted(assignments: any[]) {
  if (!assignments.length) return;
  const students: any[] = await User.find({ _id: { $in: assignments.map((assignment) => assignment.student) } }).select("_id name username").lean();
  const studentName = new Map(students.map((student) => [String(student._id), student.name || student.username || "A student"]));
  const rows = assignments.map((assignment) => `${studentName.get(String(assignment.student)) || "A student"} (${examLevelLabel(assignment.tier, assignment.levelNumber)})`);
  const title = assignments.length === 1 ? "An exam closed without an attempt" : `${assignments.length} exams closed without an attempt`;
  await notifyExamStaff(
    `exam:closed_unattempted:${assignments.map((assignment) => String(assignment._id)).sort().join(",")}`,
    title,
    `${rows.join(", ")}. Follow up with the family, or assign the exam again from Exams → Assigned exams.`,
    "/admin/exams?tab=assignments&status=expired"
  );
}

/** One in-app note to every admin and plain sub-admin, once per `dedupKey`. */
export async function notifyExamStaff(dedupKey: string, title: string, message: string, href = "/admin/exams") {
  const staff: any[] = await User.find(coreStaffFilter()).select("_id").lean();
  await Promise.all(staff.map((user) => inApp(user._id, `${dedupKey}:${user._id}`, title, message, { kind: "exam_staff", href })));
}
