import { Chess } from "chess.js";
import { TournamentGame } from "@/models/TournamentGame";
import { Tournament } from "@/models/Tournament";
import { notifyExternalTournamentParticipant, notifyExternalTournamentParticipants, notifyTournamentUsers } from "@/lib/tournamentNotifications";

export type TournamentLike = any;
export type TournamentGameLike = any;
const FIRST_MOVE_COUNTDOWN_MS = 45 * 1000;
const DISCONNECTION_GRACE_MS = 120 * 1000;

type TournamentPlayer = {
  key: string;
  userId?: string;
  externalUsername?: string;
  name: string;
  rating: number;
};

type StandingEntry = {
  playerKey: string;
  user?: string;
  externalUsername?: string;
  displayName: string;
  rating: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  gamesPlayed: number;
  buchholz: number;
  streak: number;
  lastColor: string;
  scoreHistory: number[];
  recentResults?: string[];
};

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function isPlayingStatus(status: any) {
  return ["live", "playing"].includes(String(status || ""));
}

function isFinishedStatus(status: any) {
  return ["completed", "finished"].includes(String(status || ""));
}

export function playerKeyForUser(userId: string) {
  return `user:${userId}`;
}

export function playerKeyForExternal(username: string) {
  return `external:${String(username).trim().toLowerCase()}`;
}

export function getTournamentPlayers(tournament: TournamentLike): TournamentPlayer[] {
  const standingMap = new Map<string, any>((tournament.standings || []).map((entry: any) => [entry.playerKey, entry]));
  const internal = (tournament.participants || []).map((item: any) => ({
    key: playerKeyForUser(objectId(item)),
    userId: objectId(item),
    name: item?.name || item?.username || standingMap.get(playerKeyForUser(objectId(item)))?.displayName || "Student",
    rating: Number(item?.rating || standingMap.get(playerKeyForUser(objectId(item)))?.rating || 0),
  }));
  const external = (tournament.externalParticipants || []).map((item: any) => ({
    key: playerKeyForExternal(item.username),
    externalUsername: item.username,
    name: item.displayName || item.username || standingMap.get(playerKeyForExternal(item.username))?.displayName || "Guest",
    rating: Number(standingMap.get(playerKeyForExternal(item.username))?.rating || 0),
  }));
  return [...internal, ...external];
}

export function ensureTournamentStandings(tournament: TournamentLike) {
  const byKey = new Map<string, any>((tournament.standings || []).map((entry: any) => [entry.playerKey, entry]));
  tournament.standings = getTournamentPlayers(tournament).map((player) => ({
    playerKey: player.key,
    user: player.userId || undefined,
    externalUsername: player.externalUsername || undefined,
    displayName: player.name,
    rating: Number(player.rating || byKey.get(player.key)?.rating || 0),
    points: Number(byKey.get(player.key)?.points || 0),
    wins: Number(byKey.get(player.key)?.wins || 0),
    draws: Number(byKey.get(player.key)?.draws || 0),
    losses: Number(byKey.get(player.key)?.losses || 0),
    byes: Number(byKey.get(player.key)?.byes || 0),
    gamesPlayed: Number(byKey.get(player.key)?.gamesPlayed || 0),
    buchholz: Number(byKey.get(player.key)?.buchholz || 0),
    streak: Number(byKey.get(player.key)?.streak || 0),
    lastColor: String(byKey.get(player.key)?.lastColor || ""),
    scoreHistory: Array.isArray(byKey.get(player.key)?.scoreHistory) ? byKey.get(player.key).scoreHistory : [],
    recentResults: Array.isArray(byKey.get(player.key)?.recentResults) ? byKey.get(player.key).recentResults : [],
  }));
  return tournament.standings;
}

function participantStateMap(tournament: TournamentLike) {
  return new Map<string, any>((tournament.participantStates || []).map((entry: any) => [entry.playerKey, entry]));
}

function normalizeParticipantStates(tournament: TournamentLike) {
  const existing = participantStateMap(tournament);
  const now = new Date();
  tournament.participantStates = getTournamentPlayers(tournament).map((player) => {
    const current = existing.get(player.key);
    return {
      playerKey: player.key,
      status: current?.status || "joined",
      joinedAt: current?.joinedAt || now,
      queuedAt: current?.queuedAt,
      pausedAt: current?.pausedAt,
      lastSeenAt: current?.lastSeenAt,
    };
  });
  return tournament.participantStates;
}

