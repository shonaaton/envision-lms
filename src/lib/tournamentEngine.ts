import { Chess } from "chess.js";
import { TournamentGame } from "@/models/TournamentGame";

export type TournamentLike = any;
export type TournamentGameLike = any;

type TournamentPlayer = {
  key: string;
  userId?: string;
  externalUsername?: string;
  name: string;
};

type StandingEntry = {
  playerKey: string;
  user?: string;
  externalUsername?: string;
  displayName: string;
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
};

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

export function playerKeyForUser(userId: string) {
  return `user:${userId}`;
}

export function playerKeyForExternal(username: string) {
  return `external:${String(username).trim().toLowerCase()}`;
}

export function getTournamentPlayers(tournament: TournamentLike): TournamentPlayer[] {
  const internal = (tournament.participants || []).map((item: any) => ({
    key: playerKeyForUser(objectId(item)),
    userId: objectId(item),
    name: item.name || item.username || "Student",
  }));
  const external = (tournament.externalParticipants || []).map((item: any) => ({
    key: playerKeyForExternal(item.username),
    externalUsername: item.username,
    name: item.username,
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
  }));
  return tournament.standings;
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
  const games = await TournamentGame.find({ tournament: tournament._id }).lean();
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
  }

  for (const game of games.filter((item: any) => item.status === "completed")) {
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
    const whiteScore = completedScore(game.result, game.whiteKey, game.whiteKey, game.blackKey);
    const blackScore = completedScore(game.result, game.blackKey, game.whiteKey, game.blackKey);
    white.points += whiteScore;
    black.points += blackScore;
    white.gamesPlayed += 1;
    black.gamesPlayed += 1;
    white.lastColor = "white";
    black.lastColor = "black";
    white.scoreHistory.push(whiteScore);
    black.scoreHistory.push(blackScore);
    if (whiteScore === 1) {
      white.wins += 1;
      black.losses += 1;
      white.streak = Math.max(1, white.streak + 1);
      black.streak = 0;
    } else if (blackScore === 1) {
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

  for (const game of games.filter((item: any) => item.status === "completed" && item.blackKey)) {
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
  for (const game of games.filter((item) => item.status === "completed" && item.blackKey)) {
    if (!map.has(game.whiteKey)) map.set(game.whiteKey, new Set());
    if (!map.has(game.blackKey)) map.set(game.blackKey, new Set());
    map.get(game.whiteKey)!.add(game.blackKey);
    map.get(game.blackKey)!.add(game.whiteKey);
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
  const fen = tournament.startingPosition?.type === "custom" && tournament.startingPosition?.fen ? tournament.startingPosition.fen : new Chess().fen();
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
    fen,
    initialClockMs,
    incrementMs,
    whiteClockMs: initialClockMs,
    blackClockMs: initialClockMs,
    turn: "w",
    status: input.bye ? "completed" : "active",
    result: input.bye ? "1-0" : "*",
    termination: input.bye ? "bye" : "ongoing",
    winnerKey: input.bye ? input.white.playerKey : "",
    endedAt: input.bye ? new Date() : undefined,
  });
  return game;
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
  await recalculateTournamentStandings(tournament);
  const now = new Date();
  if (!tournament.arenaEndsAt || new Date(tournament.arenaEndsAt).getTime() <= now.getTime()) {
    tournament.status = "completed";
    tournament.endedAt = now;
    await tournament.save();
    return tournament;
  }

  const games = await TournamentGame.find({ tournament: tournament._id }).lean();
  const activePlayers = new Set(
    games
      .filter((game: any) => game.status === "active")
      .flatMap((game: any) => [game.whiteKey, game.blackKey].filter(Boolean))
  );
  const history = pairingHistory(games);
  const waiting = [...(tournament.standings || [])]
    .filter((entry: any) => !activePlayers.has(entry.playerKey))
    .sort((a: any, b: any) => {
      if (b.points !== a.points) return b.points - a.points;
      if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
      return String(a.displayName || "").localeCompare(String(b.displayName || ""));
    });

  let tableNumber = (await TournamentGame.countDocuments({ tournament: tournament._id })) + 1;
  while (waiting.length >= 2) {
    const first = waiting.shift();
    if (!first) break;
    let opponentIndex = waiting.findIndex((candidate: any) => !playerHasPlayed(history, first.playerKey, candidate.playerKey));
    if (opponentIndex === -1) opponentIndex = 0;
    const second = waiting.splice(opponentIndex, 1)[0];
    const colors = resolveColors(first, second);
    await createGame(tournament, { source: "arena", roundNumber: 0, tableNumber, white: colors.white, black: colors.black });
    tableNumber += 1;
  }
  return tournament;
}

export async function startTournament(tournament: TournamentLike) {
  ensureTournamentStandings(tournament);
  tournament.startedAt = new Date();
  tournament.status = "live";
  if (tournament.type === "arena") {
    tournament.arenaEndsAt = new Date(Date.now() + Number(tournament.arenaDurationMinutes || 0) * 60000);
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
      tournament.status = "completed";
      tournament.endedAt = new Date();
      await recalculateTournamentStandings(tournament);
      await tournament.save();
    }
  }
}

export async function applyGameMove(game: TournamentGameLike, move: { from: string; to: string; promotion?: string }) {
  const chess = new Chess(game.fen === "start" ? undefined : game.fen);
  const clocks = estimateClock(game);
  const elapsed = Math.max(0, Date.now() - new Date(game.lastMoveAt || game.startedAt || Date.now()).getTime());
  if (game.turn === "w" && clocks.whiteClockMs <= 0) throw new Error("White ran out of time.");
  if (game.turn === "b" && clocks.blackClockMs <= 0) throw new Error("Black ran out of time.");

  const result = chess.move(move);
  if (!result) throw new Error("Illegal move.");
  const incrementMs = Number(game.incrementMs || 0);
  if (game.turn === "w") {
    game.whiteClockMs = Math.max(0, game.whiteClockMs - elapsed + incrementMs);
  } else {
    game.blackClockMs = Math.max(0, game.blackClockMs - elapsed + incrementMs);
  }
  game.fen = chess.fen();
  game.turn = chess.turn();
  game.moveHistorySAN = [...(game.moveHistorySAN || []), result.san];
  game.moveHistoryUCI = [...(game.moveHistoryUCI || []), `${result.from}${result.to}${result.promotion || ""}`];
  game.lastMoveAt = new Date();
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
  game.status = "completed";
  game.result = input.result;
  game.termination = input.termination;
  game.winnerKey = input.winnerKey || "";
  game.endedAt = new Date();
  await game.save();
  return game;
}
