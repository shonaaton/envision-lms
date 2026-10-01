import { Classroom } from "@/models/Classroom";
import { ClassroomSession } from "@/models/ClassroomLive";
import { Attendance } from "@/models/Attendance";
import { applyPermanentCoachChange } from "@/lib/classroomCoachChange";
import { syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";
import { transferPendingFeedbackToCoach } from "@/lib/feedback/feedbackService";
import { resolveCoachMissingTask } from "@/lib/tasks/taskTriggers";

function idOf(value: any) {
  return String(value?._id || value || "");
}

/**
 * A batch handed to a new coach from the batch form takes its running
 * classrooms with it. Without this only `Batch.coach` moved: every classroom
 * still named the old coach, so the Classrooms page (and the coach's own list,
 * pay and attendance) kept the batch under the old coach.
 *
 * Same rules as a classroom's "Permanent Coach Change": history stays credited
 * to the old coach, upcoming classes move. A classroom of the batch that some
 * other coach runs keeps its coach. The batch notification already told both
 * coaches, so no per-classroom notices are sent here.
 */
export async function handOverBatchClassrooms(input: {
  batchId: string;
  fromCoachId: string;
  toCoachId: string;
  actorId?: string;
}) {
  const { batchId, fromCoachId, toCoachId } = input;
  if (!batchId || !toCoachId || fromCoachId === toCoachId) return { classroomsMoved: 0 };
  const heldBy = fromCoachId
    ? { $or: [{ coach: fromCoachId }, { coach: null, instructor: fromCoachId }] }
    : { coach: null };
  const classrooms = await Classroom.find({
    batches: batchId,
    isSessionInstance: { $ne: true },
    classroomType: { $ne: "demo" },
    status: { $nin: ["completed", "cancelled"] },
    ...heldBy,
  });

  let classroomsMoved = 0;
  for (const classroom of classrooms as any[]) {
    const change = applyPermanentCoachChange(classroom, toCoachId);
    await classroom.save();
    classroomsMoved += 1;
    const classroomId = idOf(classroom._id);
    if (change.reassignedSessionIds.length) {
      await Promise.all([
        ClassroomSession.updateMany(
          { classroom: classroomId, scheduledSessionId: { $in: change.reassignedSessionIds } },
          { $set: { coach: toCoachId } }
        ),
        Attendance.updateMany(
          { classroom: classroomId, scheduledSessionId: { $in: change.reassignedSessionIds } },
          { $set: { coach: toCoachId } }
        ),
      ]);
    }
    await syncClassroomSessionInstances(classroomId);
    if (change.previousCoachId) {
      await transferPendingFeedbackToCoach({ classroomId, fromCoachId: change.previousCoachId, toCoachId })
        .catch((error) => console.error("Feedback transfer on batch coach change failed", error));
    }
    for (const sessionId of change.reassignedSessionIds.slice(0, 20)) {
      await resolveCoachMissingTask(sessionId, input.actorId, "The batch has a new coach.");
    }
  }
  return { classroomsMoved };
}
