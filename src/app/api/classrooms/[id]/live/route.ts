import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { PGN } from "@/models/PGN";
import { ClassroomChatMessage, ClassroomSession, LiveQuestion, LiveQuestionResponse } from "@/models/ClassroomLive";
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
  const classroom: any = await Classroom.findById(params.id).populate("coach instructor students", "name email username").lean();
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scheduledSession: any = resolveScheduledSession(classroom, requestedSessionId);
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
      coach: classroom.coach || classroom.instructor,
      topic: scheduledSession.topicName || classroom.topicName || classroom.title,
      fen: "start",
      mode: "teaching",
    });
    live = await ClassroomSession.findById(created._id).populate("selectedStudents boardControlStudents challenge.student participants.user", "name username role").lean();
  }
  const userId = (session.user as any).id;
  const existingParticipant = (live.participants || []).find((participant: any) => participant.user?.toString?.() === userId || participant.user?._id?.toString?.() === userId);
  if (live.status !== "ended") {
    if (canCoach((session.user as any).role)) {
      await markScheduledSessionStarted({ classroomId: params.id, scheduledSessionId, actorId: userId });
    }
    if (existingParticipant) {
      await ClassroomSession.updateOne(
        { _id: live._id, "participants.user": userId },
        { $set: { "participants.$.lastSeenAt": new Date(), "participants.$.role": (session.user as any).role || "student" } }
      );
    } else {
      await ClassroomSession.updateOne(
        { _id: live._id },
        { $push: { participants: { user: userId, role: (session.user as any).role || "student", firstSeenAt: new Date(), lastSeenAt: new Date() } } }
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
  const role = (session.user as any).role;
  const pgnFilter =
    canCoach(role)
      ? {}
      : {
          $or: [
            { uploadedBy: (session.user as any).id },
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
  return NextResponse.json({ classroom, scheduledSession, live, activeQuestion, responses, pgnLibrary, chatMessages: chatMessages.reverse(), serverTime: new Date() });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !canCoach(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  await ensureLiveSessionIndexes();
  const body = await req.json();
  const requestedSessionId = getRequestedSessionId(req);
  const classroom: any = await Classroom.findById(params.id);
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const scheduledSession: any = resolveScheduledSession(classroom, requestedSessionId);
  if (!scheduledSession) return NextResponse.json({ error: "Scheduled session not found" }, { status: 404 });
  const scheduledSessionId = String(scheduledSession._id);
  const allowed = [
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
    "locked",
    "challenge",
  ];
  const update: any = {};
  for (const key of allowed) if (key in body) update[key] = body[key];
  const live = await ClassroomSession.findOneAndUpdate(
    { classroom: params.id, scheduledSessionId },
    {
      $set: update,
      $setOnInsert: {
        classroom: params.id,
        scheduledSessionId,
        sessionKey: buildLiveSessionKey(params.id, scheduledSessionId),
        coach: (session.user as any).id,
        topic: scheduledSession.topicName || classroom.topicName || classroom.title,
      },
    },
    { upsert: true, new: true }
  );
  if (update.status === "ended") {
    await markScheduledSessionFinished({
      classroomId: params.id,
      scheduledSessionId,
      actorId: (session.user as any).id,
      endedAt: update.endedAt ? new Date(update.endedAt) : new Date(),
      summary: body.summary,
    });
  } else if (update.status === "live" || update.startedAt) {
    await markScheduledSessionStarted({ classroomId: params.id, scheduledSessionId, actorId: (session.user as any).id });
  }
  return NextResponse.json(live);
}
