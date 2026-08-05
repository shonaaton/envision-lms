import { ACADEMY_TIME_ZONE, formatAcademyDateTime } from "@/lib/academyTime";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function uniqueIds(values: any[]) {
  return Array.from(new Set(values.map(objectId).filter(Boolean)));
}

function deadlineText(dueAt?: string | Date | null) {
  if (!dueAt) return "No submission deadline has been set.";
  const timeZoneLabel = ACADEMY_TIME_ZONE === "Asia/Kolkata" ? "IST" : ACADEMY_TIME_ZONE;
  return `${formatAcademyDateTime(dueAt)} (${timeZoneLabel})`;
}

export function buildHomeworkAssignmentEmail(input: {
  studentName?: string;
  title: string;
  classroomTitle?: string;
  dueAt?: string | Date | null;
  assignmentUrl?: string;
}) {
  const greeting = input.studentName?.trim() ? `Hello ${input.studentName.trim()},` : "Hello,";
  const lines = [
    greeting,
    "",
    `A new assignment, “${input.title}”, has been shared with you on the Envision Chess Academy platform.`,
  ];
  if (input.classroomTitle) lines.push(`Classroom: ${input.classroomTitle}`);
  lines.push(
    `Submission deadline: ${deadlineText(input.dueAt)}`,
    "",
    input.assignmentUrl ? `Open assignment: ${input.assignmentUrl}` : "Please sign in to your academy dashboard to open the assignment."
  );

  return {
    subject: `New assignment: ${input.title}`,
    message: lines.join("\n"),
  };
}

export async function notifyHomeworkAssigned(homework: any, request?: Request) {
  const classroomId = objectId(homework.classroom);
  const directStudentIds = uniqueIds(homework.assignedStudents || []);
  const batchIds = uniqueIds(homework.assignedBatches || []);

  const [classroom, batches] = await Promise.all([
    Classroom.findById(classroomId).select("title students").lean(),
    batchIds.length ? Batch.find({ _id: { $in: batchIds } }).select("students").lean() : [],
  ]);

  const batchStudentIds = (batches as any[]).flatMap((batch: any) => batch.students || []);
  const hasSpecificRecipients = directStudentIds.length > 0 || batchIds.length > 0;
  const classroomStudentIds = homework.assignAllStudents || !hasSpecificRecipients
    ? ((classroom as any)?.students || [])
    : [];
  const recipientIds = uniqueIds([...directStudentIds, ...batchStudentIds, ...classroomStudentIds]);
  if (!recipientIds.length) return { recipients: 0, delivered: 0, skipped: 0 };

  const students: any[] = await User.find({
    _id: { $in: recipientIds },
    role: "student",
    isActive: { $ne: false },
  }).select("name email").lean();
  const appUrl = resolvePublicAppUrl(request);
  const assignmentId = objectId(homework._id);
  const href = assignmentId ? `/homework/${assignmentId}` : "/homework";
  const assignmentUrl = appUrl ? `${appUrl}${href}` : "";

  const deliveries = await Promise.all(
    students
      .filter((student) => Boolean(student.email))
      .map((student) => {
        const email = buildHomeworkAssignmentEmail({
          studentName: student.name,
          title: String(homework.title || "Assignment"),
          classroomTitle: String((classroom as any)?.title || ""),
          dueAt: homework.dueAt,
          assignmentUrl,
        });
        return sendAutomationEmail({
          to: String(student.email),
          ...email,
          metadata: {
            homeworkId: assignmentId,
            classroomId,
            dueAt: homework.dueAt ? new Date(homework.dueAt).toISOString() : null,
            href,
            channel: "homework_assigned",
          },
        });
      })
  );

  return {
    recipients: students.length,
    delivered: deliveries.filter((delivery) => delivery.delivered).length,
    skipped: deliveries.filter((delivery) => delivery.skipped).length,
  };
}
