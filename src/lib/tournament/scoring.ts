/**
 * Tournament scoring and standings.
 *
 * Pure functions over plain records: no mongoose, no I/O. This is the single
 * source of truth for points, so the standings table, a player's game list and
 * any report can never disagree.
 *
 * Rules versions
 * --------------
 * v1 is the behaviour that shipped before this rebuild. It is preserved exactly
 * so tournaments created under it keep scoring the way their players were told
 * they would.
 *
 * v2 is the corrected, Lichess-compatible ruleset used by new tournaments:
 *   - a streak is established by two wins and doubles from the *third* game
 *   - while on a streak, draws double too
 *   - a berserk win only pays its bonus once the game reaches a real length
 *   - a bye is a bye, not a win
 *   - Swiss ties break on Sonneborn-Berger rather than Buchholz
 */

export type RulesVersion = 1 | 2;
export const CURRENT_RULES_VERSION: RulesVersion = 2;

export const DEFAULT_BERSERK_MIN_PLIES = 7;

export type GameResult = "*" | "1-0" | "0-1" | "1/2-1/2";

export type ScoredGame = {
  id: string;
  source: "arena" | "swiss";
  status: string;
  result: GameResult;
  termination: string;
  whiteKey: string;
  blackKey: string;
  plyCount: number;
  berserkWhite?: boolean;
  berserkBlack?: boolean;
  /** Epoch milliseconds. Completion order drives streaks, so this matters. */
  endedAt: number;
};

export type ScoringPlayer = {
  playerKey: string;
  user?: string;
  externalUsername?: string;
  displayName: string;
  rating?: number;
};

export type ScoringOptions = {
  rulesVersion: RulesVersion;
  type: "arena" | "swiss";
  arenaStreaks: boolean;
  earlyDrawMoveLimit: number;
  drawStreakLimit: number;
  berserkMinPlies: number;
  /** Games completing after this instant do not score. Infinity while open. */
  scoringCutoff: number;
};

export type StandingEntry = {
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
  sonnebornBerger: number;
  streak: number;
  /**
   * Whether this player's *next* game scores double. A rule, not a display
   * detail, so it is decided here rather than re-derived by each client.
   */
  onStreak: boolean;
  lastColor: string;
  scoreHistory: number[];
  recentResults: string[];
};

/**
 * Which tie-break a tournament actually uses, and what to call it.
 *
 * Named rather than implied: standings that sort by a hidden criterion are
 * impossible for a player to argue with. Legacy events keep Buchholz because
 * that is what they were played under.
 */
export function tieBreakFor(tournament: any): { key: "sonnebornBerger" | "buchholz"; label: string } | null {
  if (tournament?.type === "arena") return null;
  const rulesVersion = Number(tournament?.rulesVersion || 1);
  return rulesVersion >= 2
    ? { key: "sonnebornBerger", label: "Sonneborn-Berger" }
    : { key: "buchholz", label: "Buchholz" };
}

export function defaultScoringOptions(tournament: any): ScoringOptions {
  const rulesVersion: RulesVersion = Number(tournament?.rulesVersion || 1) >= 2 ? 2 : 1;
  return {
    rulesVersion,
    type: tournament?.type === "arena" ? "arena" : "swiss",
    arenaStreaks: tournament?.arenaStreaks !== false,
    earlyDrawMoveLimit: Math.max(0, Number(tournament?.earlyDrawMoveLimit ?? 10)),
    drawStreakLimit: Math.max(0, Number(tournament?.drawStreakLimit ?? 2)),
    berserkMinPlies: Math.max(0, Number(tournament?.berserkMinPlies ?? DEFAULT_BERSERK_MIN_PLIES)),
    scoringCutoff: Number.POSITIVE_INFINITY,
  };
}

/** Raw chess score for a player: 1, 0.5 or 0. */
export function rawScore(result: GameResult, playerKey: string, whiteKey: string, blackKey: string) {
  if (result === "1-0") return playerKey === whiteKey ? 1 : 0;
  if (result === "0-1") return playerKey === blackKey ? 1 : 0;
  if (result === "1/2-1/2") return 0.5;
  return 0;
}

/** Trailing run of draws in a result history, used by the anti-abuse rule. */
function trailingDraws(results: string[]) {
  let count = 0;
  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (results[index] !== "D") break;
    count += 1;
  }
  return count;
}

function drawIsDevalued(game: ScoredGame, priorResults: string[], options: ScoringOptions) {
  const { earlyDrawMoveLimit, drawStreakLimit } = options;
  if (earlyDrawMoveLimit > 0 && game.plyCount > 0 && game.plyCount < earlyDrawMoveLimit) return true;
  if (drawStreakLimit > 0 && trailingDraws(priorResults) >= drawStreakLimit) return true;
  return false;
}

/**
 * A player is "on fire" once their two most recent completed games were both
 * wins. The two establishing wins score normally; everything after doubles.
 */
export function isOnStreak(priorResults: string[]) {
  return priorResults.length >= 2 && priorResults[priorResults.length - 1] === "W" && priorResults[priorResults.length - 2] === "W";
}

export type ArenaScoreInput = {
  game: ScoredGame;
  playerKey: string;
  /** Completed results for this player before this game, oldest first. */
  priorResults: string[];
  /** Legacy running streak counter, only consulted by rules v1. */
  legacyStreak: number;
  options: ScoringOptions;
};

/**
 * Arena points for one player in one game. The single implementation — the
 * standings table and the per-player game list both call this.
 */
