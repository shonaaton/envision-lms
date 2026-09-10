import "server-only";

import { Types } from "mongoose";

import { recordActivity } from "@/lib/activity";
import {
  notifyStudentBatchChanged,
  notifyStudentsJoinedBatchCoach,
  notifyStudentsLeftBatchCoach,
} from "@/lib/batchMembershipNotifications";
import { exitStudentId as idOf, sessionStartDate, studentExitDate } from "@/lib/classroomStudentExits";
import { syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";
import { pausedStudentIds } from "@/lib/studentPause";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

export type TransferActor = { id: string; name?: string; role?: string };

export type TransferStudentBatchInput = {
  studentId: string;
  fromBatchId?: string;
  toBatchId: string;
  reason?: string;
  actor: TransferActor;
};

/** Classrooms a batch owns, excluding the per-session shadow copies. */
function batchClassroomQuery(batchId: string, runningOnly: boolean) {
  return {
    batches: new Types.ObjectId(batchId),
    isSessionInstance: { $ne: true },
    ...(runningOnly
      ? { isActive: { $ne: false }, status: { $nin: ["completed", "cancelled"] } }
      : {}),
  };
}

/**
 * Cut a student's future off in every classroom the batch they are leaving owns.
 *
 * The membership itself is left alone on purpose - see `classroomStudentExits.ts`.
 * Stripping them from the upcoming session rosters here is what takes them off
 * the coach's register and the attendance sheet; the exit record is what keeps
 * them out even when a roster empties and falls back to the whole classroom.
 */
export async function recordStudentExitFromBatchClassrooms(
  batchId: string,
  studentIds: string[],
  options: { exitedAt: Date; reason?: string; movedToBatch?: string; actorId?: string }
) {
  if (!batchId || !Types.ObjectId.isValid(batchId) || !studentIds.length) {
    return { classroomsUpdated: 0, sessionsTrimmed: 0 };
  }
  const wanted = new Set(studentIds);
  const classrooms: any[] = await Classroom.find(batchClassroomQuery(batchId, false));
  let classroomsUpdated = 0;
  let sessionsTrimmed = 0;

  for (const classroom of classrooms) {
    const memberIds = (classroom.students || []).map(idOf);
    const leaving = studentIds.filter((studentId) => memberIds.includes(studentId));
    if (!leaving.length) continue;

    const exits = Array.isArray(classroom.studentExits) ? classroom.studentExits : [];
    // One live exit per student: re-leaving after being moved back replaces the
    // old record rather than stacking a second, older cut on top of it.
    classroom.studentExits = [
      ...exits.filter((exit: any) => !wanted.has(idOf(exit?.student))),
      ...leaving.map((studentId) => ({
        student: new Types.ObjectId(studentId),
        exitedAt: options.exitedAt,
        reason: options.reason || "batch_changed",
        fromBatch: new Types.ObjectId(batchId),
        movedToBatch:
          options.movedToBatch && Types.ObjectId.isValid(options.movedToBatch)
            ? new Types.ObjectId(options.movedToBatch)
            : undefined,
        recordedBy:
          options.actorId && Types.ObjectId.isValid(options.actorId)
            ? new Types.ObjectId(options.actorId)
            : undefined,
      })),
    ];

    (classroom.generatedSessions || []).forEach((session: any) => {
      const startsAt = sessionStartDate(classroom, session);
      // A class already taught stays on their record even if it ran today.
      if (startsAt && startsAt.getTime() <= options.exitedAt.getTime()) return;
      if (!Array.isArray(session.students) || !session.students.length) return;
      const next = session.students.filter((student: any) => !wanted.has(idOf(student)));
      if (next.length === session.students.length) return;
      session.students = next;
      sessionsTrimmed += 1;
    });

    await classroom.save();
    await syncClassroomSessionInstances(idOf(classroom._id)).catch(() => undefined);
    classroomsUpdated += 1;
  }

  return { classroomsUpdated, sessionsTrimmed };
}

/**
 * Put a student back into the running classrooms of the batch they are joining.
 *
 * Sessions that already happened are none of their business, so any past
 * session still inheriting its roster from the classroom gets that roster
 * written out explicitly first - otherwise adding the student to
 * `classroom.students` would retroactively put them in classes they never sat.
 */
export async function enrollStudentInBatchClassrooms(
  batchId: string,
  studentId: string,
  options: { joinedAt: Date; skipIfPaused?: boolean }
) {
  if (!batchId || !Types.ObjectId.isValid(batchId)) return 0;
  if (options.skipIfPaused) {
    const paused = await pausedStudentIds();
    if (paused.has(studentId)) return 0;
  }
  const classrooms: any[] = await Classroom.find(batchClassroomQuery(batchId, true));
  let updated = 0;

  for (const classroom of classrooms) {
    let changed = false;
    const roster = (classroom.students || []).map(idOf).filter(Boolean);
    const alreadyMember = roster.includes(studentId);

    // Coming back to a classroom they had left clears the old cut.
    if (studentExitDate(classroom, studentId)) {
      classroom.studentExits = (classroom.studentExits || []).filter((exit: any) => idOf(exit?.student) !== studentId);
      changed = true;
    }

    (classroom.generatedSessions || []).forEach((session: any) => {
      const startsAt = sessionStartDate(classroom, session);
      const inThePast = Boolean(startsAt && startsAt.getTime() < options.joinedAt.getTime());
      const hasOwnRoster = Array.isArray(session.students) && session.students.length > 0;

      if (inThePast) {
        if (!hasOwnRoster && !alreadyMember && roster.length) {
          // Freeze who was actually in the room before the new arrival lands in
          // `classroom.students` and the fallback sweeps them in.
          session.students = roster.map((id: string) => new Types.ObjectId(id));
          changed = true;
        }
        return;
      }
      if (session.actualEndedAt) return;
      if (!hasOwnRoster) return; // inherits the classroom, which is about to include them
      if (session.students.some((student: any) => idOf(student) === studentId)) return;
      session.students = [...session.students, new Types.ObjectId(studentId)];
      changed = true;
    });

    if (!alreadyMember) {
      classroom.students = [...(classroom.students || []), new Types.ObjectId(studentId)];
      changed = true;
    }

    if (changed) {
      await classroom.save();
      await syncClassroomSessionInstances(idOf(classroom._id)).catch(() => undefined);
      updated += 1;
    }
  }

  return updated;
}

/**
 * Move one student from one batch to another.
 *
 * The cut is "now": every class and every piece of homework they were given up
 * to this moment stays theirs to read, and from this moment on they belong to
 * the new batch and see only its work. Attendance, submissions and invoices are
 * deliberately untouched - none of them are batch-scoped, and rewriting history
 * is not what a transfer means.
 */
export async function transferStudentBatch(input: TransferStudentBatchInput) {
  const studentId = String(input.studentId || "");
  const toBatchId = String(input.toBatchId || "");
  if (!Types.ObjectId.isValid(studentId)) throw new Error("Choose the student to move.");
  if (!Types.ObjectId.isValid(toBatchId)) throw new Error("Choose the batch to move them into.");

  const student: any = await User.findOne({ _id: studentId, role: "student" })
    .select("name email batches isActive isPaused")
    .lean();
  if (!student) throw new Error("Student not found.");
  if (student.isActive === false) {
    throw new Error("This student's account is deactivated. Reactivate them before moving batches.");
  }

  const currentBatchIds = (student.batches || []).map(idOf).filter(Boolean);
  const fromBatchId =
    input.fromBatchId && Types.ObjectId.isValid(input.fromBatchId)
      ? String(input.fromBatchId)
      : currentBatchIds.length === 1
        ? currentBatchIds[0]
        : "";
  if (!fromBatchId && currentBatchIds.length > 1) {
    throw new Error("This student is in more than one batch. Say which one they are leaving.");
  }
  if (fromBatchId === toBatchId) throw new Error("The student is already in that batch.");
  if (fromBatchId && !currentBatchIds.includes(fromBatchId)) {
    throw new Error("This student is not in the batch you are moving them out of.");
  }

  const [fromBatch, toBatch]: any[] = await Promise.all([
    fromBatchId ? Batch.findById(fromBatchId).select("name studentEnrollments").lean() : Promise.resolve(null),
    Batch.findById(toBatchId).select("name capacity students studentEnrollments isActive").lean(),
  ]);
  if (fromBatchId && !fromBatch) throw new Error("The batch they are leaving no longer exists.");
  if (!toBatch) throw new Error("The batch you picked no longer exists.");

  const exitedAt = new Date();

  // Leaving first, so a classroom shared by both batches ends up reflecting the
  // arrival rather than the departure.
  let classroomsClosed = 0;
  if (fromBatchId) {
    const result = await recordStudentExitFromBatchClassrooms(fromBatchId, [studentId], {
      exitedAt,
      reason: "batch_changed",
      movedToBatch: toBatchId,
      actorId: input.actor?.id,
    });
    classroomsClosed = result.classroomsUpdated;
    await Batch.updateOne(
      { _id: fromBatchId },
      { $pull: { students: new Types.ObjectId(studentId), studentEnrollments: { student: new Types.ObjectId(studentId) } } }
    );
    await User.updateOne({ _id: studentId }, { $pull: { batches: new Types.ObjectId(fromBatchId) } });
  }

  await Batch.updateOne({ _id: toBatchId }, { $addToSet: { students: new Types.ObjectId(studentId) } });
  const alreadyEnrolled = (toBatch.studentEnrollments || []).some((entry: any) => idOf(entry?.student) === studentId);
  if (!alreadyEnrolled) {
    await Batch.updateOne(
      { _id: toBatchId },
      { $push: { studentEnrollments: { student: new Types.ObjectId(studentId), enrolledAt: exitedAt } } }
    );
  }
  await User.updateOne({ _id: studentId }, { $addToSet: { batches: new Types.ObjectId(toBatchId) } });

  // A paused student keeps the new batch on their record but stays off its
  // upcoming registers until they are reinstated.
  const classroomsJoined = await enrollStudentInBatchClassrooms(toBatchId, studentId, {
    joinedAt: exitedAt,
    skipIfPaused: true,
  });

  await Notification.create({
    user: studentId,
    type: "batch_changed",
    title: `You have moved to ${toBatch.name}`,
    message: `Your classes now run with ${toBatch.name}${fromBatch ? `, not ${fromBatch.name}` : ""}. Everything from your old batch up to today stays in your account to look back on.`,
    metadata: { fromBatch: fromBatchId, toBatch: toBatchId, effectiveFrom: exitedAt },
  }).catch(() => undefined);

  // Announcements run after the move has landed, so every message quotes the
  // batches as they now stand. None of them may fail the transfer itself, and
  // the outgoing coach is told only that the student has left - `toBatch` is
  // deliberately not passed to `notifyStudentsLeftBatchCoach`.
  if (fromBatchId) {
    await notifyStudentsLeftBatchCoach({
      batchId: fromBatchId,
      studentIds: [studentId],
      reason: "batch_changed",
      effectiveFrom: exitedAt,
    }).catch((error) => console.error("Batch departure notification failed", error));
  }
  await notifyStudentBatchChanged({ studentId, toBatchId, fromBatchId })
    .catch((error) => console.error("Batch change notification failed", error));
  await notifyStudentsJoinedBatchCoach({ batchId: toBatchId, studentIds: [studentId], reason: "batch_changed" })
    .catch((error) => console.error("Batch arrival notification failed", error));

  await recordActivity({
    actor: input.actor?.id,
    targetUser: studentId,
    type: "student.batch.changed",
    label: `Moved ${student.name} from ${fromBatch?.name || "no batch"} to ${toBatch.name}`,
    entityType: "User",
    entityId: studentId,
    metadata: {
      fromBatch: fromBatchId,
      fromBatchName: fromBatch?.name || "",
      toBatch: toBatchId,
      toBatchName: toBatch.name,
      effectiveFrom: exitedAt,
      classroomsClosed,
      classroomsJoined,
      reason: input.reason || "",
    },
  });

  return {
    studentName: student.name,
    fromBatchName: fromBatch?.name || "",
    toBatchName: toBatch.name,
    effectiveFrom: exitedAt,
    classroomsClosed,
    classroomsJoined,
  };
}
