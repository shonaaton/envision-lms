import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";

function recordId(value: any) {
  return String(value?._id || value || "");
}

export async function getCoachAssignedStudentIds(coachId: string) {
  const classrooms: any[] = await Classroom.find(
    { $or: [{ instructor: coachId }, { coach: coachId }] },
    { students: 1, batches: 1 }
  ).lean();

  const studentIds = new Set<string>();
  const classroomBatchIds = new Set<string>();

  classrooms.forEach((classroom) => {
    (classroom.students || []).forEach((student: any) => {
      const id = recordId(student);
      if (id) studentIds.add(id);
    });
    (classroom.batches || []).forEach((batch: any) => {
      const id = recordId(batch);
      if (id) classroomBatchIds.add(id);
    });
  });

  const batches: any[] = await Batch.find(
    {
      $and: [
        { isActive: { $ne: false } },
        { $or: [{ coach: coachId }, { _id: { $in: Array.from(classroomBatchIds) } }] },
      ],
    },
    { students: 1 }
  ).lean();

  batches.forEach((batch) => {
    (batch.students || []).forEach((student: any) => {
      const id = recordId(student);
      if (id) studentIds.add(id);
    });
  });

  return Array.from(studentIds);
}
