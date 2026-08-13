import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { ClassroomSession, LiveQuestion } from "@/models/ClassroomLive";
import { getRequestedSessionId } from "@/lib/classroomLiveSession";
import { getLiveClassroomForUser, type AppRole } from "@/lib/liveClassroomAccess";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as { role?: AppRole })?.role;
  if (!session || !role || !["admin", "sub-admin", "instructor"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const userId = (session.user as { id?: string }).id || "";
  const scheduledSessionId = getRequestedSessionId(req);
  if (!scheduledSessionId) return NextResponse.json({ error: "Scheduled session required" }, { status: 400 });
  const { classroom, allowed } = await getLiveClassroomForUser(params.id, role, userId, scheduledSessionId);
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const live: any = await ClassroomSession.findOne({ classroom: params.id, scheduledSessionId });
  if (!live) return NextResponse.json({ error: "Live session missing" }, { status: 404 });
  const body = await req.json();
  const question = await LiveQuestion.create({
    classroom: params.id,
    scheduledSessionId,
    session: live._id,
    createdBy: userId,
    type: body.type || "ask_everyone",
    title: body.title || "Ask Everyone",
    topic: body.topic,
    difficulty: body.difficulty,
    instructions: body.instructions,
    fen: body.fen || live.fen || "start",
    pgn: body.pgn || live.pgn,
    moveHistory: body.moveHistory || live.moveHistory || [],
    sideToMove: body.sideToMove,
    solution: body.solution || [],
    options: body.options || [],
    items: body.items || [],
    progressionMode: body.progressionMode === "manual" ? "manual" : "auto",
    currentItemIndex: Math.max(0, Number(body.currentItemIndex || 0)),
    timer: body.timer || {},
    scoring: body.scoring || {},
    attempts: body.attempts || "single",
    hintsEnabled: Boolean(body.hintsEnabled),
    status: "live",
  });
  await ClassroomSession.findByIdAndUpdate(live._id, {
    activeQuestion: question._id,
    mode: "puzzle",
  });
  await recordActivity({
    actor: userId,
    type: "classroom.live.question_launched",
    label: `Launched live classroom question ${question.title}`,
    entityType: "LiveQuestion",
    entityId: question._id.toString(),
    metadata: {
      classroom: params.id,
      scheduledSessionId,
      questionType: question.type,
      items: Array.isArray(question.items) ? question.items.length : 0,
      source: "live_classroom",
    },
  });
  return NextResponse.json(question);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as { role?: AppRole })?.role;
  if (!session || !role || !["admin", "sub-admin", "instructor"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const userId = (session.user as { id?: string }).id || "";
  const scheduledSessionId = getRequestedSessionId(req);
  if (!scheduledSessionId) return NextResponse.json({ error: "Scheduled session required" }, { status: 400 });
  const { classroom, allowed } = await getLiveClassroomForUser(params.id, role, userId, scheduledSessionId);
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const live: any = await ClassroomSession.findOne({ classroom: params.id, scheduledSessionId });
  if (!live) return NextResponse.json({ error: "Live session missing" }, { status: 404 });

  const questionId = String(body.questionId || live.activeQuestion || "").trim();
  if (!questionId) return NextResponse.json({ error: "No live quiz is active" }, { status: 404 });

  const update: Record<string, any> = {};
  if (body.status) update.status = body.status;
  if (body.progressionMode) update.progressionMode = body.progressionMode === "manual" ? "manual" : "auto";
  if (typeof body.currentItemIndex === "number") update.currentItemIndex = Math.max(0, Number(body.currentItemIndex || 0));
  const question = await LiveQuestion.findByIdAndUpdate(questionId, { $set: update }, { new: true });
  await recordActivity({
    actor: userId,
    type: body.status && body.status !== "live" ? "classroom.live.question_ended" : "classroom.live.question_updated",
    label: body.status && body.status !== "live" ? `Ended live classroom question ${question?.title || ""}` : `Updated live classroom question ${question?.title || ""}`,
    entityType: "LiveQuestion",
    entityId: questionId,
    metadata: {
      classroom: params.id,
      scheduledSessionId,
      status: body.status || question?.status || "",
      currentItemIndex: update.currentItemIndex,
      source: "live_classroom",
    },
  });
  if (body.status && body.status !== "live") {
    await ClassroomSession.findByIdAndUpdate(live._id, {
      $unset: { activeQuestion: 1 },
      $set: { mode: "teaching", studentMovesEnabled: false, boardControlStudents: [] },
    });
    return NextResponse.json({ ok: true, question });
  }
  return NextResponse.json({ ok: true, question });
}
