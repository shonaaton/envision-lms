import "server-only";

import { Types } from "mongoose";
import { unlink } from "fs/promises";
import path from "path";
import { Achievement } from "@/models/Achievement";
import { Activity } from "@/models/Activity";
import { Announcement } from "@/models/Announcement";
import { AskCoachConversation, AskCoachMessage } from "@/models/AskCoach";
import { AssignmentAutomationLog, AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Attendance } from "@/models/Attendance";
import { Batch } from "@/models/Batch";
import { Availability, Booking } from "@/models/Booking";
import { Classroom } from "@/models/Classroom";
import { ClassroomChatMessage, ClassroomSession, LiveQuestion, LiveQuestionResponse, StudentReward } from "@/models/ClassroomLive";
import { Course } from "@/models/Course";
import { CreditLedger, FeeAssignment, Invoice, Notification } from "@/models/Fee";
import { FeatureAccess, PermissionAudit, PermissionTemplate } from "@/models/FeatureAccess";
import { GoogleBusinessIntegration } from "@/models/GoogleBusinessIntegration";
import { Homework, Submission } from "@/models/Homework";
import { CoachApplication, DemoBooking } from "@/models/Onboarding";
import { Payment } from "@/models/Payment";
import { PGN } from "@/models/PGN";
import { PgnFolder } from "@/models/PgnFolder";
import { StudentPause } from "@/models/StudentPause";
import { TacticAttempt } from "@/models/TacticPuzzle";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import { User } from "@/models/User";

type CleanupSummary = {
  deletedRecords: number;
  detachedRecords: number;
};

function ids(items: any[]) {
  return items.map((item) => item._id);
}

/**
 * Permanently removes a user and records owned by that account. Shared academy
 * records are retained where possible and have the deleted user's references
 * removed. The User document is deleted last, so a failed cleanup can be retried.
 */
