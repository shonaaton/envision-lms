import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { ClassroomSession, LiveQuestion } from "@/models/ClassroomLive";
import { getRequestedSessionId } from "@/lib/classroomLiveSession";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "admin" && role !== "instructor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const scheduledSessionId = getRequestedSessionId(req);
  if (!scheduledSessionId) return NextResponse.json({ error: "Scheduled session required" }, { status: 400 });
  const live: any = await ClassroomSession.findOne({ classroom: params.id, scheduledSessionId });
  if (!live) return NextResponse.json({ error: "Live session missing" }, { status: 404 });
  const body = await req.json();
  const question = await LiveQuestion.create({
    classroom: params.id,
    scheduledSessionId,
    session: live._id,
    createdBy: (session.user as any).id,
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
  return NextResponse.json(question);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "admin" && role !== "instructor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const scheduledSessionId = getRequestedSessionId(req);
  if (!scheduledSessionId) return NextResponse.json({ error: "Scheduled session required" }, { status: 400 });

  const body = await req.json();
  const live: any = await ClassroomSession.findOne({ classroom: params.id, scheduledSessionId });
  if (!live) return NextResponse.json({ error: "Live session missing" }, { status: 404 });

  const questionId = String(body.questionId || live.activeQuestion || "").trim();
  if (!questionId) return NextResponse.json({ error: "No live quiz is active" }, { status: 404 });

  const question = await LiveQuestion.findByIdAndUpdate(questionId, { status: body.status || "closed" }, { new: true });
  await ClassroomSession.findByIdAndUpdate(live._id, {
    $unset: { activeQuestion: 1 },
    $set: { mode: "teaching", studentMovesEnabled: false, boardControlStudents: [] },
  });
  return NextResponse.json({ ok: true, question });
}
