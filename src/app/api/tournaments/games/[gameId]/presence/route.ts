import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { TournamentGame } from "@/models/TournamentGame";
import { Tournament } from "@/models/Tournament";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { inactiveStudentMessage, isCurrentStudent } from "@/lib/studentAccess";
import { consumeTournamentRate, rateIdentity, rateLimitedResponse } from "@/lib/tournamentRateLimit";
import { extendedFirstMoveDeadline } from "@/lib/tournament/firstMove";

/**
 * Connectivity, kept separate from chess state.
 *
 * Presence no longer decides games: a player who loses their connection is not
 * forfeited, only shown as offline. Its remaining jobs are tab ownership,
 * recording that each player turned up, and extending the first-move grace
 * period once the player who must move actually has the board in front of them
 * — a pairing that lands while someone is still in the tournament centre must
 * not expire before they have seen it. The opponent's presence never extends
 * it, and the extension is capped, so an absent player's board always ends.
 */

export const dynamic = "force-dynamic";

const TAB_CLAIM_TIMEOUT_MS = 15_000;

async function readBody(req: Request) {
  const text = await req.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const session = await auth();
  await dbConnect();

  const game: any = await TournamentGame.findById(params.gameId).select(
    "tournament source whiteUser blackUser whiteExternalUsername blackExternalUsername status ply moveHistorySAN firstMoveDeadlineAt startedAt createdAt lastMoveAt whiteActiveTabId blackActiveTabId whiteActiveTabAt blackActiveTabAt"
  );
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const tournament: any = await Tournament.findById(game.tournament).select("externalInvite").lean();
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const cookieStore = await cookies();
  const guestUsername = tournament.externalInvite?.token ? getTournamentGuestUsername(cookieStore, tournament.externalInvite.token) : "";
  const normalizedGuest = guestUsername.toLowerCase();
  const userId = session ? String((session.user as any).id) : "";
  const role = session ? (session.user as any).role : "";

  const limit = consumeTournamentRate("presence", rateIdentity({ userId, guestUsername, request: req }));
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterMs);

  if (role === "student" && !(await isCurrentStudent(userId))) {
    return NextResponse.json({ error: inactiveStudentMessage }, { status: 403 });
  }

  const isWhite =
    (Boolean(userId) && String(game.whiteUser || "") === userId) ||
    (Boolean(normalizedGuest) && String(game.whiteExternalUsername || "").toLowerCase() === normalizedGuest);
  const isBlack =
    (Boolean(userId) && String(game.blackUser || "") === userId) ||
    (Boolean(normalizedGuest) && String(game.blackExternalUsername || "").toLowerCase() === normalizedGuest);
  if (!isWhite && !isBlack) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body: any = await readBody(req);
  const tabId = String(body.tabId || "").slice(0, 120);
  const visible = body.visible !== false;
  // The player explicitly chose to play in this tab, so it takes over from
  // whichever tab currently holds the board.
  const claim = body.claim === true;
  const color = isWhite ? "white" : "black";
  const idField = color === "white" ? "whiteActiveTabId" : "blackActiveTabId";
  const atField = color === "white" ? "whiteActiveTabAt" : "blackActiveTabAt";

  const currentTab = String(game[idField] || "");
  const currentAt = game[atField] ? new Date(game[atField]).getTime() : 0;
  const claimExpired = !currentAt || Date.now() - currentAt > TAB_CLAIM_TIMEOUT_MS;

  const set: Record<string, any> = {
    [color === "white" ? "whiteOnlineAt" : "blackOnlineAt"]: new Date(),
  };
  const unset: Record<string, any> = { [color === "white" ? "whiteDisconnectedAt" : "blackDisconnectedAt"]: 1 };
  let ownsTab = currentTab === tabId;

  if (tabId) {
    if (!visible && currentTab === tabId) {
      set[idField] = "";
      set[color === "white" ? "whiteDisconnectedAt" : "blackDisconnectedAt"] = new Date();
      delete unset[color === "white" ? "whiteDisconnectedAt" : "blackDisconnectedAt"];
      ownsTab = false;
    } else if (visible && (claim || !currentTab || currentTab === tabId || claimExpired)) {
      set[idField] = tabId;
      set[atField] = new Date();
      ownsTab = true;
    }
  }

  // The player who owes the first move keeps their grace period rolling from
  // the moment they actually see the board, up to a cap.
  if (visible) {
    const extended = extendedFirstMoveDeadline(game, color);
    if (extended) set.firstMoveDeadlineAt = extended;
  }

  await TournamentGame.updateOne({ _id: game._id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) });

  return NextResponse.json({ ok: true, activeTab: ownsTab, color });
}
