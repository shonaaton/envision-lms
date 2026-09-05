import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import {
  enforceTournamentGameTimeouts,
  freezeTournamentResults,
  generateSwissRound,
  isFinishedStatus,
  isPlayingStatus,
  publishStandings,
  recalculateTournamentStandings,
  startTournament,
  SwissExhaustedError,
  syncArenaPairings,
  syncSwissRoundState,
} from "@/lib/tournamentEngine";
import { notifyExternalTournamentParticipants, notifyTournamentUsers } from "@/lib/tournamentNotifications";
import { emitRoundCompleted, emitTournamentEnded, emitTournamentStatus, flushStandings } from "@/lib/tournamentSocketServer";

/**
 * Tournament lifecycle.
 *
 * Everything that *changes* a tournament because time has passed lives here and
 * runs from one scheduled worker. Read endpoints are reads: a student opening
 * the standings page is not what starts a tournament, creates a pairing,
 * finalises a result or sends a notification.
 *
 * Every step is idempotent, so a duplicate tick, a retry or an admin override
 * running at the same moment cannot double anything.
 */

const STARTING_SOON_WINDOW_MS = 15 * 60 * 1000;
const PENDING_STATUSES = ["created", "registration_open", "starting_soon", "upcoming"];
const ACTIVE_STATUSES = [...PENDING_STATUSES, "live", "playing"];

export type TickSummary = {
  checked: number;
  startingSoon: number;
  started: number;
  paired: number;
  roundsAdvanced: number;
  gamesEnded: number;
  finalized: number;
};

function participantCount(tournament: any) {
  return Number((tournament?.participants || []).length) + Number((tournament?.externalParticipants || []).length);
}

async function announceStartingSoon(tournament: any) {
  const already = (tournament.adminActions || []).some((action: any) => action.action === "notification.starting_soon");
  if (already) return;
  await notifyTournamentUsers(tournament, {
    type: "tournament.starting_soon",
    title: "Tournament starting soon",
    message: `${tournament.name} starts in less than 15 minutes.`,
    href: `/tournaments/${tournament._id}`,
  });
  await notifyExternalTournamentParticipants(tournament, {
    subject: `Starting soon: ${tournament.name}`,
    message: (participant) =>
      `Hello ${participant.displayName || participant.username},\n\n${tournament.name} starts in less than 15 minutes. Open your tournament link to enter the lobby.`,
  });
  tournament.adminActions = [
    ...(tournament.adminActions || []),
    { action: "notification.starting_soon", note: "Starting-soon notification sent by lifecycle worker.", createdAt: new Date() },
  ];
}

export function isDueToStart(tournament: any, at: number = Date.now()) {
  return (
    PENDING_STATUSES.includes(String(tournament.status || "")) &&
    new Date(tournament.startAt || 0).getTime() <= at &&
    participantCount(tournament) >= 2
  );
}

export function arenaHasExpired(tournament: any, at: number = Date.now()) {
  return tournament.type === "arena" && tournament.arenaEndsAt && new Date(tournament.arenaEndsAt).getTime() <= at;
}

/**
 * Finish an arena whose clock has run out.
 *
 * Standings were already frozen at `arenaEndsAt` by the scoring cutoff, so this
 * only records the transition. Games still in progress are left alone to
 * finish for their own sake; they cannot change the frozen table.
 */
async function finalizeArena(tournament: any) {
  tournament.status = "finished";
  tournament.endedAt = tournament.endedAt || new Date(tournament.arenaEndsAt);
  await freezeTournamentResults(tournament);
  await tournament.save();
  // Push any coalesced leaderboard before announcing the end, so the final
  // table a client holds is the final table.
  publishStandings(tournament);
  flushStandings(String(tournament._id));
  emitTournamentEnded(String(tournament._id));
  return true;
}

async function finalizeSwissIfComplete(tournament: any) {
  const totalRounds = Number(tournament.rounds || 0);
  if (Number(tournament.currentRound || 0) < totalRounds) return false;
  const current = (tournament.roundsData || []).find((round: any) => Number(round.roundNumber) === Number(tournament.currentRound));
  if (current?.status !== "completed") return false;
  tournament.status = "finished";
  tournament.endedAt = tournament.endedAt || new Date();
  await recalculateTournamentStandings(tournament);
  await freezeTournamentResults(tournament);
  await tournament.save();
  publishStandings(tournament);
  flushStandings(String(tournament._id));
  emitTournamentEnded(String(tournament._id));
  return true;
}

