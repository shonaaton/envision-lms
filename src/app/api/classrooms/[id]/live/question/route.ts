import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
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
  if (live.activeQuestion) {
    const activeQuestion = await LiveQuestion.findOne({ _id: live.activeQuestion, status: "live" }).select("_id").lean();
    if (activeQuestion) return NextResponse.json({ error: "A live quiz is already active. End it before launching another one." }, { status: 409 });
  }
  const recentLiveQuestion = await LiveQuestion.findOne({ classroom: params.id, scheduledSessionId, status: "live" }).select("_id").lean();
  if (recentLiveQuestion) return NextResponse.json({ error: "A live quiz is already active. End it before launching another one." }, { status: 409 });
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
  const claimedLive = await ClassroomSession.findOneAndUpdate(
    {
      _id: live._id,
      $or: [{ activeQuestion: { $exists: false } }, { activeQuestion: null }],
    },
    {
      activeQuestion: question._id,
      mode: "puzzle",
    },
    { new: true }
  );
  if (!claimedLive) {
    await LiveQuestion.findByIdAndUpdate(question._id, { $set: { status: "closed" } });
    return NextResponse.json({ error: "A live quiz is already active. End it before launching another one." }, { status: 409 });
  }
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
  if (body.status && body.status !== "live") {
    await ClassroomSession.findByIdAndUpdate(live._id, {
      $unset: { activeQuestion: 1 },
      $set: { mode: "teaching", studentMovesEnabled: false, boardControlStudents: [] },
    });
    return NextResponse.json({ ok: true, question });
  }
  return NextResponse.json({ ok: true, question });
}
