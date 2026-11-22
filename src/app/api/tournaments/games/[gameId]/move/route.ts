import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { TournamentGame } from "@/models/TournamentGame";
import { applyGameMove, IllegalMoveError, MoveConflictError } from "@/lib/tournamentEngine";
import { queueGameCompleted } from "@/lib/tournamentLifecycle";
import { recordActivity } from "@/lib/activity";
import { cookies } from "next/headers";
import { getTournamentGuestUsername, isTournamentGuestRequest } from "@/lib/tournamentGuests";
import { inactiveStudentMessage } from "@/lib/studentAccess";
import { sessionStudentIsActive, tournamentInviteToken } from "@/lib/tournament/hotPath";
import { consumeTournamentRate, rateIdentity, rateLimitedResponse } from "@/lib/tournamentRateLimit";
import { awardTournamentGameRewards } from "@/lib/tournamentRewards";

/**
 * Play one move.
 *
 * An ordinary move touches exactly one game document and emits one small event
 * to that board's room. Tournament-level work — standings, pairings, round
 * progression — runs only when the move actually ends the game.
 */

export const dynamic = "force-dynamic";

function hasActiveTabConflict(game: any, playerKey: string, tabId: string) {
  if (!tabId) return false;
  const isWhite = game.whiteKey === playerKey;
  const activeTab = String(isWhite ? game.whiteActiveTabId || "" : game.blackActiveTabId || "");
  const activeAt = isWhite ? game.whiteActiveTabAt : game.blackActiveTabAt;
  if (!activeTab || activeTab === tabId) return false;
  return Boolean(activeAt && Date.now() - new Date(activeAt).getTime() <= 15_000);
}

/**
 * A refused move, logged with its reason. On 14 Nov 2026 no student move ever
 * reached the server and nothing said why; a refusal is now visible in
 * `docker logs` as `[tournament] move refused`.
 */
function refused(game: any, reason: string, body: Record<string, any>, status: number, who = "") {
  console.info(`[tournament] move refused game=${game?._id} reason=${reason} status=${status} player=${who || "-"}`);
  return NextResponse.json(body, { status });
}

/** The mover's tab and online markers, written in the same update as the move. */
function actionTabFields(game: any, playerKey: string, tabId: string) {
  if (!tabId) return { set: {}, unset: {} };
  const now = new Date();
  return game.whiteKey === playerKey
    ? { set: { whiteActiveTabId: tabId, whiteActiveTabAt: now, whiteOnlineAt: now }, unset: { whiteDisconnectedAt: 1 } }
    : { set: { blackActiveTabId: tabId, blackActiveTabAt: now, blackOnlineAt: now }, unset: { blackDisconnectedAt: 1 } };
}

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const session = isTournamentGuestRequest(req) ? null : await auth();
  await dbConnect();

  // Everything but the stored PGN, which the move rebuilds anyway.
  const game: any = await TournamentGame.findById(params.gameId).select("-pgn").lean();
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (game.status !== "active") return NextResponse.json({ error: "This game is no longer active." }, { status: 400 });

  const tournament = await tournamentInviteToken(String(game.tournament));
  if (!tournament.exists) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const cookieStore = await cookies();
  const guestUsername = tournament.token ? getTournamentGuestUsername(cookieStore, tournament.token) : "";
  const normalizedGuest = guestUsername.toLowerCase();
  const isGuestWhite = Boolean(normalizedGuest) && String(game.whiteExternalUsername || "").toLowerCase() === normalizedGuest;
  const isGuestBlack = Boolean(normalizedGuest) && String(game.blackExternalUsername || "").toLowerCase() === normalizedGuest;
  if (!session && !isGuestWhite && !isGuestBlack) return refused(game, "unauthorized", { error: "Unauthorized" }, 401);

  const userId = session ? String((session.user as any).id) : "";
  const role = session ? (session.user as any).role : "";

  const limit = consumeTournamentRate("move", rateIdentity({ userId, guestUsername, request: req }));
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterMs);

  if (role === "student" && !sessionStudentIsActive(session)) {
    return refused(game, "inactive_student", { error: inactiveStudentMessage }, 403, userId);
  }

  const isWhite = Boolean(userId) && String(game.whiteUser || "") === userId;
  const isBlack = Boolean(userId) && String(game.blackUser || "") === userId;
  // Only a player assigned to this board may move on it. An admin observing a
  // game is a spectator here; correcting a result is a separate, audited path.
  if (!isWhite && !isBlack && !isGuestWhite && !isGuestBlack) {
    return refused(game, "not_assigned", { error: "You are not assigned to this game." }, 403, userId || guestUsername);
  }
  const playsWhite = isWhite || isGuestWhite;
  const playsBlack = isBlack || isGuestBlack;
  if ((game.turn === "w" && !playsWhite) || (game.turn === "b" && !playsBlack)) {
    return refused(game, "not_your_turn", { error: "It is not your turn." }, 400, userId || guestUsername);
  }

  const body = await req.json().catch(() => ({}));
  const tabId = String(body.tabId || "").slice(0, 120);
  const actorPlayerKey = playsWhite ? game.whiteKey : game.blackKey;
  if (hasActiveTabConflict(game, actorPlayerKey, tabId)) {
    return refused(game, "other_tab", { error: "This board is already active in another tab." }, 409, actorPlayerKey);
  }

  let updated: any;
  const tab = actionTabFields(game, actorPlayerKey, tabId);
  try {
    updated = await applyGameMove(
      game,
      { from: String(body.from || ""), to: String(body.to || ""), promotion: String(body.promotion || "q") },
      { expectedPly: body.expectedPly === undefined ? undefined : Number(body.expectedPly), alsoSet: tab.set, alsoUnset: tab.unset }
    );
  } catch (error: any) {
    if (error instanceof MoveConflictError) {
      const fresh: any = await TournamentGame.findById(params.gameId).lean();
      return refused(game, "move_conflict", { error: error.message, code: "move_conflict", game: fresh }, 409, actorPlayerKey);
    }
    if (error instanceof IllegalMoveError) {
      return refused(game, "illegal_move", { error: "That move is not legal in this position.", code: "illegal_move" }, 400, actorPlayerKey);
    }
    return refused(game, "error", { error: error?.message || "Could not register move" }, 400, actorPlayerKey);
  }

  // The move is saved and already pushed to both boards. Everything below is
  // follow-up work the mover must not wait for: rewards, and — only when this
  // move ended the game — standings, ratings and the next pairing, queued per
  // tournament (lib/tournamentLifecycle.ts).
  if (updated.status === "completed") {
    void awardTournamentGameRewards(updated).catch((error) => console.error("[tournament] rewards failed", error));
    queueGameCompleted(String(updated.tournament), String(updated._id));
    // Ordinary moves are not logged one by one any more: every move is already
    // in the game's own move list, and a log row per move was the single
    // largest write load of a live event. The game's end is still recorded.
    void recordActivity({
      actor: userId || undefined,
      targetUser: userId || undefined,
      type: "tournament.game.completed_by_move",
      label: "Completed tournament game by move",
      entityType: "TournamentGame",
      entityId: String(updated._id),
      metadata: {
        tournament: String(updated.tournament),
        round: updated.roundNumber,
        ply: updated.ply,
        from: body.from,
        to: body.to,
        promotion: body.promotion || "",
        status: updated.status,
        result: updated.result,
        actorSide: playsWhite ? "white" : "black",
        source: userId ? "student_tournament" : "guest_tournament",
      },
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, game: updated });
}
