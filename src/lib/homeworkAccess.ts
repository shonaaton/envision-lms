import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";

function idOf(value: any) {
  return String(value?._id || value || "");
}

export async function canStudentAccessHomework(homework: any, studentId: string) {
  if ((homework.assignedStudents || []).some((student: any) => idOf(student) === studentId)) return true;

  const assignedBatchIds = (homework.assignedBatches || []).map(idOf).filter(Boolean);
  if (assignedBatchIds.length && await Batch.exists({ _id: { $in: assignedBatchIds }, students: studentId })) return true;

  const hasSpecificRecipients = Boolean((homework.assignedStudents || []).length || assignedBatchIds.length);
  if (homework.assignAllStudents || !hasSpecificRecipients) {
    return Boolean(await Classroom.exists({ _id: homework.classroom, students: studentId }));
  }

  return false;
}
