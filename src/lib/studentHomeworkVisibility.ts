import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";
import { exitStudentId as idOf, studentExitDate } from "@/lib/classroomStudentExits";

/**
 * Which homework a student may see.
 *
 * The same clause set was written out twice - in the homework API and the
 * homework page - and only one of them would ever have been remembered when the
 * rules changed. It lives here now, with the batch-change cut folded in:
 *
 *   - a classroom they are still in     -> everything, as before
 *   - a classroom they have left        -> only homework set on or before the
 *                                          day they left, so the work they were
 *                                          actually given stays completable and
 *                                          nothing new from that batch appears
 *   - assigned to them by name          -> always theirs, whatever the batch
 *
 * The batch they left is matched the same way, because homework aimed at a
 * whole batch never names the classroom.
 */
export async function studentHomeworkFilter(userId: string) {
  const [classrooms, me, batchMemberships] = await Promise.all([
    Classroom.find({ students: userId }, { _id: 1, studentExits: 1 }).lean(),
    User.findById(userId, { batches: 1 }).lean(),
    Batch.find({ students: userId }, { _id: 1 }).lean(),
  ]);

  const currentClassroomIds: any[] = [];
  // A batch is only "left" if the student is no longer a member of it - a
  // classroom can be shared by two batches, and one exit must not hide the work
  // of a batch they are still sitting in.
  const exitedByBatch = new Map<string, Date>();
  const perClassroomClauses: any[] = [];

  classrooms.forEach((classroom: any) => {
    const exitedAt = studentExitDate(classroom, userId);
    if (!exitedAt) {
      currentClassroomIds.push(classroom._id);
      return;
    }
    perClassroomClauses.push(
      { classroom: classroom._id, createdAt: { $lte: exitedAt }, assignAllStudents: true },
      { classroom: classroom._id, createdAt: { $lte: exitedAt }, assignedStudents: { $size: 0 }, assignedBatches: { $size: 0 } },
    );
    (classroom.studentExits || []).forEach((exit: any) => {
      if (idOf(exit?.student) !== userId) return;
      const fromBatchId = idOf(exit?.fromBatch);
      if (!fromBatchId) return;
      const existing = exitedByBatch.get(fromBatchId);
      if (!existing || exitedAt.getTime() > existing.getTime()) exitedByBatch.set(fromBatchId, exitedAt);
    });
  });

  const currentBatchIds = Array.from(new Set([
    ...((me as any)?.batches || []).map((id: any) => id.toString()),
    ...batchMemberships.map((batch: any) => batch._id.toString()),
  ]));
  currentBatchIds.forEach((batchId) => exitedByBatch.delete(batchId));

  const exitedBatchClauses = Array.from(exitedByBatch.entries()).map(([batchId, exitedAt]) => ({
    assignedBatches: batchId,
    createdAt: { $lte: exitedAt },
  }));

  return {
    $or: [
      { assignedStudents: userId },
      { assignedBatches: { $in: currentBatchIds } },
      { classroom: { $in: currentClassroomIds }, assignAllStudents: true },
      { classroom: { $in: currentClassroomIds }, assignedStudents: { $size: 0 }, assignedBatches: { $size: 0 } },
      ...perClassroomClauses,
      ...exitedBatchClauses,
    ],
  };
}
