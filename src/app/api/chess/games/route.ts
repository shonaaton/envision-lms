import { NextResponse } from "next/server";
import { resolveAuthorizedChessStudent } from "@/lib/chess/access";
import { dbConnect } from "@/lib/db";
import { ChessGame } from "@/models/Chess";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const access = await resolveAuthorizedChessStudent(url.searchParams.get("studentId"), "games");
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 25)));
  const games: any[] = await ChessGame.find({ student: access.studentId }).sort({ playedAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
  const total = await ChessGame.countDocuments({ student: access.studentId });
  return NextResponse.json({
    page,
    limit,
    total,
    games: games.map((game) => ({
      id: game._id.toString(),
      result: game.result,
      studentColor: game.studentColor,
      opponentUsername: game.opponentUsername,
      studentRating: game.studentRating || null,
      opponentRating: game.opponentRating || null,
      ratingChange: game.ratingChange || null,
      opening: game.opening || "Unknown",
      eco: game.eco || "",
      timeControl: game.timeControl || "",
      timeControlCategory: game.timeControlCategory,
      platform: game.platform,
      playedAt: game.playedAt.toISOString(),
      gameUrl: game.gameUrl || "",
      pgn: game.pgn || "",
    })),
  });
}
