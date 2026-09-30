import "server-only";

import { Types } from "mongoose";
import { deleteClassroomRecords } from "@/lib/deleteClassroomRecords";
import { deleteClassroomSessionInstances } from "@/lib/classroomSessionInstances";
import { deleteUserRecords } from "@/lib/deleteUserRecords";
import { Activity } from "@/models/Activity";
import { Booking } from "@/models/Booking";
import { Classroom } from "@/models/Classroom";
import { CoachPayProposal, NoShowRuling, SessionPayOverride } from "@/models/CoachPay";
import { InternalTask } from "@/models/InternalTask";
import { DemoFeedback } from "@/models/Onboarding";
import { User } from "@/models/User";

export type DeleteDemoOptions = {
  /** Also delete the coach's assessment. Off by default - see demo-assessments-must-persist. */
  includeAssessment?: boolean;
  /** Also delete the demo account, when it is still a demo account with no other bookings. */
  includeAccount?: boolean;
};

export type DeleteDemoSummary = {
  classrooms: number;
  assessments: number;
  tasks: number;
  accountDeleted: boolean;
};

/**
 * Whether a demo's student account can go with it: still a demo (never
 * converted) and not attached to any other booking.
 */
export async function demoAccountDeletable(booking: { _id: unknown; student?: unknown }) {
  const studentId = String((booking.student as any)?._id || booking.student || "");
  if (!Types.ObjectId.isValid(studentId)) return false;
  const [student, otherBookings]: [any, number] = await Promise.all([
    User.findById(studentId).select("role accountStatus").lean(),
    Booking.countDocuments({ student: studentId, _id: { $ne: booking._id } }),
  ]);
  return Boolean(student && student.role === "student" && student.accountStatus === "demo" && otherBookings === 0);
}

/**
 * Permanently removes a demo request - for test and junk demos, not for real
 * leads (those are archived). Takes the demo classroom and everything under it
 * (attendance, live sessions, homework, coach-pay rulings), the tasks raised
 * about it and its activity trail. The coach's assessment and the demo account
 * are kept unless asked for.
 *
 * A raw delete fires none of the Booking save hooks, so nothing is sent to
 * Kraya or Meta; a lead already mirrored there stays where it is.
 */
export async function deleteDemoRecords(bookingIdValue: string, options: DeleteDemoOptions = {}): Promise<DeleteDemoSummary> {
  const bookingId = new Types.ObjectId(bookingIdValue);
  const booking: any = await Booking.findById(bookingId).select("_id bookingType student classroom startAt").lean();
  if (!booking || booking.bookingType !== "demo") throw new Error("That demo request no longer exists.");

  const deleteAccount = options.includeAccount ? await demoAccountDeletable(booking) : false;

  // Only demo classrooms: the booking's classroom link is checked for type so a
  // bad link can never take a regular class with it.
  const classrooms: any[] = await Classroom.find({
    $or: [
      { demoBooking: bookingId },
      ...(booking.classroom ? [{ _id: booking.classroom, classroomType: "demo" }] : []),
    ],
    isSessionInstance: { $ne: true },
  }).select("_id").lean();
  const classroomIds = classrooms.map((classroom) => classroom._id);

  for (const classroomId of classroomIds) {
    await deleteClassroomRecords(String(classroomId));
    await deleteClassroomSessionInstances(String(classroomId));
  }

  const assessments: any[] = await DemoFeedback.find({ booking: bookingId }).select("_id").lean();
  const assessmentIds = assessments.map((item) => item._id);
  const taskReferences = [bookingId, ...classroomIds, ...(options.includeAssessment ? assessmentIds : [])];

  const [, , , tasks, assessmentResult] = await Promise.all([
    classroomIds.length ? SessionPayOverride.deleteMany({ classroom: { $in: classroomIds } }) : null,
    classroomIds.length ? NoShowRuling.deleteMany({ classroom: { $in: classroomIds } }) : null,
    classroomIds.length ? CoachPayProposal.deleteMany({ classroom: { $in: classroomIds } }) : null,
    InternalTask.deleteMany({ referenceId: { $in: taskReferences } }),
    options.includeAssessment && assessmentIds.length ? DemoFeedback.deleteMany({ _id: { $in: assessmentIds } }) : null,
    Activity.deleteMany({ entityType: { $in: ["Booking", "Classroom"] }, entityId: { $in: [bookingId, ...classroomIds] } }),
  ]);

  if (classroomIds.length) await Classroom.deleteMany({ _id: { $in: classroomIds } });
  if (!options.includeAssessment && assessmentIds.length) {
    // A kept assessment outlives the booking, classroom and maybe the account
    // it points at; display code falls back to these snapshots.
    const student: any = booking.student ? await User.findById(booking.student).select("name").lean() : null;
    await DemoFeedback.updateMany(
      { _id: { $in: assessmentIds }, demoStartAt: { $exists: false } },
      { $set: { demoStartAt: booking.startAt } }
    );
    if (student?.name) {
      await DemoFeedback.updateMany({ _id: { $in: assessmentIds }, studentName: { $in: [null, ""] } }, { $set: { studentName: student.name } });
    }
  }
  await Booking.deleteOne({ _id: bookingId });
  if (deleteAccount) await deleteUserRecords(String(booking.student));

  return {
    classrooms: classroomIds.length,
    assessments: Number((assessmentResult as any)?.deletedCount || 0),
    tasks: Number((tasks as any)?.deletedCount || 0),
    accountDeleted: deleteAccount,
  };
}
