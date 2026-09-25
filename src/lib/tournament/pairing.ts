/**
 * Pairing decisions, as pure functions.
 *
 * The database work — who is free, writing the games — stays in the engine.
 * What decides *who plays whom* lives here so it can be tested directly, which
 * is the part that has to be right.
 */

export type PairingCandidate = {
  playerKey: string;
  displayName: string;
  points: number;
  gamesPlayed: number;
  lastColor: string;
  /** How long this player has been waiting, in milliseconds. */
  waitingMs: number;
};

export type GameEdge = { whiteKey: string; blackKey: string; status: string; createdAt?: any; startedAt?: any };

/** Every pair that has already met, in either colour. */
export function pairingHistory(games: GameEdge[]) {
  const map = new Map<string, Set<string>>();
  for (const game of games) {
    if (!game.blackKey || !["completed", "active"].includes(game.status)) continue;
    if (!map.has(game.whiteKey)) map.set(game.whiteKey, new Set());
    if (!map.has(game.blackKey)) map.set(game.blackKey, new Set());
    map.get(game.whiteKey)!.add(game.blackKey);
    map.get(game.blackKey)!.add(game.whiteKey);
  }
  return map;
}

export function hasMet(history: Map<string, Set<string>>, a: string, b: string) {
  return history.get(a)?.has(b) || history.get(b)?.has(a) || false;
}

/** Each player's most recent opponent, for avoiding an instant rematch. */
export function mostRecentOpponents(games: GameEdge[]) {
  const sorted = [...games]
    .filter((game) => game.blackKey)
    .sort((a, b) => new Date(b.createdAt || b.startedAt || 0).getTime() - new Date(a.createdAt || a.startedAt || 0).getTime());
  const map = new Map<string, string>();
  for (const game of sorted) {
    if (!map.has(game.whiteKey)) map.set(game.whiteKey, game.blackKey);
    if (!map.has(game.blackKey)) map.set(game.blackKey, game.whiteKey);
  }
  return map;
}

/** Whoever is more owed White gets it; ties break deterministically by key. */
export function resolveColors<T extends { playerKey: string; lastColor?: string }>(a: T, b: T) {
  if (a.lastColor === "white" && b.lastColor !== "white") return { white: b, black: a };
  if (b.lastColor === "white" && a.lastColor !== "white") return { white: a, black: b };
  if (a.lastColor === "black" && b.lastColor !== "black") return { white: a, black: b };
  if (b.lastColor === "black" && a.lastColor !== "black") return { white: b, black: a };
  return String(a.playerKey).localeCompare(String(b.playerKey)) <= 0 ? { white: a, black: b } : { white: b, black: a };
}

export const REMATCH_PENALTY = 100;
export const REPEAT_PENALTY = 20;
export const SAME_COLOUR_PENALTY = 1;
/** Past this much waiting, score proximity stops constraining the pairing. */
export const PROXIMITY_RELAX_MS = 30_000;
/**
 * How long two players who just played each other wait for someone else before
 * being paired again. Pairing runs the instant a board ends, when those two are
 * usually the only players free, so without this hold nine arena pairings in
 * ten were immediate rematches and the field locked into fixed pairs. Measured
 * in simulation, 40 s takes a 12-player arena from 93% rematches to about 12%
 * while keeping 95% of waits under ~45 s; longer holds cost more waiting than
 * they save.
 */
export const REMATCH_HOLD_MS = 40_000;

export type ArenaPairingContext = {
  history: Map<string, Set<string>>;
  recent: Map<string, string>;
  /**
   * Players currently in a game, who will be free again soon. When nobody else
   * can ever become free, holding back a rematch only makes both players wait
   * for nothing, so the hold is skipped.
   */
  playing?: number;
  rematchHoldMs?: number;
};

