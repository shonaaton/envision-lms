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
 *
 * v3 is v2 plus FIDE's treatment of unplayed rounds in Swiss tie-breaks:
 *   - a bye or a forfeit is scored, but it is not a game against anyone, so it
 *     counts in Buchholz and Sonneborn-Berger as a game against a dummy
 *     opponent on the player's own score rather than as a zero
 *   - the forfeit loser is not credited with the no-show opponent either
 *
 * v4 is Lichess, ported from lila (modules/tournament ArenaSheet.scala and
 * Pairing.scala, modules/swiss SwissSheet.scala and SwissScoring.scala):
 *   - Arena: a draw in under 20 plies scores 0; a draw scores 0 when the
 *     player's last non-loss result was a draw (a loss does not break the
 *     streak, only a win does), unless the game reached 60 plies; berserk pays
 *     only from 14 plies; two wins in a row double everything after, draws too
 *   - Arena ties break on tournament performance (opponent rating +/- 500)
 *   - Swiss: a player who joined after round 1 has 0.5 for missing it ("Late");
 *     ties break on Sonneborn-Berger, then performance
 *   - the tournament's own early-draw, draw-streak and berserk settings are not
 *     used: Lichess's numbers are fixed
 */

export type RulesVersion = 1 | 2 | 3 | 4;
export const CURRENT_RULES_VERSION: RulesVersion = 4;

/** Parse a stored rules version, defaulting absent values to the legacy rules. */
export function normalizeRulesVersion(value: any): RulesVersion {
  const version = Number(value || 1);
  if (version >= 4) return 4;
  if (version >= 3) return 3;
  return version >= 2 ? 2 : 1;
}

/** A Swiss game one side won because the other never started it. */
export const FORFEIT_TERMINATION = "forfeit";

export const DEFAULT_BERSERK_MIN_PLIES = 7;

/* Lichess thresholds (v4); see lichessRules.ts. Inlined to keep this module free of imports. */
const QUICK_DRAW_PLIES = 20;
const LONG_GAME_PLIES = 60;
const BERSERK_VALID_PLIES = 14;
const PERFORMANCE_STEP = 500;
const UNRATED = 1500;

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
  /** Ratings the players had when the game was paired, for tournament performance. */
  whiteRating?: number;
  blackRating?: number;
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
  /** Swiss v4: players who joined after round 1 started, owed Lichess's "Late" half point. */
  lateJoiners?: Set<string>;
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
  /** Lichess tournament performance (v4); 0 before the first game. */
  performance: number;
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
export function tieBreakFor(tournament: any): { key: "sonnebornBerger" | "buchholz" | "performance"; label: string } | null {
  const rulesVersion = Number(tournament?.rulesVersion || 1);
  if (tournament?.type === "arena") return rulesVersion >= 4 ? { key: "performance", label: "tournament performance" } : null;
  return rulesVersion >= 2
    ? { key: "sonnebornBerger", label: "Sonneborn-Berger" }
    : { key: "buchholz", label: "Buchholz" };
}