/**
 * Move a Swiss event forward: reconcile the current round against its games,
 * then start the next one once the configured break has elapsed.
 */
export async function advanceSwiss(tournament: any, options: { force?: boolean } = {}) {
  if (tournament.type !== "swiss" || !isPlayingStatus(tournament.status)) return { advanced: false };

  const games = await TournamentGame.find({ tournament: tournament._id }, "status result roundNumber").lean();
  const { changed, completedRound } = syncSwissRoundState(tournament, games);
  if (changed) {
    tournament.currentRound = Math.max(Number(tournament.currentRound || 0), completedRound);
    await recalculateTournamentStandings(tournament);
    await tournament.save();
    publishStandings(tournament);
  }

  const rounds = Array.isArray(tournament.roundsData) ? tournament.roundsData : [];
  const unfinished = rounds.find((round: any) => round.status !== "completed");
  const lastCompleted = rounds
    .filter((round: any) => round.status === "completed")
    .sort((a: any, b: any) => Number(b.roundNumber || 0) - Number(a.roundNumber || 0))[0];

  const breakMs = Math.max(0, Number(tournament.breakBetweenRoundsMinutes || 0)) * 60 * 1000;
  const lastEndedAt = lastCompleted?.endedAt ? new Date(lastCompleted.endedAt).getTime() : 0;
  const nextRoundAt = lastEndedAt ? lastEndedAt + breakMs : null;

  if (changed && lastCompleted) {
    emitRoundCompleted(String(tournament._id), Number(lastCompleted.roundNumber || 0), nextRoundAt);
  }

  if (await finalizeSwissIfComplete(tournament)) return { advanced: false, finished: true };
  if (unfinished && !options.force) return { advanced: false };
  if (Number(tournament.currentRound || 0) >= Number(tournament.rounds || 0)) return { advanced: false };
  if (!options.force && nextRoundAt && Date.now() < nextRoundAt) return { advanced: false, nextRoundAt };

  try {
    const result = await generateSwissRound(String(tournament._id), { force: options.force });
    return { advanced: Boolean(result.created), roundNumber: result.roundNumber };
  } catch (error) {
    if (error instanceof SwissExhaustedError) {
      // Every remaining pairing would repeat a game already played. The event
      // is over on its own terms: it is finished, not broken, so it is
      // finalised with the rounds it did play rather than left hanging or
      // silently replaying fixtures.
      const fresh: any = await Tournament.findById(tournament._id);
      if (!fresh || isFinishedStatus(fresh.status)) return { advanced: false };
      fresh.status = "finished";
      fresh.endedAt = fresh.endedAt || new Date();
      fresh.adminActions = [
        ...(fresh.adminActions || []),
        {
          action: "tournament.pairings_exhausted",
          note: `Finished after round ${fresh.currentRound}: no further pairing is possible without repeating a game.`,
          metadata: { roundsPlayed: Number(fresh.currentRound || 0), roundsScheduled: Number(fresh.rounds || 0) },
          createdAt: new Date(),
        },
      ];
      await recalculateTournamentStandings(fresh);
      await freezeTournamentResults(fresh);
      await fresh.save();
      publishStandings(fresh);
      flushStandings(String(fresh._id));
      emitTournamentEnded(String(fresh._id));
      await notifyTournamentUsers(fresh, {
        type: "tournament.completed",
        title: "Tournament finished",
        message: `${fresh.name} finished after ${fresh.currentRound} rounds: no further pairings were possible.`,
        href: `/tournaments/${fresh._id}`,
      });
      return { advanced: false, finished: true, exhausted: true };
    }
    throw error;
  }
}

/**
 * Process one tournament. Safe to call repeatedly and from more than one place:
 * the pairing and round locks make the expensive parts single-writer.
 */