export function setTournamentPlayerState(tournament: TournamentLike, playerKey: string, status: "joined" | "queued" | "playing" | "paused" | "withdrawn") {
  normalizeParticipantStates(tournament);
  const now = new Date();
  const states = tournament.participantStates || [];
  const index = states.findIndex((entry: any) => entry.playerKey === playerKey);
  const next = {
    ...(index >= 0 ? states[index] : { playerKey, joinedAt: now }),
    status,
    queuedAt: status === "queued" ? now : index >= 0 ? states[index]?.queuedAt : undefined,
    pausedAt: status === "paused" ? now : index >= 0 ? states[index]?.pausedAt : undefined,
    lastSeenAt: now,
  };
  if (index >= 0) states[index] = next;
  else states.push(next);
  tournament.participantStates = states;
  return next;
}

function activeQueueStates(tournament: TournamentLike) {
  normalizeParticipantStates(tournament);
  return participantStateMap(tournament);
}

function standingsMap(tournament: TournamentLike) {
  ensureTournamentStandings(tournament);
  return new Map<string, StandingEntry>((tournament.standings || []).map((entry: any) => [entry.playerKey, entry as StandingEntry]));
}

function completedScore(result: string, playerKey: string, whiteKey: string, blackKey: string) {
  if (result === "1-0") return playerKey === whiteKey ? 1 : 0;
  if (result === "0-1") return playerKey === blackKey ? 1 : 0;
  if (result === "1/2-1/2") return 0.5;
  return 0;
}

function tournamentPoints(game: any, rawScore: number, tournament: TournamentLike, entry?: StandingEntry, color?: "white" | "black") {
  if (game.source === "arena") {
    if (rawScore === 1) {
      const streakBonus = tournament.arenaStreaks !== false && Number(entry?.streak || 0) >= 1 ? 2 : 0;
      const berserkBonus = color === "white" && game.berserkWhite ? 1 : color === "black" && game.berserkBlack ? 1 : 0;
      return 2 + streakBonus + berserkBonus;
    }
    if (rawScore === 0.5) {
      const moveCount = Number((game.moveHistorySAN || []).length || 0);
      const earlyDrawLimit = Math.max(0, Number(tournament.earlyDrawMoveLimit ?? 10));
      if (earlyDrawLimit > 0 && moveCount > 0 && moveCount < earlyDrawLimit) return 0;
      const drawStreakLimit = Math.max(0, Number(tournament.drawStreakLimit ?? 2));
      const recent = entry?.recentResults || [];
      let trailingDraws = 0;
      for (let index = recent.length - 1; index >= 0; index -= 1) {
        if (recent[index] !== "D") break;
        trailingDraws += 1;
      }
      if (drawStreakLimit > 0 && trailingDraws >= drawStreakLimit) return 0;
      return 1;
    }
    return 0;
  }
  return rawScore;
}

function resultFromChess(chess: Chess) {
  if (chess.isCheckmate()) return chess.turn() === "w" ? { result: "0-1", termination: "checkmate", winnerColor: "black" } : { result: "1-0", termination: "checkmate", winnerColor: "white" };
  if (chess.isStalemate()) return { result: "1/2-1/2", termination: "stalemate" };
  if (chess.isThreefoldRepetition()) return { result: "1/2-1/2", termination: "repetition" };
  if (chess.isInsufficientMaterial()) return { result: "1/2-1/2", termination: "insufficient_material" };
  return null;
}

export function estimateClock(game: TournamentGameLike) {
  if (game.status !== "active") return { whiteClockMs: game.whiteClockMs, blackClockMs: game.blackClockMs };
  const elapsed = Math.max(0, Date.now() - new Date(game.lastMoveAt || game.startedAt || Date.now()).getTime());
  if (game.turn === "w") return { whiteClockMs: Math.max(0, game.whiteClockMs - elapsed), blackClockMs: game.blackClockMs };
  return { whiteClockMs: game.whiteClockMs, blackClockMs: Math.max(0, game.blackClockMs - elapsed) };
}

