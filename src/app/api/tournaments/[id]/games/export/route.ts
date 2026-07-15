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
  const games = await TournamentGame.find({ tournament: params.id }).sort({ roundNumber: 1, tableNumber: 1, createdAt: 1 }).lean();
  const body = csv([
    ["Round", "Board", "White", "White Rating", "Black", "Black Rating", "Result", "Status", "Termination", "Moves", "White Berserk", "Black Berserk", "Started At", "Ended At"],
    ...games.map((game: any) => [
      game.roundNumber || (game.source === "arena" ? "Arena" : ""),
      game.tableNumber || "",
      game.whiteName || "",
      game.whiteRating || "",
      game.blackName || "Bye",
      game.blackRating || "",
      game.result || "*",
      game.status || "",
      game.termination || "",
      game.moveHistorySAN?.length || 0,
      game.berserkWhite ? "yes" : "no",
      game.berserkBlack ? "yes" : "no",
      game.startedAt ? new Date(game.startedAt).toISOString() : "",
      game.endedAt ? new Date(game.endedAt).toISOString() : "",
    ]),
  ]);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${String(tournament.name || "tournament").replace(/\s+/g, "-").toLowerCase()}-games.csv"`,
    },
  });
}
