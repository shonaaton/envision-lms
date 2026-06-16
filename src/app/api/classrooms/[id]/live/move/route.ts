import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { ClassroomSession } from "@/models/ClassroomLive";
import { getRequestedSessionId } from "@/lib/classroomLiveSession";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?.toString?.() || String(value || "");
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  if (role !== "student") return NextResponse.json({ error: "Only students can use this move channel" }, { status: 403 });

  const scheduledSessionId = getRequestedSessionId(req);
  if (!scheduledSessionId) return NextResponse.json({ error: "Scheduled session required" }, { status: 400 });

  const body = await req.json();
  const from = String(body.from || "").trim();
  const to = String(body.to || "").trim();
  const promotion = String(body.promotion || "q").trim();
  if (!from || !to) return NextResponse.json({ error: "Move squares are required" }, { status: 400 });

  const live: any = await ClassroomSession.findOne({ classroom: params.id, scheduledSessionId });
  if (!live) return NextResponse.json({ error: "Live session not found" }, { status: 404 });
  if (live.status === "ended") return NextResponse.json({ error: "This classroom session has ended" }, { status: 400 });
  if (live.locked) return NextResponse.json({ error: "The classroom board is locked" }, { status: 400 });
  if (!live.studentMovesEnabled) return NextResponse.json({ error: "Student moves are currently disabled" }, { status: 403 });

  const allowedStudents = (live.boardControlStudents || []).map(objectId);
  if (!allowedStudents.includes(userId)) {
    return NextResponse.json({ error: "You do not currently have board control" }, { status: 403 });
  }

  const chess = live.fen && live.fen !== "start" ? new Chess(live.fen) : new Chess();
  let move: any = null;
  try {
    move = chess.move({ from, to, promotion });
  } catch {
    move = null;
  }
  if (!move) return NextResponse.json({ error: "That move is not legal in the current position" }, { status: 400 });

  const nextGamifiedObjects = { ...(live.gamifiedObjects || {}) };
  if (nextGamifiedObjects[to]) delete nextGamifiedObjects[to];

  live.fen = chess.fen();
  live.gamifiedObjects = nextGamifiedObjects;
  live.moveHistory = [...(live.moveHistory || []), move.san];
  if (live.mode === "one_move_challenge") {
    live.mode = "teaching";
    live.boardControlStudents = [];
    live.challenge = { ...(live.challenge?.toObject?.() || live.challenge || {}), active: false };
  }
  await live.save();

  return NextResponse.json({
    ok: true,
    fen: live.fen,
    move: move.san,
    gamifiedObjects: live.gamifiedObjects,
    moveHistory: live.moveHistory,
  });
}
