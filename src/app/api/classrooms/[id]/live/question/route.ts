import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { ClassroomSession, LiveQuestion } from "@/models/ClassroomLive";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "admin" && role !== "instructor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const live: any = await ClassroomSession.findOne({ classroom: params.id });
  if (!live) return NextResponse.json({ error: "Live session missing" }, { status: 404 });
  const body = await req.json();
  const question = await LiveQuestion.create({
    classroom: params.id,
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
  await ClassroomSession.findByIdAndUpdate(live._id, { activeQuestion: question._id });
  return NextResponse.json(question);
}
