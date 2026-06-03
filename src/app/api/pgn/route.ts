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

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const filter: any = q ? { $text: { $search: q } } : {};
  const list = await PGN.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const { pgn, title, visibility = "public", classroom } = await req.json();
  if (!pgn) return NextResponse.json({ error: "pgn required" }, { status: 400 });
  // Validate
  try { new Chess().loadPgn(pgn); } catch { return NextResponse.json({ error: "Invalid PGN" }, { status: 400 }); }
  const doc = await PGN.create({
    title: title || extractHeader(pgn, "Event") || "Untitled game",
    white: extractHeader(pgn, "White"),
    black: extractHeader(pgn, "Black"),
    event: extractHeader(pgn, "Event"),
    result: extractHeader(pgn, "Result"),
    eco: extractHeader(pgn, "ECO"),
    date: extractHeader(pgn, "Date"),
    pgn,
    visibility,
    classroom,
    uploadedBy: (session.user as any).id,
  });
  return NextResponse.json(doc);
}
