import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { PGN } from "@/models/PGN";
import { Chess } from "chess.js";

export const dynamic = "force-dynamic";

function extractHeader(pgn: string, key: string): string | undefined {
  const m = pgn.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`));
  return m?.[1];
}

function splitPgnGames(pgn: string) {
  const normalized = pgn.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const starts = Array.from(normalized.matchAll(/(^|\n)\s*(?=\[Event\s+")/g)).map((match) => match.index + match[1].length);
  if (starts.length <= 1) return [normalized];

  return starts
    .map((start, index) => normalized.slice(start, starts[index + 1]).trim())
    .filter(Boolean);
}

function isValidPgnOrFenSetup(pgn: string) {
  try {
    new Chess().loadPgn(pgn);
    return true;
  } catch {
    const fen = extractHeader(pgn, "FEN");
    if (!fen) return false;
    try {
      new Chess(fen);
      return true;
    } catch {
      return false;
    }
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const filter: any = { uploadedBy: (session.user as any).id };
  if (q) filter.$text = { $search: q };
  const list = await PGN.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const { pgn, title, visibility = "private", classroom, folder } = await req.json();
  if (!pgn) return NextResponse.json({ error: "pgn required" }, { status: 400 });
  const games = splitPgnGames(pgn);
  if (!games.length || games.some((game) => !isValidPgnOrFenSetup(game))) {
    return NextResponse.json({ error: "Invalid PGN" }, { status: 400 });
  }

  const docs = await PGN.insertMany(games.map((game, index) => {
    const event = extractHeader(game, "Event");
    return {
      title: games.length > 1 ? event || `${title || "PGN Game"} ${index + 1}` : title || event || "Untitled game",
      white: extractHeader(game, "White"),
      black: extractHeader(game, "Black"),
      event,
      result: extractHeader(game, "Result"),
      eco: extractHeader(game, "ECO"),
      date: extractHeader(game, "Date"),
      pgn: game,
      folder,
      visibility: visibility === "classroom" ? "classroom" : "private",
      classroom,
      uploadedBy: (session.user as any).id,
    };
  }));

  return NextResponse.json(games.length === 1 ? docs[0] : docs);
}
