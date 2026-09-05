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
 * starved by a stream of newly-free players.
 */
export function buildArenaPairings(waiting: PairingCandidate[], context: { history: Map<string, Set<string>>; recent: Map<string, string> }) {
  const queue = [...waiting].sort((a, b) => b.waitingMs - a.waitingMs);
  const pairs: Array<{ white: PairingCandidate; black: PairingCandidate }> = [];
  while (queue.length >= 2) {
    const player = queue.shift()!;
    const choice = pickOpponent(player, queue, context);
    if (!choice) break;
    queue.splice(choice.index, 1);
    pairs.push(resolveColors(player, choice.candidate) as { white: PairingCandidate; black: PairingCandidate });
  }
  return { pairs, unpaired: queue };
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
