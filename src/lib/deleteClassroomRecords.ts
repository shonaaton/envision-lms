import "server-only";

import { Attendance } from "@/models/Attendance";
import { AssignmentAutomationLog } from "@/models/AssignmentTemplate";
import { Booking } from "@/models/Booking";
import { ClassroomChatMessage, ClassroomSession, LiveQuestion, LiveQuestionResponse } from "@/models/ClassroomLive";
import { Homework, Submission } from "@/models/Homework";
import { DemoBooking } from "@/models/Onboarding";
import { PGN } from "@/models/PGN";

/**
 * Removes everything that hangs off a classroom before the classroom itself is
 * deleted. PGNs are kept (made private) and bookings are detached, not deleted.
 */
export async function deleteClassroomRecords(classroomId: string) {
  const questions = await LiveQuestion.find({ classroom: classroomId }).select("_id").lean();
  const questionIds = questions.map((question: any) => question._id);
  const homework = await Homework.find({ classroom: classroomId }).select("_id").lean();
  const homeworkIds = homework.map((item: any) => item._id);
  await Promise.all([
    Attendance.deleteMany({ classroom: classroomId }),
    ClassroomSession.deleteMany({ classroom: classroomId }),
    ClassroomChatMessage.deleteMany({ classroom: classroomId }),
    questionIds.length ? LiveQuestionResponse.deleteMany({ question: { $in: questionIds } }) : Promise.resolve(),
    LiveQuestion.deleteMany({ classroom: classroomId }),
    homeworkIds.length ? Submission.deleteMany({ homework: { $in: homeworkIds } }) : Promise.resolve(),
    Homework.deleteMany({ classroom: classroomId }),
    AssignmentAutomationLog.deleteMany({ classroom: classroomId }),
    PGN.updateMany({ classroom: classroomId }, { $unset: { classroom: 1 }, $set: { visibility: "private" } }),
    Booking.updateMany({ classroom: classroomId }, { $unset: { classroom: 1 } }),
    DemoBooking.updateMany({ classroom: classroomId }, { $unset: { classroom: 1 } }),
  ]);
}
