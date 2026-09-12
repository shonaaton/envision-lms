import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { studentExitDate } from "@/lib/classroomStudentExits";

function idOf(value: any) {
  return String(value?._id || value || "");
}

export async function canStudentAccessHomework(homework: any, studentId: string) {
  if ((homework.assignedStudents || []).some((student: any) => idOf(student) === studentId)) return true;

  const assignedBatchIds = (homework.assignedBatches || []).map(idOf).filter(Boolean);
  if (assignedBatchIds.length && await Batch.exists({ _id: { $in: assignedBatchIds }, students: studentId })) return true;

  const hasSpecificRecipients = Boolean((homework.assignedStudents || []).length || assignedBatchIds.length);
  if (homework.assignAllStudents || !hasSpecificRecipients) {
    if (!homework.classroom) return false;
    // Membership alone is not enough any more: a student who changed batch is
    // deliberately left in `Classroom.students` so their history survives, and
    // their claim on the classroom's homework stops on the day they left.
    const classroom: any = await Classroom.findOne(
      { _id: homework.classroom, students: studentId },
      { studentExits: 1 },
    ).lean();
    if (!classroom) return false;
    const exitedAt = studentExitDate(classroom, studentId);
    if (!exitedAt) return true;
    const setAt = homework.createdAt ? new Date(homework.createdAt) : null;
    return Boolean(setAt && !Number.isNaN(setAt.getTime()) && setAt.getTime() <= exitedAt.getTime());
  }

  return false;
}