export async function recalculateTournamentStandings(tournament: TournamentLike) {
  ensureTournamentStandings(tournament);
  const games = await TournamentGame.find({ tournament: tournament._id }).sort({ createdAt: 1 }).lean();
  const map = standingsMap(tournament);

  for (const entry of Array.from(map.values())) {
    entry.points = 0;
    entry.wins = 0;
    entry.draws = 0;
    entry.losses = 0;
    entry.byes = 0;
    entry.gamesPlayed = 0;
    entry.buchholz = 0;
    entry.streak = 0;
    entry.lastColor = "";
    entry.scoreHistory = [];
    entry.recentResults = [];
  }

  const scoringCutoff = tournament.type === "arena" && isFinishedStatus(tournament.status) && tournament.endedAt
    ? new Date(tournament.endedAt).getTime()
    : Number.POSITIVE_INFINITY;

  for (const game of games.filter((item: any) => item.status === "completed" && new Date(item.endedAt || item.updatedAt || item.createdAt || 0).getTime() <= scoringCutoff)) {
    const white = map.get(game.whiteKey);
    const black = game.blackKey ? map.get(game.blackKey) : null;
    if (!white) continue;

    if (game.termination === "bye") {
      white.points += 1;
      white.wins += 1;
      white.byes += 1;
      white.gamesPlayed += 1;
      white.lastColor = "white";
      white.scoreHistory.push(1);
      white.streak = Math.max(1, white.streak + 1);
      continue;
    }

    if (!black) continue;
    const whiteRawScore = completedScore(game.result, game.whiteKey, game.whiteKey, game.blackKey);
    const blackRawScore = completedScore(game.result, game.blackKey, game.whiteKey, game.blackKey);
    const whiteScore = tournamentPoints(game, whiteRawScore, tournament, white, "white");
    const blackScore = tournamentPoints(game, blackRawScore, tournament, black, "black");
    white.points += whiteScore;
    black.points += blackScore;
    white.gamesPlayed += 1;
    black.gamesPlayed += 1;
    white.lastColor = "white";
    black.lastColor = "black";
    white.scoreHistory.push(whiteScore);
    black.scoreHistory.push(blackScore);
    white.recentResults = [...(white.recentResults || []), game.result === "1-0" ? "W" : game.result === "0-1" ? "L" : "D"].slice(-8);
    black.recentResults = [...(black.recentResults || []), game.result === "0-1" ? "W" : game.result === "1-0" ? "L" : "D"].slice(-8);
    if (whiteRawScore === 1) {
      white.wins += 1;
      black.losses += 1;
      white.streak = Math.max(1, white.streak + 1);
      black.streak = 0;
    } else if (blackRawScore === 1) {
      black.wins += 1;
      white.losses += 1;
      black.streak = Math.max(1, black.streak + 1);
      white.streak = 0;
    } else {
      white.draws += 1;
      black.draws += 1;
      white.streak = 0;
      black.streak = 0;
    }
  }

  for (const game of games.filter((item: any) => item.status === "completed" && item.blackKey && new Date(item.endedAt || item.updatedAt || item.createdAt || 0).getTime() <= scoringCutoff)) {
    const white = map.get(game.whiteKey);
    const black = map.get(game.blackKey);
    if (!white || !black) continue;
    white.buchholz += black.points;
    black.buchholz += white.points;
  }

  tournament.standings = Array.from(map.values()).sort((a: StandingEntry, b: StandingEntry) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return String(a.displayName || "").localeCompare(String(b.displayName || ""));
  });
  return tournament.standings;
}

function playerHasPlayed(before: Map<string, Set<string>>, a: string, b: string) {
  return before.get(a)?.has(b) || before.get(b)?.has(a) || false;
}

function pairingHistory(games: TournamentGameLike[]) {
  const map = new Map<string, Set<string>>();
  for (const game of games.filter((item) => ["completed", "active"].includes(item.status) && item.blackKey)) {
    if (!map.has(game.whiteKey)) map.set(game.whiteKey, new Set());
    if (!map.has(game.blackKey)) map.set(game.blackKey, new Set());
    map.get(game.whiteKey)!.add(game.blackKey);
    map.get(game.blackKey)!.add(game.whiteKey);
  }
  return map;
}

function consecutivePairingHistory(games: TournamentGameLike[]) {
  const sorted = [...games]
    .filter((item: any) => item.blackKey)
    .sort((a: any, b: any) => new Date(b.createdAt || b.startedAt || 0).getTime() - new Date(a.createdAt || a.startedAt || 0).getTime());
  const map = new Map<string, string>();
  for (const game of sorted) {
    if (!map.has(game.whiteKey)) map.set(game.whiteKey, game.blackKey);
    if (!map.has(game.blackKey)) map.set(game.blackKey, game.whiteKey);
  }
  return map;
}