export function scoreArenaGame({ game, playerKey, priorResults, legacyStreak, options }: ArenaScoreInput) {
  const score = rawScore(game.result, playerKey, game.whiteKey, game.blackKey);
  const isWhite = game.whiteKey === playerKey;
  const berserked = Boolean(isWhite ? game.berserkWhite : game.berserkBlack);

  if (score === 0.5 && drawIsDevalued(game, priorResults, options)) return 0;

  if (options.rulesVersion === 1) {
    if (score === 1) {
      const streakBonus = options.arenaStreaks && legacyStreak >= 1 ? 2 : 0;
      return 2 + streakBonus + (berserked ? 1 : 0);
    }
    return score === 0.5 ? 1 : 0;
  }

  const base = score === 1 ? 2 : score === 0.5 ? 1 : 0;
  const multiplier = options.arenaStreaks && isOnStreak(priorResults) ? 2 : 1;
  const berserkBonus = score === 1 && berserked && game.plyCount >= options.berserkMinPlies ? 1 : 0;
  return base * multiplier + berserkBonus;
}

/** Tournament points for one player in one game, for either format. */
export function scoreGame(input: ArenaScoreInput) {
  if (input.game.source !== "arena") return rawScore(input.game.result, input.playerKey, input.game.whiteKey, input.game.blackKey);
  return scoreArenaGame(input);
}

function emptyEntry(player: ScoringPlayer): StandingEntry {
  return {
    playerKey: player.playerKey,
    user: player.user || undefined,
    externalUsername: player.externalUsername || undefined,
    displayName: player.displayName,
    rating: Number(player.rating || 0),
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    byes: 0,
    gamesPlayed: 0,
    buchholz: 0,
    sonnebornBerger: 0,
    streak: 0,
    onStreak: false,
    lastColor: "",
    scoreHistory: [],
    recentResults: [],
  };
}

export function sortStandings(entries: StandingEntry[], options: ScoringOptions) {
  const byName = (a: StandingEntry, b: StandingEntry) => String(a.displayName || "").localeCompare(String(b.displayName || ""));
  return [...entries].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (options.rulesVersion === 1) {
      if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return byName(a, b);
    }
    if (options.type === "swiss") {
      if (b.sonnebornBerger !== a.sonnebornBerger) return b.sonnebornBerger - a.sonnebornBerger;
      if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return byName(a, b);
    }
    // Arena has no opponent-strength tie-break; reaching the same score in
    // fewer games is the better performance.
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
    return byName(a, b);
  });
}

/**
 * Rebuild standings from scratch. This is the reconciliation path: correct by
 * construction, safe to re-run, and the thing incremental updates are checked
 * against. It is not on the per-move hot path.
 */
export function computeStandings(players: ScoringPlayer[], games: ScoredGame[], options: ScoringOptions): StandingEntry[] {
  const entries = new Map<string, StandingEntry>(players.map((player) => [player.playerKey, emptyEntry(player)]));
  const opponents = new Map<string, Array<{ key: string; score: number }>>(players.map((player) => [player.playerKey, []]));

  const scored = games
    .filter((game) => game.status === "completed" && game.result !== "*" && game.endedAt <= options.scoringCutoff)
    .sort((a, b) => (a.endedAt !== b.endedAt ? a.endedAt - b.endedAt : String(a.id).localeCompare(String(b.id))));

  for (const game of scored) {
    const white = entries.get(game.whiteKey);
    if (!white) continue;

    if (game.termination === "bye") {
      white.points += 1;
      white.byes += 1;
      white.scoreHistory.push(1);
      if (options.rulesVersion === 1) {
        white.wins += 1;
        white.gamesPlayed += 1;
        white.lastColor = "white";
        white.streak = Math.max(1, white.streak + 1);
      }
      continue;
    }

    const black = game.blackKey ? entries.get(game.blackKey) : null;
    if (!black) continue;

    const whiteRaw = rawScore(game.result, game.whiteKey, game.whiteKey, game.blackKey);
    const blackRaw = rawScore(game.result, game.blackKey, game.whiteKey, game.blackKey);

    const whitePoints = scoreGame({
      game,
      playerKey: game.whiteKey,
      priorResults: white.recentResults,
      legacyStreak: white.streak,
      options,
    });
    const blackPoints = scoreGame({
      game,
      playerKey: game.blackKey,
      priorResults: black.recentResults,
      legacyStreak: black.streak,
      options,
    });

    white.points += whitePoints;
    black.points += blackPoints;
    white.gamesPlayed += 1;
    black.gamesPlayed += 1;
    white.lastColor = "white";
    black.lastColor = "black";
    white.scoreHistory.push(whitePoints);
    black.scoreHistory.push(blackPoints);
    white.recentResults.push(whiteRaw === 1 ? "W" : whiteRaw === 0.5 ? "D" : "L");
    black.recentResults.push(blackRaw === 1 ? "W" : blackRaw === 0.5 ? "D" : "L");
    opponents.get(game.whiteKey)!.push({ key: game.blackKey, score: whiteRaw });
    opponents.get(game.blackKey)!.push({ key: game.whiteKey, score: blackRaw });

    if (whiteRaw === 1) {
      white.wins += 1;
      black.losses += 1;
      white.streak = Math.max(1, white.streak + 1);
      black.streak = 0;
    } else if (blackRaw === 1) {
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

  for (const entry of Array.from(entries.values())) {
    entry.onStreak = options.type === "arena" && options.arenaStreaks && options.rulesVersion === 2 && isOnStreak(entry.recentResults);
    for (const opponent of opponents.get(entry.playerKey) || []) {
      const other = entries.get(opponent.key);
      if (!other) continue;
      entry.buchholz += other.points;
      entry.sonnebornBerger += other.points * opponent.score;
    }
    // Displayed history stays bounded; scoring always uses the full list above.
    entry.recentResults = entry.recentResults.slice(-8);
  }

  return sortStandings(Array.from(entries.values()), options);
}
