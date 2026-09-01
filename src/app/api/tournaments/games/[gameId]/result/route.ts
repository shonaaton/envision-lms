import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { TournamentGame } from "@/models/TournamentGame";
import { Tournament } from "@/models/Tournament";
import { autoAdvanceSwissTournament, completeGame, enforceTournamentGameTimeouts, finalizeTournamentIfComplete, queueCompletedArenaPlayers, recalculateTournamentStandings, syncArenaPairings } from "@/lib/tournamentEngine";
import { StudentReward } from "@/models/ClassroomLive";
import { recordActivity } from "@/lib/activity";
import { calculateTournamentGameReward } from "@/lib/rewards";
import { cookies } from "next/headers";
import { getTournamentGuestUsername } from "@/lib/tournamentGuests";
import { inactiveStudentMessage, isCurrentStudent } from "@/lib/studentAccess";
import { emitTournamentUpdate } from "@/lib/tournamentSocketServer";

export const dynamic = "force-dynamic";

function hasActiveTabConflict(game: any, playerKey: string, tabId: string) {
  if (!tabId) return false;
  const isWhite = game.whiteKey === playerKey;
  const activeTab = String(isWhite ? game.whiteActiveTabId || "" : game.blackActiveTabId || "");
  const activeAt = isWhite ? game.whiteActiveTabAt : game.blackActiveTabAt;
  if (!activeTab || activeTab === tabId) return false;
  return activeAt && Date.now() - new Date(activeAt).getTime() <= 15_000;
}

function markActionTab(game: any, playerKey: string, tabId: string) {
  if (!tabId) return;
  const isWhite = game.whiteKey === playerKey;
  if (isWhite) {
    game.whiteActiveTabId = tabId;
    game.whiteActiveTabAt = new Date();
    game.whiteOnlineAt = new Date();
    game.whiteDisconnectedAt = undefined;
  } else {
    game.blackActiveTabId = tabId;
    game.blackActiveTabAt = new Date();
    game.blackOnlineAt = new Date();
    game.blackDisconnectedAt = undefined;
  }
}

