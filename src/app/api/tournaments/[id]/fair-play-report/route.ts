import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";

export const dynamic = "force-dynamic";

function csv(rows: Array<Array<string | number | boolean | null | undefined>>) {
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id).lean();
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  const games = await TournamentGame.find({ tournament: params.id }).sort({ createdAt: 1 }).lean();
  const body = csv([
    ["Board", "White", "Black", "Result", "Status", "Termination", "Moves", "White Berserk", "Black Berserk", "White Online At", "Black Online At", "First Move Deadline"],
    ...games.map((game: any) => [
      game.tableNumber || "",
      game.whiteName || "",
      game.blackName || "Bye",
      game.result || "*",
      game.status || "",
      game.termination || "",
      game.moveHistorySAN?.length || 0,
      game.berserkWhite ? "yes" : "no",
      game.berserkBlack ? "yes" : "no",
      game.whiteOnlineAt ? new Date(game.whiteOnlineAt).toISOString() : "",
      game.blackOnlineAt ? new Date(game.blackOnlineAt).toISOString() : "",
      game.firstMoveDeadlineAt ? new Date(game.firstMoveDeadlineAt).toISOString() : "",
    ]),
  ]);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${String(tournament.name || "tournament").replace(/\s+/g, "-").toLowerCase()}-fair-play-report.csv"`,
    },
  });
}
