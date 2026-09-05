import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { TournamentGame } from "@/models/TournamentGame";
import { Tournament } from "@/models/Tournament";
import { completeGame, estimateClock } from "@/lib/tournamentEngine";
import { onGameCompleted } from "@/lib/tournamentLifecycle";
import { recordActivity } from "@/lib/activity";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { inactiveStudentMessage, isCurrentStudent } from "@/lib/studentAccess";
import { consumeTournamentRate, rateIdentity, rateLimitedResponse } from "@/lib/tournamentRateLimit";
import { awardTournamentGameRewards } from "@/lib/tournamentRewards";
import { emitGameFlags } from "@/lib/tournamentSocketServer";
import { berserkClock, canBerserkTimeControl, resolveTimeControl } from "@/lib/tournament/timeControl";
import { berserkGuard } from "@/lib/tournament/guards";

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
 * Berserk is available to each side only before that side has moved — not
 * "before move two", which previously let White berserk after already playing.
 */
function canBerserk(game: any, side: "white" | "black") {
  const plies = Number(game.ply ?? (game.moveHistorySAN || []).length ?? 0);
  if (side === "white") return plies === 0 && !game.berserkWhite;
  return plies <= 1 && !game.berserkBlack;
}

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const session = await auth();
  await dbConnect();

  let game: any = await TournamentGame.findById(params.gameId);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const tournament: any = await Tournament.findById(game.tournament);
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const role = session ? (session.user as any).role : "";
  const userId = session ? String((session.user as any).id) : "";

  const cookieStore = await cookies();
  const guestUsername = tournament.externalInvite?.token ? getTournamentGuestUsername(cookieStore, tournament.externalInvite.token) : "";
  const normalizedGuest = guestUsername.toLowerCase();

  const limit = consumeTournamentRate("result", rateIdentity({ userId, guestUsername, request: req }));
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterMs);

  if (role === "student" && !(await isCurrentStudent(userId))) {
    return NextResponse.json({ error: inactiveStudentMessage }, { status: 403 });
  }

  const isGuestWhite = Boolean(normalizedGuest) && String(game.whiteExternalUsername || "").toLowerCase() === normalizedGuest;
  const isGuestBlack = Boolean(normalizedGuest) && String(game.blackExternalUsername || "").toLowerCase() === normalizedGuest;
  if (!session && !isGuestWhite && !isGuestBlack) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const playsWhite = isGuestWhite || (Boolean(userId) && String(game.whiteUser || "") === userId);
  const playsBlack = isGuestBlack || (Boolean(userId) && String(game.blackUser || "") === userId);
  const canActAsPlayer = playsWhite || playsBlack;
  const actorKey = playsWhite ? game.whiteKey : playsBlack ? game.blackKey : "";

  if (role !== "admin" && !canActAsPlayer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (game.status !== "active" && role !== "admin") {
    return NextResponse.json({ error: "This game is no longer active." }, { status: 400 });
  }

  const tabId = String(body.tabId || "").slice(0, 120);
  if (canActAsPlayer && actorKey && hasActiveTabConflict(game, actorKey, tabId)) {
    return NextResponse.json({ error: "This board is already active in another tab." }, { status: 409 });
  }

  let completed = false;

  if (action === "resign") {
    if (!canActAsPlayer) return NextResponse.json({ error: "Only an assigned player can resign this game." }, { status: 400 });
    game = await completeGame(game, {
      result: playsWhite ? "0-1" : "1-0",
      termination: "resign",
      winnerKey: playsWhite ? game.blackKey : game.whiteKey,
    });
    completed = true;
  } else if (action === "draw") {
    if (!canActAsPlayer) return NextResponse.json({ error: "Only assigned players can agree a draw." }, { status: 400 });
    if (!game.drawOfferBy || game.drawOfferBy === actorKey) {
      await TournamentGame.updateOne({ _id: game._id, status: "active" }, { $set: { drawOfferBy: actorKey } });
      emitGameFlags({ gameId: String(game._id), drawOfferBy: actorKey });
      await recordActivity({
        actor: userId || undefined,
        targetUser: userId || undefined,
        type: "tournament.game.draw_offered",
        label: "Offered draw in tournament game",
        entityType: "TournamentGame",
        entityId: String(game._id),
        metadata: { tournament: String(tournament._id), round: game.roundNumber, actorSide: playsWhite ? "white" : "black" },
      });
      return NextResponse.json({ ok: true, drawOffered: true });
    }
    game = await completeGame(game, { result: "1/2-1/2", termination: "draw_agreement" });
    completed = true;
  } else if (action === "decline_draw") {
    if (!canActAsPlayer) return NextResponse.json({ error: "Only assigned players can decline a draw." }, { status: 400 });
    if (!game.drawOfferBy || game.drawOfferBy === actorKey) {
      return NextResponse.json({ error: "There is no opponent draw offer to decline." }, { status: 400 });
    }
    await TournamentGame.updateOne({ _id: game._id }, { $set: { drawOfferBy: "" } });
    emitGameFlags({ gameId: String(game._id), drawOfferBy: "" });
    return NextResponse.json({ ok: true, drawDeclined: true });
  } else if (action === "berserk") {
    if (!canActAsPlayer) return NextResponse.json({ error: "Only assigned players can berserk." }, { status: 400 });
    if (!tournament.allowBerserk) return NextResponse.json({ error: "Berserk is disabled for this tournament." }, { status: 400 });
    if (tournament.type !== "arena") return NextResponse.json({ error: "Berserk is an Arena feature." }, { status: 400 });

    const control = resolveTimeControl(tournament);
    if (!canBerserkTimeControl(control)) {
      return NextResponse.json({ error: "Berserk is not available at this time control." }, { status: 400 });
    }

    const side = playsWhite ? "white" : "black";
    if (!canBerserk(game, side)) {
      return NextResponse.json({ error: "Berserk is only available before your first move." }, { status: 400 });
    }

    // Recomputed from the tournament's own time control, so the penalty is the
    // configured one rather than half of whatever is left on the clock.
    const berserked = berserkClock(control);
    const clockMs = berserked.initialSeconds * 1000;
    const updated: any = await TournamentGame.findOneAndUpdate(
      berserkGuard(game._id, side),
      {
        $set:
          side === "white"
            ? { whiteClockMs: clockMs, whiteIncrementMs: 0, berserkWhite: true }
            : { blackClockMs: clockMs, blackIncrementMs: 0, berserkBlack: true },
      },
      { new: true }
    );
    if (!updated) return NextResponse.json({ error: "You have already berserked this game." }, { status: 400 });

    emitGameFlags({
      gameId: String(updated._id),
      berserkWhite: updated.berserkWhite,
      berserkBlack: updated.berserkBlack,
      whiteClockMs: updated.whiteClockMs,
      blackClockMs: updated.blackClockMs,
    });
    await recordActivity({
      actor: userId || undefined,
      targetUser: userId || undefined,
      type: "tournament.game.berserk",
      label: "Used berserk in tournament game",
      entityType: "TournamentGame",
      entityId: String(updated._id),
      metadata: { tournament: String(tournament._id), actorSide: side },
    });
    return NextResponse.json({ ok: true, berserked: true, game: updated });
  } else if (action === "flag") {
    // A player claiming their opponent's clock has run out. The server checks
    // the claim against its own clock; a false claim changes nothing.
    if (!canActAsPlayer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const clocks = estimateClock(game);
    if (clocks.whiteClockMs > 0 && clocks.blackClockMs > 0) {
      return NextResponse.json({ ok: true, flagged: false, game });
    }
    const whiteFlagged = clocks.whiteClockMs <= 0;
    game = await completeGame(game, {
      result: whiteFlagged ? "0-1" : "1-0",
      termination: "timeout",
      winnerKey: whiteFlagged ? game.blackKey : game.whiteKey,
    });
    completed = true;
  } else if (role === "admin" && body.result) {
    if (!["1-0", "0-1", "1/2-1/2"].includes(String(body.result))) {
      return NextResponse.json({ error: "Unsupported result." }, { status: 400 });
    }
    const previousResult = game.result || "*";
    const updated: any = await TournamentGame.findOneAndUpdate(
      { _id: game._id },
      {
        $set: {
          status: "completed",
          result: body.result,
          termination: "manual",
          winnerKey: body.result === "1-0" ? game.whiteKey : body.result === "0-1" ? game.blackKey : "",
          endedAt: game.endedAt || new Date(),
          drawOfferBy: "",
        },
      },
      { new: true }
    );
    game = updated;
    tournament.adminActions = [
      ...(tournament.adminActions || []),
      {
        actor: (session!.user as any).id,
        action: "game.result_corrected",
        note: String(body.reason || `Result corrected to ${body.result}.`).slice(0, 500),
        metadata: { gameId: String(game._id), previousResult, result: body.result },
        createdAt: new Date(),
      },
    ];
    await tournament.save();
    completed = true;
  } else {
    return NextResponse.json({ error: "Unsupported result action." }, { status: 400 });
  }

  if (completed) {
    await awardTournamentGameRewards(game);
    await onGameCompleted(String(game.tournament), String(game._id));
  }

  await recordActivity({
    actor: userId || undefined,
    targetUser: userId || undefined,
    type: action ? `tournament.game.${action}` : "tournament.game.result_updated",
    label: action ? `Tournament game ${action}` : "Updated tournament game result",
    entityType: "TournamentGame",
    entityId: String(game._id),
    metadata: {
      tournament: String(tournament._id),
      round: game.roundNumber,
      status: game.status,
      result: game.result,
      termination: game.termination,
      actorSide: actorKey === game.whiteKey ? "white" : actorKey === game.blackKey ? "black" : role || "admin",
      source: role === "admin" && !canActAsPlayer ? "manual_admin" : userId ? "student_tournament" : "guest_tournament",
    },
  });

  return NextResponse.json({ ok: true, game });
}