function resolveColors(a: any, b: any) {
  if (a.lastColor === "white" && b.lastColor !== "white") return { white: b, black: a };
  if (b.lastColor === "white" && a.lastColor !== "white") return { white: a, black: b };
  if (a.lastColor === "black" && b.lastColor !== "black") return { white: a, black: b };
  if (b.lastColor === "black" && a.lastColor !== "black") return { white: b, black: a };
  return String(a.playerKey).localeCompare(String(b.playerKey)) <= 0 ? { white: a, black: b } : { white: b, black: a };
}

async function createGame(tournament: TournamentLike, input: {
  source: "swiss" | "arena";
  roundNumber: number;
  tableNumber: number;
  white: any;
  black?: any | null;
  bye?: boolean;
}) {
  const initialClockMs = Number(tournament.timeControlMinutes || 0) * 60 * 1000;
  const incrementMs = Number(tournament.incrementSeconds || 0) * 1000;
  const chess = tournament.startingPosition?.type === "custom" && tournament.startingPosition?.fen ? new Chess(tournament.startingPosition.fen) : new Chess();
  const fen = chess.fen();
  const game = await TournamentGame.create({
    tournament: tournament._id,
    source: input.source,
    roundNumber: input.roundNumber,
    tableNumber: input.tableNumber,
    whiteUser: input.white.user || undefined,
    blackUser: input.black?.user || undefined,
    whiteExternalUsername: input.white.externalUsername || undefined,
    blackExternalUsername: input.black?.externalUsername || undefined,
    whiteKey: input.white.playerKey,
    blackKey: input.black?.playerKey || "",
    whiteName: input.white.displayName,
    blackName: input.black?.displayName || "",
    whiteRating: Number(input.white.rating || 0),
    blackRating: Number(input.black?.rating || 0),
    fen,
    initialClockMs,
    incrementMs,
    whiteIncrementMs: incrementMs,
    blackIncrementMs: incrementMs,
    whiteClockMs: initialClockMs,
    blackClockMs: initialClockMs,
    turn: chess.turn(),
    status: input.bye ? "completed" : "active",
    result: input.bye ? "1-0" : "*",
    termination: input.bye ? "bye" : "ongoing",
    winnerKey: input.bye ? input.white.playerKey : "",
    firstMoveDeadlineAt: input.bye ? undefined : new Date(Date.now() + FIRST_MOVE_COUNTDOWN_MS),
    whiteOnlineAt: input.bye ? undefined : new Date(),
    blackOnlineAt: input.bye ? undefined : new Date(),
    endedAt: input.bye ? new Date() : undefined,
  });
  if (!input.bye) {
    await notifyTournamentUsers(tournament, {
      users: [objectId(input.white.user), objectId(input.black?.user)].filter(Boolean),
      type: "tournament.game_ready",
      title: "Tournament game ready",
      message: `Board ${input.tableNumber}: ${input.white.displayName} vs ${input.black?.displayName}.`,
      href: `/tournaments/${objectId(tournament)}/play`,
    });
  }
  return game;
}

export async function enforceTournamentGameTimeouts(tournament: TournamentLike) {
  const activeGames = await TournamentGame.find({ tournament: tournament._id, status: "active" });
  let changed = false;
  const now = new Date();
  for (const game of activeGames as any[]) {
    const clocks = estimateClock(game);
    const firstMoveExpired =
      !(game.moveHistorySAN || []).length &&
      game.firstMoveDeadlineAt &&
      new Date(game.firstMoveDeadlineAt).getTime() <= now.getTime();
    const turnOnlineAt = game.turn === "w" ? game.whiteOnlineAt : game.blackOnlineAt;
    const lastKnownOnlineAt = turnOnlineAt || game.lastMoveAt || game.startedAt;
    const disconnectedTooLong =
      (game.moveHistorySAN || []).length > 0 &&
      lastKnownOnlineAt &&
      new Date(lastKnownOnlineAt).getTime() + DISCONNECTION_GRACE_MS <= now.getTime();
    if (firstMoveExpired) {
      const whiteInactive = game.turn === "w";
      await completeGame(game, {
        result: whiteInactive ? "0-1" : "1-0",
        termination: "timeout",
        winnerKey: whiteInactive ? game.blackKey : game.whiteKey,
      });
      queueCompletedArenaPlayers(tournament, game);
      changed = true;
    } else if (disconnectedTooLong) {
      await completeGame(game, {
        result: game.turn === "w" ? "0-1" : "1-0",
        termination: "timeout",
        winnerKey: game.turn === "w" ? game.blackKey : game.whiteKey,
      });
      queueCompletedArenaPlayers(tournament, game);
      changed = true;
    } else if (clocks.whiteClockMs <= 0 || clocks.blackClockMs <= 0) {
      await completeGame(game, {
        result: clocks.whiteClockMs <= 0 ? "0-1" : "1-0",
        termination: "timeout",
        winnerKey: clocks.whiteClockMs <= 0 ? game.blackKey : game.whiteKey,
      });
      queueCompletedArenaPlayers(tournament, game);
      changed = true;
    }
  }
  if (changed) {
    await recalculateTournamentStandings(tournament);
  }
  return changed;
}

