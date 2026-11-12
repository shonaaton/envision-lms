/**
 * Arena pairing, ported from Lichess (lichess-org/lila, modules/tournament):
 * StartedOrganizer + TournamentApi.makePairings (when to pair),
 * WaitingUsers (who is waiting, evenNumber), PairingSystem (initial pairings,
 * groups), AntmaPairing (the weighted matching and its scores) and
 * ColorHistory (who gets White). Pure: the engine gathers the inputs.
 *
 * In short:
 *   - In the first 15 seconds, players are paired straight down the ranking
 *     (1-2, 3-4, ...), which at the start is rating order.
 *   - After that, a minimum-weight matching over everyone waiting, where the
 *     cost of a pair is |rank a - rank b| * rankFactor + |rating a - rating b|
 *     and rankFactor is 2000 for the leaders down to 300 at the bottom, so the
 *     top of the table is kept tightly together.
 *   - Never your last opponent again (unless only two players are active), and
 *     never two players who have both just had the same colour three times.
 *   - Pairing waits for a pool: it happens once at least two players have
 *     waited `waitSeconds`, or (under 30 players) when at least two thirds of
 *     the active players are waiting, or for the very first boards.
 */

import { maxWeightMatching, type WeightedEdge } from "@/lib/tournament/matching";
import { ARENA_MAX_COLOUR_STRIKE, ARENA_MAX_GROUP_SIZE } from "@/lib/tournament/lichessRules";

/* ------------------------------------------------------------------ */
/* Colours (lila ColorHistory)                                         */
/* ------------------------------------------------------------------ */

/** strike > 0: that many Whites in a row; < 0: Blacks. balance: Whites minus Blacks. */
export type ColourHistory = { strike: number; balance: number };

export const NO_COLOUR_HISTORY: ColourHistory = { strike: 0, balance: 0 };

export function addColour(history: ColourHistory, colour: "white" | "black"): ColourHistory {
  return colour === "white"
    ? { strike: Math.max(1, history.strike + 1), balance: history.balance + 1 }
    : { strike: Math.min(-1, history.strike - 1), balance: history.balance - 1 };
}

export function colourHistoryOf(colours: Array<"white" | "black">) {
  return colours.reduce(addColour, NO_COLOUR_HISTORY);
}

function compareHistory(a: ColourHistory, b: ColourHistory) {
  if (a.strike !== b.strike) return a.strike < b.strike ? -1 : 1;
  if (a.balance !== b.balance) return a.balance < b.balance ? -1 : 1;
  return 0;
}

/** lila firstGetsWhite: the lower history (fewer recent Whites) gets White; a tie is a coin flip. */
export function firstGetsWhite(a: ColourHistory, b: ColourHistory, coin: () => boolean) {
  const order = compareHistory(a, b);
  return order < 0 || (order === 0 && coin());
}

/** lila couldPlay: not if both have had maxStrike Blacks in a row, nor both maxStrike Whites. */
export function couldPlay(a: ColourHistory, b: ColourHistory, maxStrike = ARENA_MAX_COLOUR_STRIKE) {
  return (a.strike > -maxStrike || b.strike > -maxStrike) && (a.strike < maxStrike || b.strike < maxStrike);
}

/* ------------------------------------------------------------------ */
/* Who is waiting and when to pair (lila WaitingUsers, makePairings)   */
/* ------------------------------------------------------------------ */

export type ArenaWaiter = {
  playerKey: string;
  /** 0-based position in the tournament's standings. */
  rank: number;
  rating: number;
  /** When this player became free to be paired (epoch ms). */
  since: number;
  colours: ColourHistory;
};

export type ArenaPairingInput = {
  waiting: ArenaWaiter[];
  /** Each player's most recent opponent (lila LastOpponents). */
  lastOpponents: Map<string, string>;
  now: number;
  /** lila Tournament.isRecentlyStarted. */
  recentlyStarted: boolean;
  /** Whether any board has been created yet (lila hadPairings). */
  hadPairings: boolean;
  /** lila WaitingUsers.waitSeconds for this clock. */
  waitSeconds: number;
  /** Active (present, not paused) players, counted only for tournaments under 30 players; else null. */
  smallTourActivePlayers: number | null;
  random?: () => number;
};

export type ArenaPair = { white: ArenaWaiter; black: ArenaWaiter };

/** lila WaitingUsers.haveWaitedEnough */
export function haveWaitedEnough(waiting: ArenaWaiter[], now: number, waitSeconds: number) {
  if (waiting.length > 100) return true;
  const since = now - waitSeconds * 1000;
  return waiting.filter((player) => player.since < since).length > 1;
}

/** lila TournamentApi.makePairings guard. */
export function shouldPairNow(input: ArenaPairingInput) {
  const { waiting } = input;
  if (waiting.length < 2) return false;
  if (input.smallTourActivePlayers !== null && input.smallTourActivePlayers < 2) return false;
  return (
    !input.hadPairings ||
    haveWaitedEnough(waiting, input.now, input.waitSeconds) ||
    (input.smallTourActivePlayers !== null && input.smallTourActivePlayers <= waiting.length * 1.5)
  );
}

