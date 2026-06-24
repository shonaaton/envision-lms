import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { PGN } from "@/models/PGN";
import { ClassroomChatMessage, ClassroomSession, LiveQuestion, LiveQuestionResponse } from "@/models/ClassroomLive";
import { getLiveClassroomForUser, type AppRole } from "@/lib/liveClassroomAccess";
import {
  buildLiveSessionKey,
  ensureLiveSessionIndexes,
  getRequestedSessionId,
  markScheduledSessionFinished,
  markScheduledSessionStarted,
  resolveScheduledSession,
} from "@/lib/classroomLiveSession";

export const dynamic = "force-dynamic";

function canCoach(role: string | undefined) {
  return role === "admin" || role === "instructor";
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  await ensureLiveSessionIndexes();
  const requestedSessionId = getRequestedSessionId(_);
  const role = (session.user as { role?: AppRole }).role;
  const userId = (session.user as { id?: string }).id || "";
  if (!role || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { classroom, allowed } = await getLiveClassroomForUser(params.id, role, userId);
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const classroomDoc: any = classroom;
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const scheduledSession: any = resolveScheduledSession(classroomDoc, requestedSessionId);
  if (!scheduledSession) return NextResponse.json({ error: "Scheduled session not found" }, { status: 404 });
  const scheduledSessionId = String(scheduledSession._id);
  let live: any = await ClassroomSession.findOne({ classroom: params.id, scheduledSessionId })
    .populate("selectedStudents boardControlStudents challenge.student participants.user", "name username role")
    .lean();
  if (!live) {
    const created = await ClassroomSession.create({
      classroom: params.id,
      scheduledSessionId,
      sessionKey: buildLiveSessionKey(params.id, scheduledSessionId),
      coach: classroomDoc.coach || classroomDoc.instructor,
      topic: scheduledSession.topicName || classroomDoc.topicName || classroomDoc.title,
      fen: "start",
      mode: "teaching",
    });
    live = await ClassroomSession.findById(created._id).populate("selectedStudents boardControlStudents challenge.student participants.user", "name username role").lean();
  }
  const existingParticipant = (live.participants || []).find((participant: any) => participant.user?.toString?.() === userId || participant.user?._id?.toString?.() === userId);
  if (live.status !== "ended") {
    if (canCoach(role)) {
      await markScheduledSessionStarted({ classroomId: params.id, scheduledSessionId, actorId: userId });
    }
    if (existingParticipant) {
      await ClassroomSession.updateOne(
        { _id: live._id, "participants.user": userId },
        { $set: { "participants.$.lastSeenAt": new Date(), "participants.$.role": role || "student" } }
      );
    } else {
      await ClassroomSession.updateOne(
        { _id: live._id },
        { $push: { participants: { user: userId, role: role || "student", firstSeenAt: new Date(), lastSeenAt: new Date() } } }
      );
    }
    live = await ClassroomSession.findById(live._id).populate("selectedStudents boardControlStudents challenge.student participants.user", "name username role").lean();
  }

  const activeQuestion: any = live.activeQuestion
    ? await LiveQuestion.findById(live.activeQuestion).lean()
    : await LiveQuestion.findOne({ classroom: params.id, scheduledSessionId, status: "live" }).sort({ createdAt: -1 }).lean();
  const responses = activeQuestion
    ? await LiveQuestionResponse.find({ question: activeQuestion._id }).populate("student", "name username").sort({ submittedAt: -1 }).lean()
    : [];
  const pgnFilter =
    canCoach(role)
      ? {}
      : {
          $or: [
            { uploadedBy: userId },
            { visibility: "classroom", classroom: params.id },
            { visibility: "classroom" },
          ],
        };
  const pgnLibrary = await PGN.find(pgnFilter)
    .select("title white black event result date folder pgn")
    .sort({ folder: 1, createdAt: -1 })
    .limit(80)
    .lean();
  const chatMessages = await ClassroomChatMessage.find({ classroom: params.id, scheduledSessionId })
    .populate("sender", "name username role")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return NextResponse.json({ classroom: classroomDoc, scheduledSession, live, activeQuestion, responses, pgnLibrary, chatMessages: chatMessages.reverse(), serverTime: new Date() });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as { role?: AppRole })?.role;
  if (!session || !canCoach(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  await ensureLiveSessionIndexes();
  const userId = (session.user as { id?: string }).id || "";
  const { classroom, allowed } = await getLiveClassroomForUser(params.id, role, userId);
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const classroomDoc: any = classroom;
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (body.action === "clear_classroom_load") {
    Object.assign(body, {
      fen: "start",
      pgn: "",
      pgnTitle: "",
      pgnMoves: [],
      pgnMoveIndex: 0,
      moveHistory: [],
      gamifiedObjects: {},
      drawings: [],
      setupMode: false,
      illegalMovesEnabled: false,
    });
  }
  const requestedSessionId = getRequestedSessionId(req);
  const scheduledSession: any = resolveScheduledSession(classroomDoc, requestedSessionId);
  if (!scheduledSession) return NextResponse.json({ error: "Scheduled session not found" }, { status: 404 });
  const scheduledSessionId = String(scheduledSession._id);
  const allowedFields = [
    "topic",
    "mode",
    "fen",
    "pgn",
    "pgnTitle",
    "pgnMoves",
    "pgnMoveIndex",
    "moveHistory",
    "orientation",
    "showCoordinates",
    "studentMovesEnabled",
    "illegalMovesEnabled",
    "arrowsEnabled",
    "soundEnabled",
    "setupMode",
    "engineEnabled",
    "endedAt",
    "status",
    "selectedStudents",
    "boardControlStudents",
    "drawings",
    "gamifiedObjects",
    "usedResources",
    "locked",
    "challenge",
  ];
  const update: any = {};
  for (const key of allowedFields) if (key in body) update[key] = body[key];
  if ("studentMovesEnabled" in update && !update.studentMovesEnabled) {
    update.boardControlStudents = [];
    if (update.mode === "student_move" || update.mode === "one_move_challenge") update.mode = "teaching";
  }
  if (update.mode === "teaching") {
    update.studentMovesEnabled = false;
    update.boardControlStudents = [];
    update.challenge = { active: false };
  }
  const live = await ClassroomSession.findOneAndUpdate(
    { classroom: params.id, scheduledSessionId },
    {
      $set: update,
      $setOnInsert: {
        classroom: params.id,
        scheduledSessionId,
        sessionKey: buildLiveSessionKey(params.id, scheduledSessionId),
        coach: userId,
        topic: scheduledSession.topicName || classroomDoc.topicName || classroomDoc.title,
      },
    },
    { upsert: true, new: true }
  );
  if (update.status === "ended") {
    await markScheduledSessionFinished({
      classroomId: params.id,
      scheduledSessionId,
      actorId: userId,
      endedAt: update.endedAt ? new Date(update.endedAt) : new Date(),
      summary: body.summary,
    });
  } else if (update.status === "live" || update.startedAt) {
    await markScheduledSessionStarted({ classroomId: params.id, scheduledSessionId, actorId: userId });
  }
  return NextResponse.json(live);
}