export async function deleteUserRecords(userIdValue: string): Promise<CleanupSummary> {
  const userId = new Types.ObjectId(userIdValue);
  const playerKey = `user:${userIdValue}`;
  const targetUser: any = await User.findById(userId).select("avatar").lean();
  let deletedRecords = 0;
  let detachedRecords = 0;

  async function remove(query: PromiseLike<any>) {
    const result = await query;
    deletedRecords += Number(result?.deletedCount || 0);
  }

  async function detach(query: PromiseLike<any>) {
    const result = await query;
    detachedRecords += Number(result?.modifiedCount || 0);
  }

  const directlyOwnedClassrooms = await Classroom.find({
    $or: [{ coach: userId }, { instructor: userId }, { testOwner: userId }],
  }).select("_id").lean();
  const childClassrooms = directlyOwnedClassrooms.length
    ? await Classroom.find({ parentClassroom: { $in: ids(directlyOwnedClassrooms) } }).select("_id").lean()
    : [];
  const classroomIds = ids([...directlyOwnedClassrooms, ...childClassrooms]);

  const homeworkDocs = await Homework.find({
    $or: [{ instructor: userId }, ...(classroomIds.length ? [{ classroom: { $in: classroomIds } }] : [])],
  }).select("_id").lean();
  const homeworkIds = ids(homeworkDocs);

  const sessionDocs = await ClassroomSession.find({
    $or: [{ coach: userId }, ...(classroomIds.length ? [{ classroom: { $in: classroomIds } }] : [])],
  }).select("_id").lean();
  const sessionIds = ids(sessionDocs);

  const questionDocs = await LiveQuestion.find({
    $or: [
      { createdBy: userId },
      ...(classroomIds.length ? [{ classroom: { $in: classroomIds } }] : []),
      ...(sessionIds.length ? [{ session: { $in: sessionIds } }] : []),
    ],
  }).select("_id").lean();
  const questionIds = ids(questionDocs);

  const templateDocs = await AssignmentTemplate.find({ createdBy: userId }).select("_id").lean();
  const templateIds = ids(templateDocs);
  const courseDocs = await Course.find({ createdBy: userId }).select("_id").lean();
  const courseIds = ids(courseDocs);
  const pgnDocs = await PGN.find({
    $or: [{ uploadedBy: userId }, ...(classroomIds.length ? [{ classroom: { $in: classroomIds } }] : [])],
  }).select("_id").lean();
  const pgnIds = ids(pgnDocs);
  const tournamentDocs = await Tournament.find({ createdBy: userId }).select("_id").lean();
  const tournamentIds = ids(tournamentDocs);
  const directConversationDocs = await AskCoachConversation.find({
    type: "direct",
    $or: [{ student: userId }, { coach: userId }, { participants: userId }],
  }).select("_id").lean();
  const directConversationIds = ids(directConversationDocs);

  const gameDocs = await TournamentGame.find({
    $or: [
      { whiteUser: userId },
      { blackUser: userId },
      { whiteKey: playerKey },
      { blackKey: playerKey },
      ...(tournamentIds.length ? [{ tournament: { $in: tournamentIds } }] : []),
    ],
  }).select("_id").lean();
  const gameIds = ids(gameDocs);

  await Promise.all([
    remove(Submission.deleteMany({ $or: [{ student: userId }, ...(homeworkIds.length ? [{ homework: { $in: homeworkIds } }] : [])] })),
    remove(LiveQuestionResponse.deleteMany({
      $or: [
        { student: userId },
        ...(questionIds.length ? [{ question: { $in: questionIds } }] : []),
        ...(classroomIds.length ? [{ classroom: { $in: classroomIds } }] : []),
      ],
    })),
    remove(ClassroomChatMessage.deleteMany({
      $or: [
        { sender: userId },
        { recipient: userId },
        ...(classroomIds.length ? [{ classroom: { $in: classroomIds } }] : []),
      ],
    })),
    remove(AskCoachMessage.deleteMany({
      $or: [
        { sender: userId },
        { receiver: userId },
        ...(directConversationIds.length ? [{ conversation: { $in: directConversationIds } }] : []),
      ],
    })),
    remove(Attendance.deleteMany({
      $or: [{ coach: userId }, ...(classroomIds.length ? [{ classroom: { $in: classroomIds } }] : [])],
    })),
    remove(Booking.deleteMany({
      $or: [
        { student: userId },
        { instructor: userId },
        ...(classroomIds.length ? [{ classroom: { $in: classroomIds } }] : []),
      ],
    })),
    remove(AssignmentAutomationLog.deleteMany({ $or: [
      { _id: { $in: [] } },
      ...(classroomIds.length ? [{ classroom: { $in: classroomIds } }] : []),
      ...(homeworkIds.length ? [{ homework: { $in: homeworkIds } }] : []),
      ...(templateIds.length ? [{ sourceTemplate: { $in: templateIds } }] : []),
    ] })),
    remove(TournamentGame.deleteMany({ _id: { $in: gameIds } })),
  ]);

  await Promise.all([
    remove(Homework.deleteMany({ _id: { $in: homeworkIds } })),
    remove(LiveQuestion.deleteMany({ _id: { $in: questionIds } })),
    remove(ClassroomSession.deleteMany({ _id: { $in: sessionIds } })),
    remove(Classroom.deleteMany({ _id: { $in: classroomIds } })),
    remove(AssignmentTemplate.deleteMany({ _id: { $in: templateIds } })),
    remove(Tournament.deleteMany({ _id: { $in: tournamentIds } })),
    remove(AskCoachConversation.deleteMany({ _id: { $in: directConversationIds } })),
    remove(PGN.deleteMany({ _id: { $in: pgnIds } })),
    remove(PgnFolder.deleteMany({ uploadedBy: userId })),
    remove(Course.deleteMany({ _id: { $in: courseIds } })),
    remove(Achievement.deleteMany({ createdBy: userId })),
    remove(Announcement.deleteMany({ $or: [{ createdBy: userId }, { targetUser: userId }] })),
  ]);

  await Promise.all([
    remove(Availability.deleteMany({ instructor: userId })),
    remove(StudentPause.deleteMany({ student: userId })),
    remove(FeeAssignment.deleteMany({ student: userId })),
    remove(Invoice.deleteMany({ student: userId })),
    remove(CreditLedger.deleteMany({ student: userId })),
    remove(Notification.deleteMany({ user: userId })),
    remove(Payment.deleteMany({ user: userId })),
    remove(TacticAttempt.deleteMany({ student: userId })),
    remove(StudentReward.deleteMany({ student: userId })),
    remove(PermissionAudit.deleteMany({ $or: [{ actor: userId }, { targetType: "user", targetId: userIdValue }] })),
    remove(Activity.deleteMany({ $or: [{ actor: userId }, { targetUser: userId }, { entityType: "User", entityId: userId }] })),
    remove(DemoBooking.deleteMany({ student: userId })),
    remove(CoachApplication.deleteMany({ convertedUser: userId })),
  ]);

  await Promise.all([
    detach(Batch.updateMany({ students: userId }, { $pull: { students: userId } })),
    detach(Batch.updateMany({ coach: userId }, { $unset: { coach: 1 } })),
    detach(Classroom.updateMany({ students: userId }, { $pull: { students: userId } })),
    detach(Homework.updateMany({ assignedStudents: userId }, { $pull: { assignedStudents: userId } })),
    detach(Attendance.updateMany({ "records.student": userId }, { $pull: { records: { student: userId } } })),
    detach(Attendance.updateMany({ markedBy: userId }, { $unset: { markedBy: 1 } })),
    detach(ClassroomSession.updateMany(
      { $or: [{ selectedStudents: userId }, { boardControlStudents: userId }, { "participants.user": userId }] },
      { $pull: { selectedStudents: userId, boardControlStudents: userId, participants: { user: userId } } }
    )),
    detach(ClassroomSession.updateMany({ "challenge.student": userId }, { $unset: { "challenge.student": 1 } })),
    detach(AskCoachConversation.updateMany({ type: "batch", participants: userId }, { $pull: { participants: userId } })),
    detach(AskCoachMessage.updateMany({ "readBy.user": userId }, { $pull: { readBy: { user: userId } } })),
    detach(AskCoachMessage.updateMany({ "moderationHistory.by": userId }, { $pull: { moderationHistory: { by: userId } } })),
    detach(Announcement.updateMany({ recipients: userId }, { $pull: { recipients: userId }, $inc: { recipientCount: -1 } })),
    detach(AssignmentTemplate.updateMany({ defaultStudents: userId }, { $pull: { defaultStudents: userId } })),
    detach(AssignmentTemplate.updateMany({ "source.pgnIds": { $in: pgnIds } }, { $pull: { "source.pgnIds": { $in: pgnIds } } })),
    detach(AssignmentTemplate.updateMany({ course: { $in: courseIds } }, { $unset: { course: 1 } })),
    detach(Homework.updateMany({ sourceTemplate: { $in: templateIds } }, { $unset: { sourceTemplate: 1 } })),
    detach(Classroom.updateMany({ course: { $in: courseIds } }, { $unset: { course: 1 } })),
    detach(AssignmentTemplate.updateMany({ updatedBy: userId }, { $unset: { updatedBy: 1 } })),
    detach(Achievement.updateMany({ updatedBy: userId }, { $unset: { updatedBy: 1 } })),
    detach(Announcement.updateMany({ editedBy: userId }, { $unset: { editedBy: 1 } })),
    detach(Announcement.updateMany({ "editHistory.editedBy": userId }, { $pull: { editHistory: { editedBy: userId } } })),
  ]);

  await Promise.all([
    detach(Tournament.updateMany(
      { _id: { $nin: tournamentIds }, $or: [{ participants: userId }, { "access.users": userId }, { "standings.user": userId }, { "standings.playerKey": playerKey }] },
      {
        $pull: {
          participants: userId,
          "access.users": userId,
          participantStates: { playerKey },
          initialParticipantKeys: playerKey,
          standings: { $or: [{ user: userId }, { playerKey }] },
          adminActions: { actor: userId },
          chatMessages: { senderKey: playerKey },
          "roundsData.$[].pairings": { $or: [{ whiteKey: playerKey }, { blackKey: playerKey }, { gameId: { $in: gameIds } }] },
        },
      }
    )),
    detach(Tournament.updateMany({ "adminActions.actor": userId }, { $pull: { adminActions: { actor: userId } } })),
    detach(Tournament.updateMany({ "chatMessages.senderKey": playerKey }, { $pull: { chatMessages: { senderKey: playerKey } } })),
    detach(FeatureAccess.updateMany(
      { $or: [{ pilotUsers: userId }, { "userOverrides.user": userId }] },
      { $pull: { pilotUsers: userId, userOverrides: { user: userId } } }
    )),
    detach(FeatureAccess.updateMany({ updatedBy: userId }, { $unset: { updatedBy: 1 } })),
    detach(PermissionTemplate.updateMany({ updatedBy: userId }, { $unset: { updatedBy: 1 } })),
    detach(GoogleBusinessIntegration.updateMany({ connectedBy: userId }, { $unset: { connectedBy: 1 } })),
    detach(CoachApplication.updateMany({ reviewedBy: userId }, { $unset: { reviewedBy: 1 } })),
    detach(DemoBooking.updateMany({ requestedCoach: userId }, { $unset: { requestedCoach: 1 } })),
    detach(DemoBooking.updateMany({ approvedCoach: userId }, { $unset: { approvedCoach: 1 } })),
    detach(DemoBooking.updateMany({ approvedBy: userId }, { $unset: { approvedBy: 1 } })),
    detach(DemoBooking.updateMany({ convertedBy: userId }, { $unset: { convertedBy: 1 } })),
  ]);

  await Promise.all([
    detach(Classroom.updateMany(
      { "generatedSessions.substituteCoach": userId },
      { $unset: { "generatedSessions.$[entry].substituteCoach": 1 } },
      { arrayFilters: [{ "entry.substituteCoach": userId }] }
    )),
    detach(Classroom.updateMany(
      { "generatedSessions.conductedBy": userId },
      { $unset: { "generatedSessions.$[entry].conductedBy": 1 } },
      { arrayFilters: [{ "entry.conductedBy": userId }] }
    )),
  ]);

  await remove(User.deleteOne({ _id: userId }));
  if (typeof targetUser?.avatar === "string" && targetUser.avatar.startsWith("/images/profiles/")) {
    const filename = path.basename(targetUser.avatar);
    if (filename === targetUser.avatar.slice("/images/profiles/".length)) {
      await unlink(path.join(process.cwd(), "public", "images", "profiles", filename)).catch(() => undefined);
    }
  }
  return { deletedRecords, detachedRecords };
}