async function awardForGame(game: any) {
  if (game.status !== "completed" || game.result === "*") return;
  const items = [
    game.whiteUser
      ? (() => {
          const reward = calculateTournamentGameReward(game.result, "white");
          return {
            student: game.whiteUser,
            xp: reward.xp,
            coins: reward.coins,
            badge: reward.badge,
            reason: `Tournament game vs ${game.blackName || "bye"}`,
          };
        })()
      : null,
    game.blackUser
      ? (() => {
          const reward = calculateTournamentGameReward(game.result, "black");
          return {
            student: game.blackUser,
            xp: reward.xp,
            coins: reward.coins,
            badge: reward.badge,
            reason: `Tournament game vs ${game.whiteName}`,
          };
        })()
      : null,
  ].filter(Boolean) as any[];
  await Promise.all(
    items.map((reward) =>
      StudentReward.findOneAndUpdate(
        { student: reward.student, sourceType: "tournament_game", sourceId: game._id },
        { student: reward.student, sourceType: "tournament_game", sourceId: game._id, xp: reward.xp, coins: reward.coins, badge: reward.badge || "", reason: reward.reason },
        { upsert: true, new: true }
      )
    )
  );
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
  if (role === "student" && !(await isCurrentStudent(userId))) {
    return NextResponse.json({ error: inactiveStudentMessage }, { status: 403 });
  }
  await enforceTournamentGameTimeouts(tournament);
  game = await TournamentGame.findById(params.gameId);
  if (game.status !== "active" && role !== "admin") {
    return NextResponse.json({ error: "This game is no longer active." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const guestUsername = tournament.externalInvite?.token ? getTournamentGuestUsername(cookieStore, tournament.externalInvite.token) : "";
  const normalizedGuest = guestUsername.toLowerCase();
  const isGuestPlayer =
    normalizedGuest &&
    [String(game.whiteExternalUsername || "").toLowerCase(), String(game.blackExternalUsername || "").toLowerCase()].includes(normalizedGuest);
  if (!session && !isGuestPlayer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const action = String(body.action || "");
  const isPlayer = [String(game.whiteUser || ""), String(game.blackUser || "")].includes(userId);
  const isGuestWhite = normalizedGuest && String(game.whiteExternalUsername || "").toLowerCase() === normalizedGuest;
  const isGuestBlack = normalizedGuest && String(game.blackExternalUsername || "").toLowerCase() === normalizedGuest;
  const canActAsPlayer = isPlayer || isGuestWhite || isGuestBlack;
  const actorKey = isGuestWhite || String(game.whiteUser || "") === userId ? game.whiteKey : isGuestBlack || String(game.blackUser || "") === userId ? game.blackKey : "";

  if (role !== "admin" && !canActAsPlayer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tabId = String(body.tabId || "").slice(0, 120);
  if (canActAsPlayer && actorKey && hasActiveTabConflict(game, actorKey, tabId)) {
    return NextResponse.json({ error: "This board is already active in another tab." }, { status: 409 });
  }
  if (canActAsPlayer && actorKey) markActionTab(game, actorKey, tabId);

  if (action === "resign") {
    if (!canActAsPlayer) return NextResponse.json({ error: "Only an assigned player can resign this game." }, { status: 400 });
    const userIsWhite = isGuestWhite || String(game.whiteUser || "") === userId;
    await completeGame(game, {
      result: userIsWhite ? "0-1" : "1-0",
      termination: "resign",
      winnerKey: userIsWhite ? game.blackKey : game.whiteKey,
    });
  } else if (action === "draw") {
    if (!canActAsPlayer) return NextResponse.json({ error: "Only assigned players can agree a draw." }, { status: 400 });
    if (!game.drawOfferBy || game.drawOfferBy === actorKey) {
      game.drawOfferBy = actorKey;
      await game.save();
      await recordActivity({
        actor: userId || undefined,
        targetUser: userId || undefined,
        type: "tournament.game.draw_offered",
        label: "Offered draw in tournament game",
        entityType: "TournamentGame",
        entityId: game._id.toString(),
        metadata: {
          tournament: tournament._id.toString(),
          round: game.roundNumber,
          actorSide: actorKey === game.whiteKey ? "white" : "black",
          source: userId ? "student_tournament" : "guest_tournament",
        },
      });
      emitTournamentUpdate(tournament._id.toString(), "draw_offered");
      return NextResponse.json({ ok: true, drawOffered: true, game });
    }
    await completeGame(game, {
      result: "1/2-1/2",
      termination: "draw_agreement",
    });
  } else if (action === "decline_draw") {
    if (!canActAsPlayer) return NextResponse.json({ error: "Only assigned players can decline a draw." }, { status: 400 });
    if (game.drawOfferBy && game.drawOfferBy !== actorKey) {
      game.drawOfferBy = "";
      await game.save();
      await recordActivity({
        actor: userId || undefined,
        targetUser: userId || undefined,
        type: "tournament.game.draw_declined",
        label: "Declined draw in tournament game",
        entityType: "TournamentGame",
        entityId: game._id.toString(),
        metadata: {
          tournament: tournament._id.toString(),
          round: game.roundNumber,
          actorSide: actorKey === game.whiteKey ? "white" : "black",
          source: userId ? "student_tournament" : "guest_tournament",
        },
      });
      emitTournamentUpdate(tournament._id.toString(), "draw_declined");
      return NextResponse.json({ ok: true, drawDeclined: true, game });
    }
    return NextResponse.json({ error: "There is no opponent draw offer to decline." }, { status: 400 });
  } else if (action === "berserk") {
    if (!canActAsPlayer) return NextResponse.json({ error: "Only assigned players can berserk." }, { status: 400 });
    if (!tournament.allowBerserk) return NextResponse.json({ error: "Berserk is disabled for this tournament." }, { status: 400 });
    if ((game.moveHistorySAN || []).length > 1) return NextResponse.json({ error: "Berserk is available only before the opening move limit." }, { status: 400 });
    const userIsWhite = isGuestWhite || String(game.whiteUser || "") === userId;
    if (userIsWhite) {
      if (game.berserkWhite) return NextResponse.json({ error: "White has already berserked." }, { status: 400 });
      game.whiteClockMs = Math.max(1000, Math.floor(Number(game.whiteClockMs || 0) / 2));
      game.whiteIncrementMs = 0;
      game.berserkWhite = true;
    } else {
      if (game.berserkBlack) return NextResponse.json({ error: "Black has already berserked." }, { status: 400 });
      game.blackClockMs = Math.max(1000, Math.floor(Number(game.blackClockMs || 0) / 2));
      game.blackIncrementMs = 0;
      game.berserkBlack = true;
    }
    await game.save();
    await recordActivity({
      actor: userId || undefined,
      targetUser: userId || undefined,
      type: "tournament.game.berserk",
      label: "Used berserk in tournament game",
      entityType: "TournamentGame",
      entityId: game._id.toString(),
      metadata: {
        tournament: tournament._id.toString(),
        round: game.roundNumber,
        actorSide: userIsWhite ? "white" : "black",
        source: userId ? "student_tournament" : "guest_tournament",
      },
    });
    emitTournamentUpdate(tournament._id.toString(), "berserk");
    return NextResponse.json({ ok: true, berserked: true, game });
  } else if (role === "admin" && body.result) {
    const previousResult = game.result || "*";
    game.status = "completed";
    game.result = body.result;
    game.termination = "manual";
    game.winnerKey = body.result === "1-0" ? game.whiteKey : body.result === "0-1" ? game.blackKey : "";
    game.endedAt = game.endedAt || new Date();
    game.drawOfferBy = "";
    await game.save();
    tournament.adminActions = [...(tournament.adminActions || []), {
      actor: (session!.user as any).id,
      action: "game.result_corrected",
      note: String(body.reason || `Result corrected to ${body.result}.`).slice(0, 500),
      metadata: { gameId: String(game._id), previousResult, result: body.result },
      createdAt: new Date(),
    }];
  } else {
    return NextResponse.json({ error: "Unsupported result action." }, { status: 400 });
  }

  queueCompletedArenaPlayers(tournament, game);
  await awardForGame(game);
  const currentRound = (tournament.roundsData || []).find((round: any) => Number(round.roundNumber) === Number(game.roundNumber));
  if (currentRound) {
    currentRound.pairings = (currentRound.pairings || []).map((pairing: any) =>
      String(pairing.gameId) === String(game._id) ? { ...pairing, status: "completed", result: game.result } : pairing
    );
    if ((currentRound.pairings || []).every((pairing: any) => pairing.status === "completed")) {
      currentRound.status = "completed";
      currentRound.endedAt = new Date();
    }
  }
  if (tournament.type === "swiss") await autoAdvanceSwissTournament(tournament);
  await recalculateTournamentStandings(tournament);
  if (tournament.type === "arena") await syncArenaPairings(tournament);
  await finalizeTournamentIfComplete(tournament);
  await tournament.save();
  await recordActivity({
    actor: userId || undefined,
    targetUser: userId || undefined,
    type: action ? `tournament.game.${action}` : "tournament.game.result_updated",
    label: action ? `Tournament game ${action}` : "Updated tournament game result",
    entityType: "TournamentGame",
    entityId: game._id.toString(),
    metadata: {
      tournament: tournament._id.toString(),
      round: game.roundNumber,
      status: game.status,
      result: game.result,
      termination: game.termination,
      actorSide: actorKey === game.whiteKey ? "white" : actorKey === game.blackKey ? "black" : role || "admin",
      source: role === "admin" ? "manual_admin" : userId ? "student_tournament" : "guest_tournament",
    },
  });
  emitTournamentUpdate(tournament._id.toString(), action || "result_updated");

  return NextResponse.json({ ok: true, game });
}