/** Whether pairing these two now would be an immediate rematch worth holding back. */
export function rematchHeld(a: PairingCandidate, b: PairingCandidate, waiting: number, context: ArenaPairingContext) {
  const isRematch = context.recent.get(a.playerKey) === b.playerKey || context.recent.get(b.playerKey) === a.playerKey;
  if (!isRematch) return false;
  // Someone else is waiting, or will be once a board ends.
  const alternatives = waiting > 2 || Number(context.playing || 0) > 0;
  if (!alternatives) return false;
  const hold = context.rematchHoldMs ?? REMATCH_HOLD_MS;
  return Math.min(a.waitingMs, b.waitingMs) < hold;
}

/**
 * Score one possible opponent. Lower is better.
 *
 * Speed matters more than perfection in an arena, so this is a weighted
 * preference rather than a hard constraint: an immediate rematch is heavily
 * discouraged but never blocks a pairing that is otherwise the only option.
 */
export function pairingPenalty(
  player: PairingCandidate,
  candidate: PairingCandidate,
  context: { history: Map<string, Set<string>>; recent: Map<string, string> }
) {
  const proximityWeight = Math.max(0, 1 - player.waitingMs / PROXIMITY_RELAX_MS);
  let penalty = Math.abs(player.points - candidate.points) * proximityWeight;
  if (context.recent.get(player.playerKey) === candidate.playerKey) penalty += REMATCH_PENALTY;
  else if (hasMet(context.history, player.playerKey, candidate.playerKey)) penalty += REPEAT_PENALTY;
  if (player.lastColor && player.lastColor === candidate.lastColor) penalty += SAME_COLOUR_PENALTY;
  return penalty;
}

export function pickOpponent(
  player: PairingCandidate,
  candidates: PairingCandidate[],
  context: { history: Map<string, Set<string>>; recent: Map<string, string> }
) {
  let best: { candidate: PairingCandidate; index: number; penalty: number } | null = null;
  candidates.forEach((candidate, index) => {
    const penalty = pairingPenalty(player, candidate, context);
    if (!best || penalty < best.penalty) best = { candidate, index, penalty };
  });
  return best as { candidate: PairingCandidate; index: number; penalty: number } | null;
}

/**
 * Pair everyone who is waiting. Longest wait is served first, so nobody is
 * starved by a stream of newly-free players. A player whose only possible
 * opponent is the one they just played waits (briefly) rather than rematching;
 * the next pass — the 5-second tick, or the next board to end — picks them up.
 */
export function buildArenaPairings(waiting: PairingCandidate[], context: ArenaPairingContext) {
  const queue = [...waiting].sort((a, b) => b.waitingMs - a.waitingMs);
  const pairs: Array<{ white: PairingCandidate; black: PairingCandidate }> = [];
  const unpaired: PairingCandidate[] = [];
  while (queue.length) {
    const player = queue.shift()!;
    const allowed = queue.filter((candidate) => !rematchHeld(player, candidate, waiting.length, context));
    const choice = pickOpponent(player, allowed, context);
    if (!choice) {
      unpaired.push(player);
      continue;
    }
    queue.splice(queue.indexOf(choice.candidate), 1);
    pairs.push(resolveColors(player, choice.candidate) as { white: PairingCandidate; black: PairingCandidate });
  }
  return { pairs, unpaired };
}

/**
 * How long a player has been free: since their last game ended, or since they
 * joined or resumed, whichever is later. Measuring from the join time made
 * every player look equally long-waiting, which switched off both the
 * longest-wait priority and score proximity after the first half-minute.
 */
export function freeSinceMs(input: { lastGameEndedAt?: number | null; queuedAt?: number | null; joinedAt?: number | null; startedAt?: number | null }) {
  return Math.max(Number(input.lastGameEndedAt || 0), Number(input.queuedAt || 0), Number(input.joinedAt || 0), Number(input.startedAt || 0));
}

/**
 * Which player receives the bye: the lowest-placed who has not had one yet.
 * `standings` must already be in rank order.
 */
export function selectByeIndex(standings: Array<{ playerKey: string; byes?: number }>) {
  for (let index = standings.length - 1; index >= 0; index -= 1) {
    if (Number(standings[index].byes || 0) === 0) return index;
  }
  return standings.length - 1;
}