/** lila WaitingUsers.evenNumber: with an odd count, leave out whoever became free last. */
export function evenNumber(waiting: ArenaWaiter[]) {
  if (waiting.length % 2 === 0) return waiting;
  let latest = waiting[0];
  for (const player of waiting) if (player.since > latest.since) latest = player;
  return waiting.filter((player) => player !== latest);
}

/* ------------------------------------------------------------------ */
/* Pairing (lila PairingSystem, AntmaPairing)                          */
/* ------------------------------------------------------------------ */

/** lila PairingSystem.rankFactorFor: 2000 for the best rank in the group, 300 for the worst. */
export function rankFactorFor(players: ArenaWaiter[]) {
  const maxRank = Math.max(...players.map((player) => player.rank));
  return (a: ArenaWaiter, b: ArenaWaiter) => {
    const rank = Math.min(a.rank, b.rank);
    return maxRank > 0 ? 300 + Math.floor((1700 * (maxRank - rank)) / maxRank) : 2000;
  };
}

/** lila AntmaPairing.pairScore: lower is better; null means the pair is not allowed. */
export function pairScore(
  a: ArenaWaiter,
  b: ArenaWaiter,
  context: { lastOpponents: Map<string, string>; rankFactor: (a: ArenaWaiter, b: ArenaWaiter) => number }
) {
  const justPlayedTogether = context.lastOpponents.get(a.playerKey) === b.playerKey || context.lastOpponents.get(b.playerKey) === a.playerKey;
  if (justPlayedTogether || !couldPlay(a.colours, b.colours)) return null;
  return Math.abs(a.rank - b.rank) * context.rankFactor(a, b) + Math.abs(a.rating - b.rating);
}

function withColours(a: ArenaWaiter, b: ArenaWaiter, coin: () => boolean): ArenaPair {
  return firstGetsWhite(a.colours, b.colours, coin) ? { white: a, black: b } : { white: b, black: a };
}

const MATCHING_BASE = 1_000_000_000;

/** lila AntmaPairing: minimum-weight maximum matching over the allowed pairs. */
function bestPairings(players: ArenaWaiter[], input: ArenaPairingInput, coin: () => boolean): ArenaPair[] {
  if (players.length < 2) return [];
  const duel = input.smallTourActivePlayers === 2;
  const rankFactor = rankFactorFor(players);
  const edges: WeightedEdge[] = [];
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const cost = duel ? 1 : pairScore(players[i], players[j], { lastOpponents: input.lastOpponents, rankFactor });
      if (cost === null) continue;
      edges.push([i, j, MATCHING_BASE - cost]);
    }
  }
  if (!edges.length) return [];
  const mate = maxWeightMatching(edges, true);
  const pairs: ArenaPair[] = [];
  for (let i = 0; i < players.length; i += 1) {
    const j = mate[i] ?? -1;
    if (j > i) pairs.push(withColours(players[i], players[j], coin));
  }
  return pairs;
}

/** lila PairingSystem.proximityPairings: neighbours in the ranking, for the tail of a very large pool. */
function proximityPairings(players: ArenaWaiter[], coin: () => boolean): ArenaPair[] {
  const pairs: ArenaPair[] = [];
  for (let i = 0; i + 1 < players.length; i += 2) pairs.push(withColours(players[i], players[i + 1], coin));
  return pairs;
}

function makePreps(players: ArenaWaiter[], input: ArenaPairingInput, coin: () => boolean): ArenaPair[] {
  if (players.length < 2) return [];
  const idles = [...players].sort((a, b) => a.rank - b.rank);
  if (input.recentlyStarted) {
    // lila initialPairings: 1-2, 3-4, ... with a random colour each.
    const pairs: ArenaPair[] = [];
    for (let i = 0; i + 1 < idles.length; i += 2) {
      pairs.push(coin() ? { white: idles[i], black: idles[i + 1] } : { white: idles[i + 1], black: idles[i] });
    }
    return pairs;
  }
  if (idles.length <= ARENA_MAX_GROUP_SIZE) return bestPairings(idles, input, coin);
  const groupSize = Math.min(Math.floor(idles.length / 4) * 2, ARENA_MAX_GROUP_SIZE);
  return [
    ...bestPairings(idles.slice(0, groupSize), input, coin),
    ...bestPairings(idles.slice(groupSize, groupSize * 2), input, coin),
    ...proximityPairings(idles.slice(groupSize * 2, groupSize * 8), coin),
  ];
}

/** Everything lila would pair now, given who is waiting. Empty when it should wait. */
export function lichessArenaPairings(input: ArenaPairingInput): ArenaPair[] {
  if (!shouldPairNow(input)) return [];
  const random = input.random || Math.random;
  const coin = () => random() < 0.5;
  const even = makePreps(evenNumber(input.waiting), input, coin);
  if (!even.length && input.waiting.length % 2 === 1) return makePreps(input.waiting, input, coin);
  return even;
}