export async function generateSwissRound(tournament: TournamentLike) {
  await recalculateTournamentStandings(tournament);
  const allGames = await TournamentGame.find({ tournament: tournament._id }).lean();
  const activeRound = (tournament.roundsData || []).find((round: any) => round.status !== "completed");
  if (activeRound) throw new Error("Finish the current round before creating the next one.");

  const roundNumber = Number(tournament.currentRound || 0) + 1;
  const standings = [...(tournament.standings || [])];
  const history = pairingHistory(allGames);
  const pairings: any[] = [];
  const available = [...standings];

  if (available.length % 2 === 1) {
    const byeIndex = [...available].reverse().findIndex((entry: any) => Number(entry.byes || 0) === 0);
    const actualIndex = byeIndex === -1 ? available.length - 1 : available.length - 1 - byeIndex;
    const byePlayer = available.splice(actualIndex, 1)[0];
    const byeGame = await createGame(tournament, { source: "swiss", roundNumber, tableNumber: 1, white: byePlayer, bye: true });
    pairings.push({
      gameId: byeGame._id,
      tableNumber: 1,
      whiteKey: byePlayer.playerKey,
      blackKey: "",
      whiteName: byePlayer.displayName,
      blackName: "Bye",
      result: "1-0",
      status: "completed",
    });
  }

  let tableNumber = pairings.length + 1;
  while (available.length >= 2) {
    const first = available.shift();
    if (!first) break;
    let opponentIndex = available.findIndex((candidate: any) => !playerHasPlayed(history, first.playerKey, candidate.playerKey));
    if (opponentIndex === -1) opponentIndex = 0;
    const second = available.splice(opponentIndex, 1)[0];
    const colors = resolveColors(first, second);
    const game = await createGame(tournament, { source: "swiss", roundNumber, tableNumber, white: colors.white, black: colors.black });
    pairings.push({
      gameId: game._id,
      tableNumber,
      whiteKey: colors.white.playerKey,
      blackKey: colors.black.playerKey,
      whiteName: colors.white.displayName,
      blackName: colors.black.displayName,
      result: "*",
      status: "live",
    });
    tableNumber += 1;
  }

  tournament.currentRound = roundNumber;
  tournament.roundsData = [...(tournament.roundsData || []), { roundNumber, status: "live", startedAt: new Date(), pairings }];
  await tournament.save();
  await recalculateTournamentStandings(tournament);
  await tournament.save();
  return tournament;
}

