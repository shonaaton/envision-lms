import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { TournamentGame } from "@/models/TournamentGame";
import {
  countAvailableTournamentPlayers,
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
  withVersionRetry,
} from "@/lib/tournamentEngine";
import { notifyTournamentUsers } from "@/lib/tournamentNotifications";
import { sendTournamentReminder } from "@/lib/tournamentReminders";
import { dueTournamentReminder } from "@/lib/tournament/reminderSchedule";
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
  reminders: number;
  started: number;
  paired: number;
  roundsAdvanced: number;
  gamesEnded: number;
  finalized: number;
};

/**
 * Send the 30- or 10-minute start reminder if one is due. Claimed with a
 * guarded $addToSet before anything is sent, so two ticks (the scheduler and
 * the cron endpoint) cannot both send it.
 */
async function sendDueReminder(tournament: any, now: number) {
  const sent = new Set((tournament.remindersSent || []).map((value: any) => Number(value)));
  const due = dueTournamentReminder(tournament.startAt, now, (minutes) => sent.has(minutes));
  if (!due) return false;
  const claimed = await Tournament.updateOne(
    { _id: tournament._id, remindersSent: { $ne: due }, status: { $in: PENDING_STATUSES } },
    { $addToSet: { remindersSent: due } }
  );
  if (!claimed.modifiedCount) return false;
  void sendTournamentReminder(tournament, due)
    .then((reached) =>
      Tournament.updateOne(
        { _id: tournament._id },
        {
          $push: {
            adminActions: {
              action: `notification.reminder_${due}`,
              note: `${due}-minute start reminder sent to ${reached.members} member(s) and ${reached.guests} guest(s).`,
              metadata: reached,
              createdAt: new Date(),
            },
          },
        }
      )
    )
    .catch((error) => console.error(`Tournament ${due}-minute reminder failed`, error));
  return true;
}

export function isDueToStart(tournament: any, at: number = Date.now()) {
  return (
    PENDING_STATUSES.includes(String(tournament.status || "")) &&
    new Date(tournament.startAt || 0).getTime() <= at &&
    countAvailableTournamentPlayers(tournament) >= 2
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
    if (!result.created && (result.skipped === "waiting_for_players" || result.skipped === "no_players")) {
      const idleSince = lastEndedAt || (tournament.startedAt ? new Date(tournament.startedAt).getTime() : Date.now());
      // Never on an admin's "next round": that click should explain, not end the event.
      if (!options.force && Date.now() - idleSince >= SWISS_IDLE_FINISH_MS) {
        const finished = await finishSwissEarly(String(tournament._id), {
          action: "tournament.finished_no_players",
          note: `Finished after round ${tournament.currentRound}: fewer than two players were available for ${Math.round(SWISS_IDLE_FINISH_MS / 60000)} minutes.`,
          message: (fresh) => `${fresh.name} finished after ${fresh.currentRound} rounds: not enough players were left to pair another round.`,
        });
        return { advanced: false, finished };
      }
      return { advanced: false, waiting: true };
    }
    return { advanced: Boolean(result.created), roundNumber: result.roundNumber };
  } catch (error) {
    if (error instanceof SwissExhaustedError) {
      // Every remaining pairing would repeat a game already played. The event
      // is over on its own terms: it is finished, not broken, so it is
      // finalised with the rounds it did play rather than left hanging or
      // silently replaying fixtures.
      const finished = await finishSwissEarly(String(tournament._id), {
        action: "tournament.pairings_exhausted",
        note: `Finished after round ${tournament.currentRound}: no further pairing is possible without repeating a game.`,
        message: (fresh) => `${fresh.name} finished after ${fresh.currentRound} rounds: no further pairings were possible.`,
      });
      return { advanced: false, finished, exhausted: true };
    }
    throw error;
  }
}

/**
 * How long a Swiss event may sit with fewer than two players to pair before it
 * finishes on the rounds it played. Long enough for a player who missed a
 * board to come back; short enough that nobody finds a "live" event from last
 * night (28 Oct 2026 stayed live for 22 hours).
 */
export const SWISS_IDLE_FINISH_MS = 30 * 60 * 1000;

/** Finish a Swiss event before its scheduled rounds, recording why. */
async function finishSwissEarly(tournamentId: string, reason: { action: string; note: string; message: (fresh: any) => string }) {
  const fresh: any = await Tournament.findById(tournamentId);
  if (!fresh || isFinishedStatus(fresh.status) || fresh.status === "cancelled") return false;
  fresh.status = "finished";
  fresh.endedAt = fresh.endedAt || new Date();
  fresh.adminActions = [
    ...(fresh.adminActions || []),
    {
      action: reason.action,
      note: reason.note,
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
    message: reason.message(fresh),
    href: `/tournaments/${fresh._id}`,
  });
  return true;
}

/**
 * Process one tournament. Safe to call repeatedly and from more than one place:
 * the pairing and round locks make the expensive parts single-writer.
 */
export async function processTournament(tournamentId: string, options: { force?: boolean } = {}) {
  return withVersionRetry(() => processTournamentOnce(tournamentId, options));
}

async function processTournamentOnce(tournamentId: string, options: { force?: boolean }) {
  const summary = { startingSoon: 0, reminders: 0, started: 0, paired: 0, roundsAdvanced: 0, gamesEnded: 0, finalized: 0 };
  let tournament: any = await Tournament.findById(tournamentId);
  if (!tournament) return summary;

  const now = Date.now();
  const startsIn = new Date(tournament.startAt || 0).getTime() - now;

  if (PENDING_STATUSES.includes(String(tournament.status)) && startsIn > 0 && startsIn <= STARTING_SOON_WINDOW_MS && tournament.status !== "starting_soon") {
    tournament.status = "starting_soon";
    await tournament.save();
    emitTournamentStatus(String(tournament._id), "starting_soon", { startAt: tournament.startAt });
    summary.startingSoon += 1;
  }

  // After the save above, and followed by a fresh load: the claim is written
  // straight to the database, which the in-memory copy does not know about.
  if (PENDING_STATUSES.includes(String(tournament.status)) && (await sendDueReminder(tournament, now))) {
    summary.reminders += 1;
    tournament = await Tournament.findById(tournamentId);
    if (!tournament) return summary;
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
  // The heartbeat runs at boot, before any request has opened the connection;
  // without this the first query just buffers for 10s and fails.
  await dbConnect();
  const tournaments: any[] = await Tournament.find({ status: { $in: ACTIVE_STATUSES } }, "_id").lean();
  const summary: TickSummary = {
    checked: tournaments.length,
    startingSoon: 0,
    reminders: 0,
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
      summary.reminders += one.reminders;
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
  return withVersionRetry(() => handleGameCompleted(tournamentId, gameId));
}

async function handleGameCompleted(tournamentId: string, _gameId: string) {
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