export async function processTournament(tournamentId: string, options: { force?: boolean } = {}) {
  const summary = { startingSoon: 0, started: 0, paired: 0, roundsAdvanced: 0, gamesEnded: 0, finalized: 0 };
  let tournament: any = await Tournament.findById(tournamentId);
  if (!tournament) return summary;

  const now = Date.now();
  const startsIn = new Date(tournament.startAt || 0).getTime() - now;

  if (PENDING_STATUSES.includes(String(tournament.status)) && startsIn > 0 && startsIn <= STARTING_SOON_WINDOW_MS) {
    if (tournament.status !== "starting_soon") {
      tournament.status = "starting_soon";
      emitTournamentStatus(String(tournament._id), "starting_soon", { startAt: tournament.startAt });
    }
    await announceStartingSoon(tournament);
    await tournament.save();
    summary.startingSoon += 1;
  }

  if (isDueToStart(tournament, now)) {
    await startTournament(tournament);
    emitTournamentStatus(String(tournament._id), "playing", { startedAt: tournament.startedAt });
    summary.started += 1;
    tournament = await Tournament.findById(tournamentId);
  }

  if (!isPlayingStatus(tournament.status)) return summary;

  const ended = await enforceTournamentGameTimeouts(tournament);
  summary.gamesEnded += ended.length;

  if (ended.length) {
    tournament = await Tournament.findById(tournamentId);
    await recalculateTournamentStandings(tournament);
    await tournament.save();
    publishStandings(tournament);
  }

  if (tournament.type === "arena") {
    if (arenaHasExpired(tournament, now)) {
      await finalizeArena(tournament);
      summary.finalized += 1;
      return summary;
    }
    if (!tournament.pausedByAdmin) {
      const paired = await syncArenaPairings(String(tournament._id));
      summary.paired += paired.created;
    }
    return summary;
  }

  if (!tournament.pausedByAdmin || options.force) {
    const advance = await advanceSwiss(tournament, options);
    if (advance.advanced) summary.roundsAdvanced += 1;
    if ((advance as any).finished) summary.finalized += 1;
  }
  return summary;
}

/**
 * One pass over every tournament that could need attention. Called by the
 * scheduled worker and by the cron-protected endpoint.
 */
export async function runTournamentTick(): Promise<TickSummary> {
  const tournaments: any[] = await Tournament.find({ status: { $in: ACTIVE_STATUSES } }, "_id").lean();
  const summary: TickSummary = {
    checked: tournaments.length,
    startingSoon: 0,
    started: 0,
    paired: 0,
    roundsAdvanced: 0,
    gamesEnded: 0,
    finalized: 0,
  };

  for (const tournament of tournaments) {
    try {
      const one = await processTournament(String(tournament._id));
      summary.startingSoon += one.startingSoon;
      summary.started += one.started;
      summary.paired += one.paired;
      summary.roundsAdvanced += one.roundsAdvanced;
      summary.gamesEnded += one.gamesEnded;
      summary.finalized += one.finalized;
      await Tournament.updateOne({ _id: tournament._id }, { $set: { lifecycleAt: new Date() } });
    } catch (error) {
      // One broken tournament must not stall the rest of the event schedule.
      console.error(`Tournament lifecycle failed for ${tournament._id}`, error);
    }
  }
  return summary;
}

/**
 * React to a game that has just finished.
 *
 * This is the only tournament-level work a move is allowed to trigger, and it
 * only runs when a board actually ends — never on an ordinary move.
 */
export async function onGameCompleted(tournamentId: string, gameId: string) {
  const tournament: any = await Tournament.findById(tournamentId);
  if (!tournament) return;

  const games = await TournamentGame.find({ tournament: tournament._id }, "_id status result roundNumber").lean();
  const { changed, completedRound } = syncSwissRoundState(tournament, games);
  if (changed) tournament.currentRound = Math.max(Number(tournament.currentRound || 0), completedRound);

  await recalculateTournamentStandings(tournament);
  await tournament.save();
  publishStandings(tournament);

  if (isFinishedStatus(tournament.status)) return;

  if (tournament.type === "arena") {
    if (arenaHasExpired(tournament)) {
      await finalizeArena(tournament);
      return;
    }
    if (!tournament.pausedByAdmin) await syncArenaPairings(String(tournament._id));
    return;
  }

  await advanceSwiss(tournament);
}