export async function syncArenaPairings(tournament: TournamentLike) {
  const lockToken = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const lockUntil = new Date(Date.now() + 20_000);
  const lockResult = await Tournament.updateOne(
    {
      _id: tournament._id,
      $or: [
        { "pairingLock.expiresAt": { $exists: false } },
        { "pairingLock.expiresAt": { $lte: new Date() } },
        { "pairingLock.token": lockToken },
      ],
    },
    { $set: { pairingLock: { token: lockToken, expiresAt: lockUntil } } }
  );
  if (!lockResult.modifiedCount) return tournament;
  const locked = await Tournament.findById(tournament._id);
  if (locked) tournament = locked;
  normalizeParticipantStates(tournament);
  try {
    await enforceTournamentGameTimeouts(tournament);
    await recalculateTournamentStandings(tournament);
    if (tournament.pausedByAdmin) {
      tournament.pairingLock = undefined;
      await tournament.save();
      return tournament;
    }
    const now = new Date();
    if (!tournament.arenaEndsAt || new Date(tournament.arenaEndsAt).getTime() <= now.getTime()) {
      tournament.status = "finished";
      tournament.endedAt = now;
      await freezeTournamentResults(tournament);
      tournament.pairingLock = undefined;
      await tournament.save();
      return tournament;
    }

    const games = await TournamentGame.find({ tournament: tournament._id }).lean();
    const activePlayers = new Set(
      games
        .filter((game: any) => game.status === "active")
        .flatMap((game: any) => [game.whiteKey, game.blackKey].filter(Boolean))
    );
    const states = activeQueueStates(tournament);
    const history = pairingHistory(games);
    const recentOpponents = consecutivePairingHistory(games);
    const waiting = [...(tournament.standings || [])]
      .filter((entry: any) => {
        const state = states.get(entry.playerKey);
        return !activePlayers.has(entry.playerKey) && (!state || ["joined", "queued"].includes(state.status));
      })
      .sort((a: any, b: any) => {
        const aQueuedAt = new Date(states.get(a.playerKey)?.queuedAt || states.get(a.playerKey)?.joinedAt || 0).getTime();
        const bQueuedAt = new Date(states.get(b.playerKey)?.queuedAt || states.get(b.playerKey)?.joinedAt || 0).getTime();
        if (aQueuedAt !== bQueuedAt) return aQueuedAt - bQueuedAt;
        if (b.points !== a.points) return b.points - a.points;
        if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
        return String(a.displayName || "").localeCompare(String(b.displayName || ""));
      });

    let tableNumber = (await TournamentGame.countDocuments({ tournament: tournament._id })) + 1;
    while (waiting.length >= 2) {
      const first = waiting.shift();
      if (!first) break;
      let opponentIndex = waiting.findIndex((candidate: any) => recentOpponents.get(first.playerKey) !== candidate.playerKey);
      if (opponentIndex === -1) opponentIndex = waiting.findIndex((candidate: any) => !playerHasPlayed(history, first.playerKey, candidate.playerKey));
      if (opponentIndex === -1) opponentIndex = 0;
      const second = waiting.splice(opponentIndex, 1)[0];
      const colors = resolveColors(first, second);
      await createGame(tournament, { source: "arena", roundNumber: 0, tableNumber, white: colors.white, black: colors.black });
      setTournamentPlayerState(tournament, colors.white.playerKey, "playing");
      setTournamentPlayerState(tournament, colors.black.playerKey, "playing");
      tableNumber += 1;
    }
    tournament.pairingLock = undefined;
    await tournament.save();
    return tournament;
  } catch (error) {
    tournament.pairingLock = undefined;
    await tournament.save().catch(() => null);
    throw error;
  }
}

export async function syncSwissRoundState(tournament: TournamentLike) {
  if (tournament.type !== "swiss") return tournament;
  const rounds = Array.isArray(tournament.roundsData) ? tournament.roundsData : [];
  if (!rounds.length) return tournament;

  const games = await TournamentGame.find({ tournament: tournament._id }).lean();
  tournament.roundsData = rounds.map((round: any) => {
    const pairings = (round.pairings || []).map((pairing: any) => {
      const game = games.find((item: any) => String(item._id) === String(pairing.gameId));
      if (!game) return pairing;
      return {
        ...pairing,
        status: game.status === "completed" ? "completed" : game.status === "aborted" ? "aborted" : game.status === "active" ? "live" : pairing.status,
        result: game.result || pairing.result || "*",
      };
    });
    const allDone = pairings.length > 0 && pairings.every((pairing: any) => ["completed", "aborted"].includes(pairing.status));
    return {
      ...round,
      pairings,
      status: allDone ? "completed" : round.status || "live",
      endedAt: allDone ? round.endedAt || new Date() : round.endedAt,
    };
  });

  const completedRoundCount = tournament.roundsData.filter((round: any) => round.status === "completed").length;
  tournament.currentRound = Math.max(Number(tournament.currentRound || 0), completedRoundCount);
  return tournament;
}

