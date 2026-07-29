import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { TournamentGame } from "@/models/TournamentGame";
import { Tournament } from "@/models/Tournament";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { inactiveStudentMessage, isCurrentStudent } from "@/lib/studentAccess";

export const dynamic = "force-dynamic";

async function readBody(req: Request) {
  const text = await req.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function updateTabPresence(game: any, color: "white" | "black", tabId: string, visible: boolean) {
  if (!tabId) return;
  const idField = color === "white" ? "whiteActiveTabId" : "blackActiveTabId";
  const atField = color === "white" ? "whiteActiveTabAt" : "blackActiveTabAt";
  const disconnectedField = color === "white" ? "whiteDisconnectedAt" : "blackDisconnectedAt";
  const currentTab = String(game[idField] || "");
  const currentAt = game[atField] ? new Date(game[atField]).getTime() : 0;
  const expired = !currentAt || Date.now() - currentAt > 15_000;
  if (!visible && currentTab === tabId) {
    game[idField] = "";
    game[atField] = undefined;
    game[disconnectedField] = new Date();
    return;
  }
  if (visible && (!currentTab || currentTab === tabId || expired)) {
    game[idField] = tabId;
    game[atField] = new Date();
    game[disconnectedField] = undefined;
  }
}

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const session = await auth();
  await dbConnect();
  const game: any = await TournamentGame.findById(params.gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const tournament: any = await Tournament.findById(game.tournament);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const cookieStore = await cookies();
  const guestUsername = tournament.externalInvite?.token ? getTournamentGuestUsername(cookieStore, tournament.externalInvite.token) : "";
  const normalizedGuest = guestUsername.toLowerCase();
  const userId = session ? String((session.user as any).id) : "";
  const role = session ? (session.user as any).role : "";
  if (role === "student" && !(await isCurrentStudent(userId))) {
    return NextResponse.json({ error: inactiveStudentMessage }, { status: 403 });
  }
  const isWhite = String(game.whiteUser || "") === userId || (normalizedGuest && String(game.whiteExternalUsername || "").toLowerCase() === normalizedGuest);
  const isBlack = String(game.blackUser || "") === userId || (normalizedGuest && String(game.blackExternalUsername || "").toLowerCase() === normalizedGuest);
  if (!isWhite && !isBlack) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body: any = await readBody(req);
  const tabId = String(body.tabId || "").slice(0, 120);
  const visible = body.visible !== false;

  if (isWhite) {
    game.whiteOnlineAt = new Date();
    game.whiteDisconnectedAt = undefined;
    updateTabPresence(game, "white", tabId, visible);
  }
  if (isBlack) {
    game.blackOnlineAt = new Date();
    game.blackDisconnectedAt = undefined;
    updateTabPresence(game, "black", tabId, visible);
  }
  await game.save();
  return NextResponse.json({
    ok: true,
    activeTab: isWhite ? String(game.whiteActiveTabId || "") === tabId : String(game.blackActiveTabId || "") === tabId,
  });
}
