import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { PGN } from "@/models/PGN";
import { Chess } from "chess.js";
import { normalizeFolderPath } from "@/lib/pgnAccess";

export const dynamic = "force-dynamic";

function extractHeader(pgn: string, key: string): string | undefined {
  const m = pgn.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`));
  return m?.[1];
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

function ownerFilter(session: any, id: string) {
  return { _id: id, uploadedBy: (session.user as any).id };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const { title, pgn, folder } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!pgn?.trim() || !isValidPgnOrFenSetup(pgn)) return NextResponse.json({ error: "Invalid PGN" }, { status: 400 });

  const updated = await PGN.findOneAndUpdate(
    ownerFilter(session, params.id),
    {
      title: title.trim(),
      white: extractHeader(pgn, "White"),
      black: extractHeader(pgn, "Black"),
      event: extractHeader(pgn, "Event"),
      result: extractHeader(pgn, "Result"),
      eco: extractHeader(pgn, "ECO"),
      date: extractHeader(pgn, "Date"),
      pgn,
      folder: normalizeFolderPath(folder) || undefined,
    },
    { new: true },
  ).lean();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const deleted = await PGN.findOneAndDelete(ownerFilter(session, params.id)).lean();
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