export async function autoAdvanceSwissTournament(tournament: TournamentLike) {
  if (tournament.type !== "swiss" || !isPlayingStatus(tournament.status)) return tournament;
  await syncSwissRoundState(tournament);
  const rounds = Array.isArray(tournament.roundsData) ? tournament.roundsData : [];
  const activeRound = rounds.find((round: any) => round.status !== "completed");
  const totalRounds = Number(tournament.rounds || 0);
  if (activeRound || Number(tournament.currentRound || 0) >= totalRounds) return tournament;

  const lastRound = rounds
    .filter((round: any) => round.status === "completed")
    .sort((a: any, b: any) => Number(b.roundNumber || 0) - Number(a.roundNumber || 0))[0];
  const breakMs = Math.max(0, Number(tournament.breakBetweenRoundsMinutes || 0)) * 60 * 1000;
  const lastEndedAt = lastRound?.endedAt ? new Date(lastRound.endedAt).getTime() : Date.now();
  if (Date.now() - lastEndedAt < breakMs) return tournament;
  return generateSwissRound(tournament);
}

export async function startTournament(tournament: TournamentLike) {
  ensureTournamentStandings(tournament);
  normalizeParticipantStates(tournament);
  tournament.startedAt = new Date();
  tournament.status = "playing";
  tournament.pausedByAdmin = false;
  tournament.initialParticipantKeys = (tournament.standings || []).map((entry: any) => entry.playerKey);
  const alreadyNotified = (tournament.adminActions || []).some((action: any) => action.action === "notification.started");
  if (!alreadyNotified) {
    await notifyTournamentUsers(tournament, {
      type: "tournament.started",
      title: "Tournament started",
      message: `${tournament.name} has started. Your board will appear when you are paired.`,
      href: `/tournaments/${objectId(tournament)}`,
    });
    await notifyExternalTournamentParticipants(tournament, {
      subject: `Started: ${tournament.name}`,
      message: (participant) => `Hello ${participant.displayName || participant.username},\n\n${tournament.name} has started. Open your tournament link to enter the lobby.`,
    });
    tournament.adminActions = [...(tournament.adminActions || []), {
      action: "notification.started",
      note: "Tournament-start notification sent by server lifecycle.",
      createdAt: new Date(),
    }];
  }
  if (tournament.type === "arena") {
    tournament.arenaEndsAt = new Date(Date.now() + Number(tournament.arenaDurationMinutes || 0) * 60000);
    for (const standing of tournament.standings || []) {
      const state = participantStateMap(tournament).get(standing.playerKey);
      if (!state || state.status !== "paused") setTournamentPlayerState(tournament, standing.playerKey, "queued");
    }
    await tournament.save();
    await syncArenaPairings(tournament);
    await recalculateTournamentStandings(tournament);
    await tournament.save();
    return tournament;
  }
  await tournament.save();
  return generateSwissRound(tournament);
}

export async function finalizeTournamentIfComplete(tournament: TournamentLike) {
  if (tournament.type === "swiss" && Number(tournament.currentRound || 0) >= Number(tournament.rounds || 0)) {
    const current = (tournament.roundsData || []).find((round: any) => round.roundNumber === tournament.currentRound);
    if (current?.status === "completed") {
      tournament.status = "finished";
      tournament.endedAt = new Date();
      await recalculateTournamentStandings(tournament);
      await freezeTournamentResults(tournament);
      await tournament.save();
    }
  }
}

