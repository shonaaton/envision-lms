import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { ClassroomSession } from "@/models/ClassroomLive";
import { getRequestedSessionId, markScheduledSessionStarted } from "@/lib/classroomLiveSession";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?.toString?.() || String(value || "");
}

type BoardPosition = Record<string, string | undefined>;

function fenToPosition(fen?: string): BoardPosition {
  const chess = new Chess();
  if (fen && fen !== "start") chess.load(fen, { skipValidation: true });
  const position: BoardPosition = {};
  chess.board().forEach((rank, rankIndex) => {
    rank.forEach((piece, fileIndex) => {
      if (!piece) return;
      const square = `${"abcdefgh"[fileIndex]}${8 - rankIndex}`;
      position[square] = `${piece.color}${piece.type.toUpperCase()}`;
    });
  });
  return position;
}

function positionToFen(position: BoardPosition, sideToMove = "w") {
  const ranks = [];
  for (let rank = 8; rank >= 1; rank--) {
    let empty = 0;
    let row = "";
    for (const file of "abcdefgh") {
      const piece = position[`${file}${rank}`];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) {
        row += empty;
        empty = 0;
      }
      const letter = piece[1];
      row += piece[0] === "w" ? letter : letter.toLowerCase();
    }
    if (empty) row += empty;
    ranks.push(row);
  }
  return `${ranks.join("/")} ${sideToMove} - - 0 1`;
}

function freeMoveLabel(piece: string, from: string, to: string) {
  const pieceName = piece?.[1] || "";
  return `${pieceName}${from}-${to}`;
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

  if (live.illegalMovesEnabled) {
    const position = fenToPosition(live.fen);
    const piece = position[from];
    if (!piece) return NextResponse.json({ error: "No piece found on the source square" }, { status: 400 });
    delete position[from];
    position[to] = piece;

    const nextGamifiedObjects = { ...(live.gamifiedObjects || {}) };
    if (nextGamifiedObjects[to]) delete nextGamifiedObjects[to];
    const sideToMove = String(live.fen || "").split(" ")[1] === "b" ? "b" : "w";
    const moveLabel = freeMoveLabel(piece, from, to);

    live.fen = positionToFen(position, sideToMove);
    live.gamifiedObjects = nextGamifiedObjects;
    live.moveHistory = [...(live.moveHistory || []), moveLabel];
    live.startedAt = live.startedAt || new Date();
    live.status = live.status === "ended" ? "ended" : "live";
    const hadParticipant = (live.participants || []).some((participant: any) => objectId(participant.user) === userId);
    live.participants = (live.participants || []).map((participant: any) =>
      objectId(participant.user) === userId
        ? { ...participant.toObject?.(), role: "student", lastSeenAt: new Date(), firstSeenAt: participant.firstSeenAt || new Date() }
        : participant
    );
    if (!hadParticipant) {
      live.participants = [...(live.participants || []), { user: userId, role: "student", firstSeenAt: new Date(), lastSeenAt: new Date() }];
    }
    if (live.mode === "one_move_challenge") {
      live.mode = "teaching";
      live.boardControlStudents = [];
      live.studentMovesEnabled = false;
      live.challenge = { ...(live.challenge?.toObject?.() || live.challenge || {}), active: false };
    }
    await live.save();
    await markScheduledSessionStarted({ classroomId: params.id, scheduledSessionId, actorId: userId });

    return NextResponse.json({
      ok: true,
      fen: live.fen,
      move: moveLabel,
      gamifiedObjects: live.gamifiedObjects,
      moveHistory: live.moveHistory,
    });
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
  live.startedAt = live.startedAt || new Date();
  live.status = live.status === "ended" ? "ended" : "live";
  const hadParticipant = (live.participants || []).some((participant: any) => objectId(participant.user) === userId);
  live.participants = (live.participants || []).map((participant: any) =>
    objectId(participant.user) === userId
      ? { ...participant.toObject?.(), role: "student", lastSeenAt: new Date(), firstSeenAt: participant.firstSeenAt || new Date() }
      : participant
  );
  if (!hadParticipant) {
    live.participants = [...(live.participants || []), { user: userId, role: "student", firstSeenAt: new Date(), lastSeenAt: new Date() }];
  }
  if (live.mode === "one_move_challenge") {
    live.mode = "teaching";
    live.boardControlStudents = [];
    live.studentMovesEnabled = false;
    live.challenge = { ...(live.challenge?.toObject?.() || live.challenge || {}), active: false };
  }
  await live.save();
  await markScheduledSessionStarted({ classroomId: params.id, scheduledSessionId, actorId: userId });

  return NextResponse.json({
    ok: true,
    fen: live.fen,
    move: move.san,
    gamifiedObjects: live.gamifiedObjects,
    moveHistory: live.moveHistory,
  });
}
