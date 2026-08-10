import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { Attendance } from "@/models/Attendance";
import { PGN } from "@/models/PGN";
import { ClassroomChatMessage, ClassroomSession, LiveQuestion, LiveQuestionResponse } from "@/models/ClassroomLive";
import "@/models/User";
import { getLiveClassroomForUser, type AppRole } from "@/lib/liveClassroomAccess";
import { buildPgnLibraryFilter } from "@/lib/pgnAccess";
import {
  buildLiveSessionKey,
  ensureLiveSessionIndexes,
  getRequestedSessionId,
  markScheduledSessionFinished,
  markScheduledSessionStarted,
  resolveScheduledSession,
} from "@/lib/classroomLiveSession";
import { isJoinWindowOpen } from "@/lib/classroomSessions";
import { isCoachNoShowExpired, notifyCoachNoShowIfThreshold, recalculateFutureSessionTopics } from "@/lib/classroomLifecycle";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

type SessionUser = {
  id?: string;
  role?: AppRole;
};

type LiveParticipant = {
  user?: { _id?: { toString(): string }; toString?: () => string } | string;
  role?: AppRole;
};

type LiveSessionRecord = {
  _id: { toString(): string };
  participants?: LiveParticipant[];
  status?: "live" | "ended";
  activeQuestion?: string | { toString(): string };
  drawings?: unknown[];
};

type LiveQuestionRecord = {
  _id: { toString(): string };
};

function participantUserId(participant: LiveParticipant) {
  const user = participant.user;
  if (!user) return "";
  if (typeof user === "string") return user;
  return user._id?.toString?.() || user.toString?.() || "";
}

function canCoach(role: string | undefined) {
  return role === "admin" || role === "sub-admin" || role === "instructor";
}

function activeCoachParticipants(live: any, now = new Date()) {
  return (live?.participants || []).filter((participant: any) => {
    if (!canCoach(participant.role)) return false;
    if (participant.presenceStatus === "left" || participant.leftAt) return false;
    const lastSeen = participant.lastSeenAt ? new Date(participant.lastSeenAt) : null;
    return Boolean(lastSeen && now.getTime() - lastSeen.getTime() <= 2 * 60000);
  });
}