export async function freezeTournamentResults(tournament: TournamentLike) {
  await recalculateTournamentStandings(tournament);
  const games = await TournamentGame.find({ tournament: tournament._id }).lean();
  const standings = JSON.parse(JSON.stringify(tournament.standings || []));
  tournament.finalSnapshot = {
    standings,
    podium: standings.slice(0, 3),
    totalGames: games.length,
    completedGames: games.filter((game: any) => game.status === "completed").length,
    generatedAt: new Date(),
  };
  const alreadyCompletedNotified = (tournament.adminActions || []).some((action: any) => action.action === "notification.completed");
  if (!alreadyCompletedNotified) {
    await notifyTournamentUsers(tournament, {
      type: "tournament.completed",
      title: "Tournament completed",
      message: `${tournament.name} has completed. Final standings are available.`,
      href: `/tournaments/${objectId(tournament)}`,
    });
    await notifyExternalTournamentParticipants(tournament, {
      subject: `Completed: ${tournament.name}`,
      message: (participant) => `Hello ${participant.displayName || participant.username},\n\n${tournament.name} has completed. Final standings are available from your tournament link.`,
    });
    tournament.adminActions = [...(tournament.adminActions || []), {
      action: "notification.completed",
      note: "Tournament completion notification sent by server lifecycle.",
      createdAt: new Date(),
    }];
  }
  const alreadyNotified = (tournament.adminActions || []).some((action: any) => action.action === "notification.final_placements");
  if (!alreadyNotified && standings.length) {
    await Promise.all(standings.map((entry: any, index: number) => {
      if (!entry.user) return null;
      return notifyTournamentUsers(tournament, {
        users: [objectId(entry.user)],
        type: "tournament.final_placement",
        title: "Final tournament placement",
        message: `You finished #${index + 1} in ${tournament.name} with ${entry.points} points.`,
        href: `/tournaments/${objectId(tournament)}`,
      });
    }));
    await Promise.all((tournament.externalParticipants || []).map((participant: any) => {
      const playerKey = playerKeyForExternal(participant.username);
      const index = standings.findIndex((entry: any) => entry.playerKey === playerKey);
      if (index < 0) return null;
      const entry = standings[index];
      return notifyExternalTournamentParticipant({
        email: participant.email,
        name: participant.displayName || participant.username,
        tournamentName: tournament.name,
        subject: `Final result: ${tournament.name}`,
        message: `Hello ${participant.displayName || participant.username},\n\nYou finished #${index + 1} in ${tournament.name} with ${entry.points} points.`,
        href: `/tournament-join/${tournament.externalInvite?.token || ""}/play`,
        tournamentId: objectId(tournament),
      });
    }));
    tournament.adminActions = [...(tournament.adminActions || []), {
      action: "notification.final_placements",
      note: "Final placement notifications sent.",
      createdAt: new Date(),
    }];
  }
  return tournament.finalSnapshot;
}

export async function applyGameMove(game: TournamentGameLike, move: { from: string; to: string; promotion?: string }) {
  const chess = new Chess(game.fen === "start" ? undefined : game.fen);
  const clocks = estimateClock(game);
  const elapsed = Math.max(0, Date.now() - new Date(game.lastMoveAt || game.startedAt || Date.now()).getTime());
  if (game.turn === "w" && clocks.whiteClockMs <= 0) throw new Error("White ran out of time.");
  if (game.turn === "b" && clocks.blackClockMs <= 0) throw new Error("Black ran out of time.");

  const result = chess.move(move);
  if (!result) throw new Error("Illegal move.");
  if (game.turn === "w") {
    const incrementMs = Number(game.whiteIncrementMs ?? game.incrementMs ?? 0);
    game.whiteClockMs = Math.max(0, game.whiteClockMs - elapsed + incrementMs);
  } else {
    const incrementMs = Number(game.blackIncrementMs ?? game.incrementMs ?? 0);
    game.blackClockMs = Math.max(0, game.blackClockMs - elapsed + incrementMs);
  }
  game.fen = chess.fen();
  game.turn = chess.turn();
  game.moveHistorySAN = [...(game.moveHistorySAN || []), result.san];
  game.moveHistoryUCI = [...(game.moveHistoryUCI || []), `${result.from}${result.to}${result.promotion || ""}`];
  game.lastMoveAt = new Date();
  game.firstMoveDeadlineAt = undefined;
  game.drawOfferBy = "";
  game.pgn = chess.pgn();

  const finished = resultFromChess(chess);
  if (finished) {
    game.status = "completed";
    game.result = finished.result;
    game.termination = finished.termination;
    game.winnerKey = finished.winnerColor === "white" ? game.whiteKey : finished.winnerColor === "black" ? game.blackKey : "";
    game.endedAt = new Date();
  }
  await game.save();
  return game;
}

export async function completeGame(game: TournamentGameLike, input: { result: "1-0" | "0-1" | "1/2-1/2"; termination: any; winnerKey?: string }) {
  if (game.status === "completed") return game;
  game.status = "completed";
  game.result = input.result;
  game.termination = input.termination;
  game.winnerKey = input.winnerKey || "";
  game.endedAt = new Date();
  game.drawOfferBy = "";
  await game.save();
  return game;
}

export function queueCompletedArenaPlayers(tournament: TournamentLike, game: TournamentGameLike) {
  if (tournament.type !== "arena") return;
  const arenaExpired = tournament.arenaEndsAt && new Date(tournament.arenaEndsAt).getTime() <= Date.now();
  if (arenaExpired) return;
  for (const playerKey of [game.whiteKey, game.blackKey].filter(Boolean)) {
    const state = participantStateMap(tournament).get(playerKey);
    if (!state || state.status === "playing" || state.status === "joined") {
      setTournamentPlayerState(tournament, playerKey, "queued");
    }
  }
}
