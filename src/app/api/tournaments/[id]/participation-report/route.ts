import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";

export const dynamic = "force-dynamic";

function csv(rows: Array<Array<string | number | boolean | null | undefined>>) {
  // Guests type their own names: a leading = + - @ would run as a formula in Excel.
  const safe = (cell: unknown) => {
    const text = String(cell ?? "");
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
  };
  return rows.map((row) => row.map((cell) => `"${safe(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function performance(entry: any, tournament: any) {
  const games = Number(entry.gamesPlayed || 0);
  if (!games) return "";
  const max = tournament.type === "arena" ? games * 2 : games;
  return max ? `${Math.round((Number(entry.points || 0) / max) * 100)}%` : "";
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id).lean();
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  const states = new Map((tournament.participantStates || []).map((entry: any) => [entry.playerKey, entry]));
  const guests = new Map<string, any>(
    (tournament.externalParticipants || []).map((guest: any) => [`external:${String(guest.username || "").trim().toLowerCase()}`, guest])
  );
  const standings = Array.isArray(tournament.standings) ? tournament.standings : [];
  const body = csv([
    ["Rank", "Player", "Player Key", "Type", "Username", "Email", "WhatsApp", "Rating", "Games", "Wins", "Draws", "Losses", "Byes", "Points", "Buchholz", "Performance", "Status", "Joined At", "Last Seen At"],
    ...standings.map((entry: any, index: number) => {
      const state: any = states.get(entry.playerKey);
      return [
        index + 1,
        entry.displayName || "",
        entry.playerKey || "",
        guests.has(entry.playerKey) ? "Guest" : "Member",
        guests.get(entry.playerKey)?.username || "",
        guests.get(entry.playerKey)?.email || "",
        guests.get(entry.playerKey)?.phone || "",
        entry.rating || "",
        entry.gamesPlayed || 0,
        entry.wins || 0,
        entry.draws || 0,
        entry.losses || 0,
        entry.byes || 0,
        entry.points || 0,
        entry.buchholz || 0,
        performance(entry, tournament),
        state?.status || "joined",
        state?.joinedAt ? new Date(state.joinedAt).toISOString() : "",
        state?.lastSeenAt ? new Date(state.lastSeenAt).toISOString() : "",
      ];
    }),
  ]);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${String(tournament.name || "tournament").replace(/\s+/g, "-").toLowerCase()}-participation-report.csv"`,
    },
  });
}