export function defaultScoringOptions(tournament: any): ScoringOptions {
  const rulesVersion = normalizeRulesVersion(tournament?.rulesVersion);
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

  if (options.rulesVersion >= 4) return scoreLichessArenaGame(score, berserked, game.plyCount, priorResults, options.arenaStreaks);

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

/**
 * lila ArenaSheet.isDrawStreak: walking back from the latest result, a draw
 * means yes, a win means no, and a loss is skipped.
 */
export function isLichessDrawStreak(priorResults: string[]) {
  for (let index = priorResults.length - 1; index >= 0; index -= 1) {
    if (priorResults[index] === "D") return true;
    if (priorResults[index] === "W") return false;
  }
  return false;
}

/** lila ArenaSheet.addResult + Score.value, for standard chess. */
export function scoreLichessArenaGame(score: number, berserked: boolean, plyCount: number, priorResults: string[], streakable: boolean) {
  const onFire = isOnStreak(priorResults);
  if (score === 0.5) {
    if (plyCount < QUICK_DRAW_PLIES) return 0;
    if (streakable && onFire) return 2;
    if (plyCount < LONG_GAME_PLIES && isLichessDrawStreak(priorResults)) return 0;
    return 1;
  }
  if (score === 1) {
    const base = streakable && onFire ? 4 : 2;
    return base + (berserked && plyCount >= BERSERK_VALID_PLIES ? 1 : 0);
  }
  return 0;
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
    performance: 0,
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
    if (options.rulesVersion >= 4) {
      // lila: Swiss sorts on points, tie-break, performance; Arena on
      // score * 10000 + (performance or rating).
      if (options.type === "swiss" && b.sonnebornBerger !== a.sonnebornBerger) return b.sonnebornBerger - a.sonnebornBerger;
      const perfA = a.performance || a.rating || UNRATED;
      const perfB = b.performance || b.rating || UNRATED;
      if (perfB !== perfA) return perfB - perfA;
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
  // Rounds a player was scored for without playing anyone: byes and forfeits.
  const unplayed = new Map<string, number[]>(players.map((player) => [player.playerKey, []]));
  const dummyOpponents = options.rulesVersion >= 3 && options.type === "swiss";
  // Lichess performance: the mean over played games of opponent rating +500 / -500 / +0.
  const performanceSums = new Map<string, { sum: number; games: number }>();
  const addPerformance = (key: string, opponentRating: number | undefined, score: number) => {
    const rating = Number(opponentRating || 0) > 0 ? Number(opponentRating) : UNRATED;
    const current = performanceSums.get(key) || { sum: 0, games: 0 };
    current.sum += rating + (score === 1 ? PERFORMANCE_STEP : score === 0 ? -PERFORMANCE_STEP : 0);
    current.games += 1;
    performanceSums.set(key, current);
  };

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
      unplayed.get(game.whiteKey)!.push(1);
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
    // lila counts every finished pairing, a no-start forfeit included.
    addPerformance(game.whiteKey, game.blackRating, whiteRaw);
    addPerformance(game.blackKey, game.whiteRating, blackRaw);
    white.recentResults.push(whiteRaw === 1 ? "W" : whiteRaw === 0.5 ? "D" : "L");
    black.recentResults.push(blackRaw === 1 ? "W" : blackRaw === 0.5 ? "D" : "L");
    if (dummyOpponents && game.termination === FORFEIT_TERMINATION) {
      unplayed.get(game.whiteKey)!.push(whiteRaw);
      unplayed.get(game.blackKey)!.push(blackRaw);
    } else {
      opponents.get(game.whiteKey)!.push({ key: game.blackKey, score: whiteRaw });
      opponents.get(game.blackKey)!.push({ key: game.whiteKey, score: blackRaw });
    }

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

  if (options.rulesVersion >= 4 && options.type === "swiss") {
    // lila SwissSheet: a player with no pairing in round 1 is "Late", worth a
    // draw. Missed rounds after that are simply absent (0).
    for (const key of Array.from(options.lateJoiners || [])) {
      const entry = entries.get(key);
      if (!entry) continue;
      entry.points += 0.5;
      entry.scoreHistory.unshift(0.5);
    }
  }

  for (const entry of Array.from(entries.values())) {
    const perf = performanceSums.get(entry.playerKey);
    entry.performance = options.rulesVersion >= 4 && perf?.games ? Math.round(perf.sum / perf.games) : 0;
    entry.onStreak = options.type === "arena" && options.arenaStreaks && options.rulesVersion >= 2 && isOnStreak(entry.recentResults);
    for (const opponent of opponents.get(entry.playerKey) || []) {
      const other = entries.get(opponent.key);
      if (!other) continue;
      entry.buchholz += other.points;
      entry.sonnebornBerger += other.points * opponent.score;
    }
    if (dummyOpponents) {
      // FIDE's dummy opponent: an unplayed round is valued as a game against
      // someone on the player's own final score.
      for (const scored of unplayed.get(entry.playerKey) || []) {
        entry.buchholz += entry.points;
        entry.sonnebornBerger += entry.points * scored;
      }
    }
    // Displayed history stays bounded; scoring always uses the full list above.
    entry.recentResults = entry.recentResults.slice(-8);
  }

  return sortStandings(Array.from(entries.values()), options);
}
