import { resolvePublicAppUrl } from "@/lib/appUrl";
import { ACADEMY_TIME_ZONE, formatAcademyDateTime } from "@/lib/academyTime";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { formatINR } from "@/lib/utils";
import { Classroom } from "@/models/Classroom";
import { Homework } from "@/models/Homework";
import { User } from "@/models/User";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function displayDateTime(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const timeZoneLabel = ACADEMY_TIME_ZONE === "Asia/Kolkata" ? "IST" : ACADEMY_TIME_ZONE;
  return `${formatAcademyDateTime(date)} (${timeZoneLabel})`;
}

function exactNameRegex(name: string) {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

function statusLabel(status: string) {
  if (status === "present") return "Present";
  if (status === "late") return "Late";
  if (status === "student_no_show") return "Student no-show";
  if (status === "coach_no_show") return "Coach no-show";
  if (status === "excused") return "Excused";
  if (status === "technical_issue") return "Technical issue";
  if (status === "not_joined") return "Not joined";
  return status ? status.replace(/_/g, " ") : "Marked";
}

function nextSessionAfter(classroom: any, scheduledFor?: Date | string | null) {
  const currentTime = scheduledFor ? new Date(scheduledFor).getTime() : 0;
  return (classroom.generatedSessions || [])
    .filter((session: any) => {
      const time = new Date(session.scheduledFor || 0).getTime();
      return time && (!currentTime || time > currentTime) && !["cancelled", "completed", "student_no_show", "coach_no_show"].includes(String(session.status || ""));
    })
    .sort((a: any, b: any) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())[0];
}

async function sendToStudentAndParent(student: any, subject: string, studentMessage: string, parentMessage: string, metadata: Record<string, unknown>) {
  const deliveries = [];
  if (student?.email) {
    deliveries.push(sendAutomationEmail({ to: String(student.email), subject, message: studentMessage, metadata }));
  }
  if (student?.parentEmail) {
    deliveries.push(sendAutomationEmail({
      to: String(student.parentEmail),
      subject,
      message: parentMessage,
      metadata: { ...metadata, recipientType: "parent" },
    }));
  }
  return Promise.all(deliveries);
}

export async function sendCourseAssignedEmail(classroomInput: any, request?: Request) {
  const classroomId = objectId(classroomInput?._id || classroomInput);
  if (!classroomId) return { sent: 0 };
  const classroom: any = classroomInput?.students
    ? classroomInput
    : await Classroom.findById(classroomId).lean();
  const studentIds = (classroom?.students || []).map(objectId).filter(Boolean);
  if (!studentIds.length) return { sent: 0 };

  const students: any[] = await User.find({ _id: { $in: studentIds }, role: "student", isActive: { $ne: false } })
    .select("name email parentName parentEmail")
    .lean();
  const appUrl = resolvePublicAppUrl(request);
  const classroomUrl = appUrl ? `${appUrl}/classrooms/${classroomId}` : "";
  const firstSession = (classroom.generatedSessions || [])[0];
  const courseName = classroom.courseName || classroom.title || "your course";
  const levelName = classroom.levelName || classroom.level || "Not set";
  const firstLesson = firstSession?.topicName || classroom.topicName || "Your first lesson";
  const firstLessonTime = displayDateTime(firstSession?.scheduledFor || classroom.classDate);

  const deliveries = await Promise.all(students.map((student) => {
    const message = [
      `Hello ${student.name || "there"},`,
      "",
      `A new course has been assigned to you on the Envision Chess Academy platform.`,
      "",
      `Course: ${courseName}`,
      `Level: ${levelName}`,
      `First lesson: ${firstLesson}`,
      firstLessonTime ? `First class: ${firstLessonTime}` : "",
      "",
      classroomUrl ? `Open your classroom: ${classroomUrl}` : "Please sign in to your academy dashboard to view it.",
    ].filter(Boolean).join("\n");
    const parentMessage = message.replace(`Hello ${student.name || "there"},`, `Hello ${student.parentName || "Parent"},`);
    return sendToStudentAndParent(student, "New course assigned", message, parentMessage, {
      kind: "course_assigned",
      classroomId,
      courseName,
      levelName,
      firstLesson,
      href: `/classrooms/${classroomId}`,
    });
  }));
  return { sent: deliveries.length };
}

export async function sendAchievementEarnedEmail(achievement: any, request?: Request) {
  if (!achievement?.studentName || achievement.isPublished === false) return { sent: 0 };
  const student: any = await User.findOne({
    role: "student",
    isActive: { $ne: false },
    name: exactNameRegex(String(achievement.studentName).trim()),
  }).select("name email parentName parentEmail").lean();
  if (!student?.email && !student?.parentEmail) return { sent: 0, skipped: true };

  const appUrl = resolvePublicAppUrl(request);
  const leaderboardUrl = appUrl ? `${appUrl}/leaderboard` : "";
  const achievementName = achievement.category || achievement.achievementLevel || "Achievement";
  const reason = `${achievement.result} - ${achievement.tournamentName}`;
  const message = [
    `Hello ${student.name || achievement.studentName},`,
    "",
    `Congratulations! You have unlocked a new achievement at Envision Chess Academy.`,
    "",
    `Achievement: ${achievementName}`,
    `Reason: ${reason}`,
    achievement.year ? `Year: ${achievement.year}` : "",
    "",
    leaderboardUrl ? `View leaderboard: ${leaderboardUrl}` : "Please sign in to your academy dashboard to view your progress.",
  ].filter(Boolean).join("\n");
  const parentMessage = message.replace(`Hello ${student.name || achievement.studentName},`, `Hello ${student.parentName || "Parent"},`);
  await sendToStudentAndParent(student, "New achievement unlocked", message, parentMessage, {
    kind: "achievement_unlocked",
    achievementId: objectId(achievement._id),
    achievementName,
    reason,
    href: "/leaderboard",
  });
  return { sent: 1 };
}

export async function sendStudentNoShowWarningEmail(input: {
  studentId: unknown;
  classroom?: any;
  session?: any;
  attendanceId?: string;
  noShowCount?: number;
  creditsDeducted?: boolean;
  request?: Request;
}) {
  const student: any = await User.findById(input.studentId).select("name email parentName parentEmail").lean();
  if (!student?.email && !student?.parentEmail) return { sent: 0, skipped: true };
  const appUrl = resolvePublicAppUrl(input.request);
  const attendanceUrl = appUrl ? `${appUrl}/attendance` : "";
  const classTitle = input.classroom?.title || "your class";
  const topicName = input.session?.topicName || input.classroom?.topicName || "Class session";
  const missedAt = displayDateTime(input.session?.scheduledFor || input.classroom?.classDate);
  const message = [
    `Hello ${student.name || "there"},`,
    "",
    `This is a missed class notice for ${classTitle}.`,
    `Topic: ${topicName}`,
    missedAt ? `Class time: ${missedAt}` : "",
    "",
    `Policy note: repeated student no-shows may be charged according to the academy attendance policy.`,
    input.creditsDeducted ? "A class credit was deducted because the monthly no-show allowance was exceeded." : "No credit deduction was applied for this notice.",
    input.noShowCount ? `No-shows counted this month: ${input.noShowCount}.` : "",
    "",
    attendanceUrl ? `Review attendance: ${attendanceUrl}` : "Please contact the academy team if this needs correction.",
  ].filter(Boolean).join("\n");
  const parentMessage = message.replace(`Hello ${student.name || "there"},`, `Hello ${student.parentName || "Parent"},`);
  await sendToStudentAndParent(student, "Missed class notice", message, parentMessage, {
    kind: "student_no_show_warning",
    classroomId: objectId(input.classroom?._id || input.classroom),
    sessionId: objectId(input.session?._id || input.session),
    attendanceId: input.attendanceId || "",
    creditsDeducted: Boolean(input.creditsDeducted),
    noShowCount: input.noShowCount || 0,
    href: "/attendance",
  });
  return { sent: 1 };
}

export async function sendCreditAdjustmentEmail(input: {
  student: any;
  credits: number;
  balanceAfter: number;
  reason: string;
  adjustment: "added" | "removed";
}) {
  const student = input.student;
  if (!student?.email && !student?.parentEmail) return { sent: 0, skipped: true };
  const added = input.adjustment === "added";
  const subject = added ? "Class credits added to your account" : "Class credits removed from your account";
  const message = [
    `Hello ${student.name || "there"},`,
    "",
    `${input.credits} class credit${input.credits === 1 ? "" : "s"} ${input.credits === 1 ? "has" : "have"} been ${added ? "added to" : "removed from"} your account.`,
    `Reason: ${input.reason}`,
    `New balance: ${input.balanceAfter} credit${input.balanceAfter === 1 ? "" : "s"}.`,
    "",
    "Please contact the academy team if you have any questions.",
  ].join("\n");
  const parentMessage = message.replace(`Hello ${student.name || "there"},`, `Hello ${student.parentName || "Parent"},`);
  await sendToStudentAndParent(student, subject, message, parentMessage, {
    kind: added ? "credits_added" : "credits_removed",
    studentId: objectId(student._id || student),
    credits: input.credits,
    balanceAfter: input.balanceAfter,
  });
  return { sent: 1 };
}

export async function sendClassCompletedSummaryEmail(input: {
  classroom: any;
  session?: any;
  attendance: any;
  records: any[];
  request?: Request;
}) {
  const studentIds = (input.records || []).map((record) => objectId(record.student)).filter(Boolean);
  if (!studentIds.length) return { sent: 0 };
  const students: any[] = await User.find({ _id: { $in: studentIds }, role: "student", isActive: { $ne: false } })
    .select("name email parentName parentEmail")
    .lean();
  if (!students.length) return { sent: 0 };
  const recordByStudent = new Map((input.records || []).map((record) => [objectId(record.student), record]));
  const appUrl = resolvePublicAppUrl(input.request);
  const homework: any = await Homework.findOne({
    classroom: objectId(input.classroom?._id || input.classroom),
    ...(input.session?._id ? { sourceSessionId: objectId(input.session._id) } : {}),
    isPublished: { $ne: false },
  }).select("_id title").lean();
  const homeworkUrl = homework && appUrl ? `${appUrl}/homework/${homework._id}` : "";
  const nextSession = nextSessionAfter(input.classroom, input.session?.scheduledFor || input.classroom?.classDate);
  const classTitle = input.classroom?.title || "Class";
  const topicName = input.session?.topicName || input.classroom?.topicName || classTitle;
  const nextClassText = displayDateTime(nextSession?.scheduledFor);

  const deliveries = await Promise.all(students.map((student) => {
    const record = recordByStudent.get(objectId(student._id));
    const message = [
      `Hello ${student.name || "there"},`,
      "",
      `Here is your class summary for ${classTitle}.`,
      "",
      `Topic covered: ${topicName}`,
      `Attendance status: ${statusLabel(String(record?.status || ""))}`,
      homework ? `Homework: ${homework.title}` : "Homework: No homework has been linked yet.",
      homeworkUrl ? `Open homework: ${homeworkUrl}` : "",
      nextClassText ? `Next class: ${nextClassText}` : "Next class: Please check your dashboard for the latest schedule.",
    ].filter(Boolean).join("\n");
    const parentMessage = message.replace(`Hello ${student.name || "there"},`, `Hello ${student.parentName || "Parent"},`);
    return sendToStudentAndParent(student, `Class summary: ${topicName}`, message, parentMessage, {
      kind: "class_completed_summary",
      classroomId: objectId(input.classroom?._id || input.classroom),
      sessionId: objectId(input.session?._id || input.session),
      attendanceId: objectId(input.attendance?._id || input.attendance),
      homeworkId: objectId(homework?._id),
      href: homework ? `/homework/${homework._id}` : "/classrooms",
    });
  }));
  return { sent: deliveries.length };
}

export async function sendHomeworkSubmittedConfirmationEmail(input: {
  homework: any;
  studentId: unknown;
  submission: any;
  reward?: any;
  request?: Request;
}) {
  const student: any = await User.findById(input.studentId).select("name email parentName parentEmail").lean();
  if (!student?.email && !student?.parentEmail) return { sent: 0, skipped: true };
  const appUrl = resolvePublicAppUrl(input.request);
  const homeworkId = objectId(input.homework?._id || input.homework);
  const homeworkUrl = appUrl && homeworkId ? `${appUrl}/homework/${homeworkId}` : "";
  const submittedAt = displayDateTime(input.submission?.submittedAt || new Date());
  const message = [
    `Hello ${student.name || "there"},`,
    "",
    `Your homework submission has been received.`,
    "",
    `Homework: ${input.homework?.title || "Homework"}`,
    submittedAt ? `Submitted at: ${submittedAt}` : "",
    `Status: ${input.submission?.status || "submitted"}`,
    `Score: ${Number(input.submission?.totalScore || 0)}`,
    `Accuracy: ${Number(input.submission?.accuracy || 0)}%`,
    input.reward?.badge ? `Badge earned: ${input.reward.badge}` : "",
    "",
    homeworkUrl ? `Open homework: ${homeworkUrl}` : "Please sign in to your dashboard to review the submission.",
  ].filter(Boolean).join("\n");
  const parentMessage = message.replace(`Hello ${student.name || "there"},`, `Hello ${student.parentName || "Parent"},`);
  await sendToStudentAndParent(student, `Homework submitted: ${input.homework?.title || "Homework"}`, message, parentMessage, {
    kind: "homework_submitted_confirmation",
    homeworkId,
    submissionId: objectId(input.submission?._id),
    href: homeworkId ? `/homework/${homeworkId}` : "/homework",
  });
  return { sent: 1 };
}

export async function sendInvoiceOverdueEscalationEmail(input: {
  invoice: any;
  invoiceUrl: string;
  daysOverdue: number;
}) {
  const invoice = input.invoice;
  const student = invoice.student;
  if (!student?.email && !student?.parentEmail) return { sent: 0, skipped: true };
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-IN") : "Not set";
  const message = [
    `Hello ${student.name || "there"},`,
    "",
    `Action required: invoice ${invoice.invoiceNumber} is overdue by ${input.daysOverdue} day${input.daysOverdue === 1 ? "" : "s"}.`,
    "",
    `Invoice: ${invoice.invoiceNumber}`,
    `Details: ${invoice.title}`,
    `Amount: ${formatINR(invoice.totalAmount)}`,
    `Due date: ${dueDate}`,
    input.invoiceUrl ? `Payment / invoice link: ${input.invoiceUrl}` : "Please log in to your student portal to view and pay the invoice.",
    "",
    "If you have already paid, please share the payment reference with the academy team.",
  ].join("\n");
  const parentMessage = message.replace(`Hello ${student.name || "there"},`, `Hello ${student.parentName || "Parent"},`);
  await sendToStudentAndParent(student, "Action required: invoice overdue", message, parentMessage, {
    kind: "invoice_overdue_escalation",
    invoiceId: objectId(invoice._id),
    invoiceNumber: invoice.invoiceNumber,
    daysOverdue: input.daysOverdue,
    invoiceUrl: input.invoiceUrl,
  });
  return { sent: 1 };
}