async function autoEndCoachNoShowIfNeeded({
  classroomId,
  classroom,
  live,
  scheduledSession,
}: {
  classroomId: string;
  classroom: any;
  live: any;
  scheduledSession: any;
}) {
  if (!live || live.status === "ended") return live;
  if (!isCoachNoShowExpired(scheduledSession)) return live;
  const hadCoach = (live.participants || []).some((participant: any) => canCoach(participant.role));
  if (hadCoach) return live;

  const scheduledSessionId = String(scheduledSession._id);
  const joinedStudents = new Set(
    (live.participants || [])
      .filter((participant: any) => participant.role === "student")
      .map((participant: any) => participantUserId(participant))
      .filter(Boolean)
  );
  await Attendance.findOneAndUpdate(
    { classroom: classroomId, scheduledSessionId, sessionDate: new Date(scheduledSession.scheduledFor) },
    {
      classroom: classroomId,
      scheduledSessionId,
      sessionDate: new Date(scheduledSession.scheduledFor),
      coach: scheduledSession.substituteCoach || classroom.coach || classroom.instructor,
      coachStatus: "coach_no_show",
      teachingMinutes: 0,
      actualTeachingMinutes: 0,
      punctualityScore: 0,
      records: (classroom.students || []).map((student: any) => {
        const studentId = String(student?._id || student);
        return {
          student: studentId,
          status: joinedStudents.has(studentId) ? "coach_no_show" : "not_joined",
          note: joinedStudents.has(studentId) ? "Student waited, coach did not join" : "Student did not join before coach no-show auto-close",
        };
      }),
      metadata: {
        classOutcome: "coach_no_show",
        topicCompleted: false,
        creditPolicy: "no_charge",
        autoClosed: true,
        graceMinutes: 20,
        liveSessionId: String(live._id),
      },
    },
    { upsert: true, new: true }
  );

  await ClassroomSession.updateOne(
    { _id: live._id },
    { $set: { status: "ended", endedAt: new Date(), locked: true, participants: [] } }
  );
  const classroomDoc: any = await Classroom.findById(classroomId);
  const target = classroomDoc?.generatedSessions?.id?.(scheduledSessionId);
  if (target) {
    target.status = "coach_no_show";
    target.coachAttendanceStatus = "coach_no_show";
    target.actualEndedAt = new Date();
    target.actualTeachingMinutes = 0;
    target.teachingMinutes = 0;
    target.attendanceMarkedAt = new Date();
    target.summary = { ...(target.summary || {}), classOutcome: "coach_no_show", topicCompleted: false, creditPolicy: "no_charge", autoClosed: true };
    await recalculateFutureSessionTopics(classroomDoc);
    await classroomDoc.save();
  }
  await notifyCoachNoShowIfThreshold(String(scheduledSession.substituteCoach || classroom.coach || classroom.instructor || ""), { classroom: classroomId, sessionId: scheduledSessionId });
  await recordActivity({
    type: "classroom.coach_no_show.auto_closed",
    label: "Auto-closed classroom as coach no-show",
    entityType: "Classroom",
    entityId: classroomId,
    metadata: { classroom: classroomId, sessionId: scheduledSessionId, joinedStudents: joinedStudents.size },
  });
  return ClassroomSession.findById(live._id).populate("selectedStudents boardControlStudents challenge.student participants.user", "name username role").lean<LiveSessionRecord | null>();
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await dbConnect();
    await ensureLiveSessionIndexes();
    const requestedSessionId = getRequestedSessionId(_);
    const role = (session.user as { role?: AppRole }).role;
    const userId = (session.user as { id?: string }).id || "";
    if (!role || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { classroom, allowed } = await getLiveClassroomForUser(params.id, role, userId, requestedSessionId);
    if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const classroomDoc = classroom as Record<string, any>;
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const scheduledSession = resolveScheduledSession(classroomDoc, requestedSessionId);
    if (!scheduledSession) return NextResponse.json({ error: "Scheduled session not found" }, { status: 404 });
    const scheduledSessionId = String(scheduledSession._id);
    let live = await ClassroomSession.findOne({ classroom: params.id, scheduledSessionId })
      .populate("selectedStudents boardControlStudents challenge.student participants.user", "name username role")
      .lean<LiveSessionRecord | null>();
    if (!live) {
      const created = await ClassroomSession.create({
        classroom: params.id,
        scheduledSessionId,
        sessionKey: buildLiveSessionKey(params.id, scheduledSessionId),
        coach: scheduledSession.substituteCoach || classroomDoc.coach || classroomDoc.instructor,
        topic: scheduledSession.topicName || classroomDoc.topicName || classroomDoc.title,
        fen: "start",
        mode: "teaching",
      });
      live = await ClassroomSession.findById(created._id).populate("selectedStudents boardControlStudents challenge.student participants.user", "name username role").lean<LiveSessionRecord | null>();
    }
    live = await autoEndCoachNoShowIfNeeded({ classroomId: params.id, classroom: classroomDoc, live, scheduledSession });
    const existingParticipant = (live?.participants || []).find((participant) => participantUserId(participant) === userId);
    if (live?.status !== "ended") {
      if (canCoach(role) && isJoinWindowOpen(scheduledSession)) {
        await markScheduledSessionStarted({ classroomId: params.id, scheduledSessionId, actorId: userId });
      }
      if (existingParticipant) {
        await ClassroomSession.updateOne(
          { _id: live?._id, "participants.user": userId },
          { $set: { "participants.$.lastSeenAt": new Date(), "participants.$.role": role || "student", "participants.$.presenceStatus": "active" }, $unset: { "participants.$.leftAt": "" } }
        );
      } else {
        await ClassroomSession.updateOne(
          { _id: live?._id },
          { $push: { participants: { user: userId, role: role || "student", firstSeenAt: new Date(), lastSeenAt: new Date() } } }
        );
      }
      live = await ClassroomSession.findById(live?._id).populate("selectedStudents boardControlStudents challenge.student participants.user", "name username role").lean<LiveSessionRecord | null>();
    }

    const activeQuestion = live?.activeQuestion
      ? await LiveQuestion.findById(live.activeQuestion).lean<LiveQuestionRecord | null>()
      : await LiveQuestion.findOne({ classroom: params.id, scheduledSessionId, status: "live" }).sort({ createdAt: -1 }).lean<LiveQuestionRecord | null>();
    const sessionQuestions = await LiveQuestion.find({ classroom: params.id, scheduledSessionId }).select("_id").lean();
    const sessionQuestionIds = sessionQuestions.map((question: any) => question._id);
    const sessionResponses = sessionQuestionIds.length
      ? await LiveQuestionResponse.find({ question: { $in: sessionQuestionIds } }).populate("student", "name username").sort({ submittedAt: -1 }).lean()
      : [];
    const activeQuestionId = activeQuestion?._id?.toString?.() || "";
    const responses = activeQuestionId
      ? sessionResponses.filter((response: any) => String(response.question || "") === activeQuestionId)
      : [];
    const includeLibrary = new URL(_.url).searchParams.get("includeLibrary") !== "false";
    const pgnFilter = canCoach(role)
      ? buildPgnLibraryFilter(session)
      : {
          $or: [
            { uploadedBy: userId },
            { visibility: "classroom", classroom: params.id },
            { visibility: "classroom" },
          ],
        };
    const pgnLibrary = includeLibrary
      ? await PGN.find(pgnFilter)
          .select("title white black event result date eco opening moveCount sideToMove initialFen hasAnnotations hasVariations folder pgn")
          .sort({ folder: 1, createdAt: -1 })
          .limit(5000)
          .lean()
      : undefined;
    const chatFilter: Record<string, any> = { classroom: params.id, scheduledSessionId };
    if (!canCoach(role)) {
      chatFilter.$or = [
        { recipient: { $exists: false } },
        { recipient: null },
        { sender: userId },
        { recipient: userId },
      ];
    }
    const chatMessages = await ClassroomChatMessage.find(chatFilter)
      .populate("sender recipient", "name username role")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return NextResponse.json({
      classroom: classroomDoc,
      scheduledSession,
      live,
      activeQuestion,
      responses,
      sessionResponses,
      sessionQuestionCount: sessionQuestions.length,
      ...(includeLibrary ? { pgnLibrary } : {}),
      chatMessages: chatMessages.reverse(),
      serverTime: new Date(),
    });
  } catch (error: any) {
    console.error("Live classroom load failed", error);
    return NextResponse.json({ error: error?.message || "Live classroom could not be loaded" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as { role?: AppRole })?.role;
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const isStudentLeave = body.action === "student_leave";
  if (!canCoach(role) && !isStudentLeave) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  await ensureLiveSessionIndexes();
  const userId = (session.user as { id?: string }).id || "";
  const requestedSessionId = getRequestedSessionId(req);
  const { classroom, allowed } = await getLiveClassroomForUser(params.id, role, userId, requestedSessionId);
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const classroomDoc = classroom as Record<string, any>;
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const scheduledSession = resolveScheduledSession(classroomDoc, requestedSessionId);
  if (!scheduledSession) return NextResponse.json({ error: "Scheduled session not found" }, { status: 404 });
  const scheduledSessionId = String(scheduledSession._id);

  if (isStudentLeave) {
    if (canCoach(role)) return NextResponse.json({ error: "Coach/admin should use the class close flow" }, { status: 400 });
    const live = await ClassroomSession.findOne({ classroom: params.id, scheduledSessionId });
    if (!live || live.status === "ended") return NextResponse.json({ ok: true, ended: true });
    if (activeCoachParticipants(live).length) {
      return NextResponse.json({ error: "Leave is available only while waiting for the coach." }, { status: 409 });
    }
    await ClassroomSession.updateOne(
      { _id: live._id, "participants.user": userId },
      {
        $set: {
          "participants.$.lastSeenAt": new Date(),
          "participants.$.leftAt": new Date(),
          "participants.$.presenceStatus": "coach_no_show_pending",
        },
      }
    );
    await recordActivity({
      actor: userId,
      type: "classroom.student.left_waiting_room",
      label: "Student left classroom while waiting for coach",
      entityType: "Classroom",
      entityId: params.id,
      metadata: { classroom: params.id, sessionId: scheduledSessionId },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "clear_classroom_load") {
    Object.assign(body, {
      fen: "start",
      pgn: "",
      pgnTitle: "",
      navigationStartFen: "",
      pgnMoves: [],
      pgnMoveIndex: 0,
      pgnVariations: [],
      activePgnVariationId: "",
      moveHistory: [],
      gamifiedObjects: {},
      drawings: [],
      setupMode: false,
      illegalMovesEnabled: false,
      challenge: { active: false, currentIndex: 0, pgnCollection: [] },
    });
  }
  const allowedFields = [
    "topic",
    "mode",
    "fen",
    "pgn",
    "pgnTitle",
    "navigationStartFen",
    "pgnMoves",
    "pgnMoveIndex",
    "pgnVariations",
    "activePgnVariationId",
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
  const update: Record<string, unknown> = {};
  for (const key of allowedFields) if (key in body) update[key] = body[key];
  if ("studentMovesEnabled" in update && !update.studentMovesEnabled) {
    update.boardControlStudents = [];
    if (update.mode === "student_move" || update.mode === "one_move_challenge") update.mode = "teaching";
  }
  if (update.mode === "teaching") {
    update.studentMovesEnabled = false;
    update.boardControlStudents = [];
    update.challenge = {
      ...(body.challenge && typeof body.challenge === "object" ? body.challenge : {}),
      active: false,
    };
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
      endedAt: update.endedAt ? new Date(String(update.endedAt)) : new Date(),
      summary: body.summary,
    });
  } else if (update.status === "live" || update.startedAt) {
    await markScheduledSessionStarted({ classroomId: params.id, scheduledSessionId, actorId: userId });
  }
  return NextResponse.json(live);
}
