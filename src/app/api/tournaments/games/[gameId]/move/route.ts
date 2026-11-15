import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { TournamentGame } from "@/models/TournamentGame";
import { Tournament } from "@/models/Tournament";
import { applyGameMove, IllegalMoveError, MoveConflictError } from "@/lib/tournamentEngine";
import { onGameCompleted } from "@/lib/tournamentLifecycle";
import { recordActivity } from "@/lib/activity";
import { cookies } from "next/headers";
import { getTournamentGuestUsername, isTournamentGuestRequest } from "@/lib/tournamentGuests";
import { inactiveStudentMessage, isCurrentStudent } from "@/lib/studentAccess";
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

async function markActionTab(game: any, playerKey: string, tabId: string) {
  if (!tabId) return;
  const isWhite = game.whiteKey === playerKey;
  await TournamentGame.updateOne(
    { _id: game._id },
    {
      $set: isWhite
        ? { whiteActiveTabId: tabId, whiteActiveTabAt: new Date(), whiteOnlineAt: new Date() }
        : { blackActiveTabId: tabId, blackActiveTabAt: new Date(), blackOnlineAt: new Date() },
      $unset: isWhite ? { whiteDisconnectedAt: 1 } : { blackDisconnectedAt: 1 },
    }
  );
}

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const session = isTournamentGuestRequest(req) ? null : await auth();
  await dbConnect();

  const game: any = await TournamentGame.findById(params.gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  if (game.status !== "active") return NextResponse.json({ error: "This game is no longer active." }, { status: 400 });

  const tournament: any = await Tournament.findById(game.tournament).select("name externalInvite type status").lean();
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const cookieStore = await cookies();
  const guestUsername = tournament.externalInvite?.token ? getTournamentGuestUsername(cookieStore, tournament.externalInvite.token) : "";
  const normalizedGuest = guestUsername.toLowerCase();
  const isGuestWhite = Boolean(normalizedGuest) && String(game.whiteExternalUsername || "").toLowerCase() === normalizedGuest;
  const isGuestBlack = Boolean(normalizedGuest) && String(game.blackExternalUsername || "").toLowerCase() === normalizedGuest;
  if (!session && !isGuestWhite && !isGuestBlack) return refused(game, "unauthorized", { error: "Unauthorized" }, 401);

  const userId = session ? String((session.user as any).id) : "";
  const role = session ? (session.user as any).role : "";

  const limit = consumeTournamentRate("move", rateIdentity({ userId, guestUsername, request: req }));
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterMs);

  if (role === "student" && !(await isCurrentStudent(userId))) {
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
  try {
    updated = await applyGameMove(
      game,
      { from: String(body.from || ""), to: String(body.to || ""), promotion: String(body.promotion || "q") },
      { expectedPly: body.expectedPly === undefined ? undefined : Number(body.expectedPly) }
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

  await markActionTab(updated, actorPlayerKey, tabId);

  if (updated.status === "completed") {
    await awardTournamentGameRewards(updated);
    await onGameCompleted(String(updated.tournament), String(updated._id));
  }

  await recordActivity({
    actor: userId || undefined,
    targetUser: userId || undefined,
    type: updated.status === "completed" ? "tournament.game.completed_by_move" : "tournament.game.move_played",
    label: updated.status === "completed" ? "Completed tournament game by move" : "Played tournament game move",
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
  });

  return NextResponse.json({ ok: true, game: updated });
}
