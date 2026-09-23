import { maxWeightMatching, type WeightedEdge } from "./matching";

/**
 * Swiss pairing, Dutch-system principles over a maximum-weight matching.
 *
 * The rules of the Dutch system are a priority order: never repeat a pairing,
 * pair within score groups, balance colours, minimise floats. Rather than
 * walking score groups with transpositions and exchanges — which is where
 * hand-rolled implementations quietly go wrong — each rule becomes a term in an
 * edge weight, and the matcher returns the best pairing under all of them at
 * once.
 *
 * Two properties follow that a greedy scan cannot offer: if a legal pairing of
 * the whole field exists, one is always found; and the same input always gives
 * the same pairing.
 */

export type Colour = "white" | "black";

export type SwissPlayer = {
  playerKey: string;
  displayName: string;
  points: number;
  rating: number;
  /** Opponents already faced, byes excluded. */
  opponents: string[];
  /** Colours already held, oldest first. Byes excluded. */
  colours: Colour[];
  byes: number;
  /** Direction this player was floated last round, if any. */
  lastFloat?: "up" | "down" | null;
};

export type SwissPair = { white: SwissPlayer; black: SwissPlayer };

export type SwissPairingResult = {
  pairs: SwissPair[];
  bye: SwissPlayer | null;
  /**
   * True when no pairing of the field exists without repeating an opponent.
   * The round is not generated; the caller decides whether to end the event.
   */
  exhausted: boolean;
  /** Pairings that had to repeat an opponent, when repeats were permitted. */
  repeats: number;
};

/* ------------------------------------------------------------------ */
/* Weight terms                                                        */
/* ------------------------------------------------------------------ */

/**
 * Every edge starts from this and loses weight for each rule it bends. The
 * units are separated by enough orders of magnitude that a lower-priority term
 * can never outvote a higher-priority one, which is what makes this a priority
 * order rather than a blend.
 *
 * The order, highest first:
 *   1. pair everyone            (the matcher's maximum-cardinality mode)
 *   2. never repeat an opponent (the edge simply does not exist)
 *   3. no absolute colour violation
 *   4. stay inside the score group
 *   5. honour softer colour preferences
 *   6. avoid floating the same player twice
 *   7. a stable nudge, so equal pairings resolve the same way every time
 *
 * Absolute colour claims outrank score proximity deliberately: a player owed
 * two colours back, or facing a third of the same in a row, is a hard
 * constraint in the Dutch system, not a preference to be traded away.
 */
const BASE_WEIGHT = 1_000_000_000_000;
const ABSOLUTE_COLOUR_UNIT = 1_000_000_000;
const SCORE_UNIT = 1_000_000;
const SOFT_COLOUR_UNIT = 10_000;
const FLOAT_UNIT = 100;
/** Only used when repeats are explicitly permitted; dominates everything else. */
const REPEAT_PENALTY = 100_000_000_000;

/** Score gaps beyond this are all equally bad, and bounded well under the
 *  absolute-colour unit so they can never outrank it. */
const MAX_SCORE_GAP_STEPS = 60;

export function colourBalance(colours: Colour[]) {
  return colours.reduce((total, colour) => total + (colour === "white" ? 1 : -1), 0);
}

/** How many of the same colour the player has had in a row, most recent first. */
export function consecutiveColours(colours: Colour[]) {
  if (!colours.length) return { colour: null as Colour | null, count: 0 };
  const colour = colours[colours.length - 1];
  let count = 0;
  for (let index = colours.length - 1; index >= 0 && colours[index] === colour; index -= 1) count += 1;
  return { colour, count };
}

export type ColourPreference = {
  /** The colour this player is owed, or null when genuinely indifferent. */
  wants: Colour | null;
  /**
   * How badly. `absolute` must not be denied if any legal pairing avoids it —
   * two more of the same colour, or a third in a row.
   */
  strength: "absolute" | "strong" | "mild" | "none";
};

export function colourPreference(player: SwissPlayer): ColourPreference {
  const balance = colourBalance(player.colours);
  const run = consecutiveColours(player.colours);

  if (Math.abs(balance) >= 2) return { wants: balance > 0 ? "black" : "white", strength: "absolute" };
  if (run.count >= 2) return { wants: run.colour === "white" ? "black" : "white", strength: "absolute" };
  if (balance !== 0) return { wants: balance > 0 ? "black" : "white", strength: "strong" };
  if (run.count === 1) return { wants: run.colour === "white" ? "black" : "white", strength: "mild" };
  return { wants: null, strength: "none" };
}

const STRENGTH_COST: Record<ColourPreference["strength"], number> = {
  absolute: 40,
  strong: 4,
  mild: 1,
  none: 0,
};

/**
 * What pairing these two costs under the colour rules.
 *
 * Zero on both counts when each can have the colour they are owed. When both
 * want the same colour one of them is denied — and it matters a great deal
 * whether the denied claim was an absolute one, so the two are reported
 * separately and weighted an order of magnitude apart.
 */
export function colourConflict(a: SwissPlayer, b: SwissPlayer) {
  const prefA = colourPreference(a);
  const prefB = colourPreference(b);
  if (!prefA.wants || !prefB.wants || prefA.wants !== prefB.wants) return { absolute: 0, soft: 0 };
  // The weaker claim is the one that gets denied.
  if (prefA.strength === "absolute" && prefB.strength === "absolute") return { absolute: 1, soft: 0 };
  return { absolute: 0, soft: Math.min(STRENGTH_COST[prefA.strength], STRENGTH_COST[prefB.strength]) };
}

/** Total colour cost, for callers that do not need the breakdown. */
export function colourCost(a: SwissPlayer, b: SwissPlayer) {
  const conflict = colourConflict(a, b);
  return conflict.absolute * 1000 + conflict.soft;
}

/** Who takes White once the pair is fixed. */
export function assignColours(a: SwissPlayer, b: SwissPlayer): SwissPair {
  const prefA = colourPreference(a);
  const prefB = colourPreference(b);

  if (prefA.wants && (!prefB.wants || prefA.wants !== prefB.wants)) {
    return prefA.wants === "white" ? { white: a, black: b } : { white: b, black: a };
  }
  if (prefB.wants && !prefA.wants) {
    return prefB.wants === "white" ? { white: b, black: a } : { white: a, black: b };
  }
  if (prefA.wants && prefB.wants && prefA.wants === prefB.wants) {
    // Both owed the same colour: the stronger claim wins, then the higher
    // score, then a stable comparison so the result never wobbles.
    const rank = STRENGTH_COST[prefA.strength] - STRENGTH_COST[prefB.strength];
    const winner =
      rank !== 0
        ? rank > 0
          ? a
          : b
        : a.points !== b.points
          ? a.points > b.points
            ? a
            : b
          : a.playerKey.localeCompare(b.playerKey) <= 0
            ? a
            : b;
    const loser = winner === a ? b : a;
    return prefA.wants === "white" ? { white: winner, black: loser } : { white: loser, black: winner };
  }
  // Neither is owed anything: higher score takes White, ties broken stably.
  if (a.points !== b.points) return a.points > b.points ? { white: a, black: b } : { white: b, black: a };
  if (a.rating !== b.rating) return a.rating > b.rating ? { white: a, black: b } : { white: b, black: a };
  return a.playerKey.localeCompare(b.playerKey) <= 0 ? { white: a, black: b } : { white: b, black: a };
}

/** Float cost: floating the same player the same way twice running is worst. */
function floatCost(a: SwissPlayer, b: SwissPlayer) {
  if (a.points === b.points) return 0;
  const down = a.points > b.points ? a : b;
  const up = a.points > b.points ? b : a;
  let cost = 1;
  if (down.lastFloat === "down") cost += 2;
  if (up.lastFloat === "up") cost += 2;
  return cost;
}

/* ------------------------------------------------------------------ */
/* Ordering and byes                                                   */
/* ------------------------------------------------------------------ */

/** Standing order: score, then rating, then a stable key comparison. */
export function orderPlayers(players: SwissPlayer[]) {
  return [...players].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.rating !== a.rating) return b.rating - a.rating;
    return a.playerKey.localeCompare(b.playerKey);
  });
}

/**
 * The bye goes to the lowest-placed player who has not had one. Only if every
 * player already has one does it go to the lowest-placed player overall.
 */
export function selectByePlayer(ordered: SwissPlayer[]): SwissPlayer | null {
  if (!ordered.length) return null;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (Number(ordered[index].byes || 0) === 0) return ordered[index];
  }
  return ordered[ordered.length - 1];
}

/** With n players, no more than n-1 rounds can be played without a repeat. */
export function maxRoundsWithoutRepeat(playerCount: number) {
  return Math.max(0, playerCount - 1);
}

/* ------------------------------------------------------------------ */
/* Pairing                                                             */
/* ------------------------------------------------------------------ */

function edgeWeight(a: SwissPlayer, b: SwissPlayer, hasMet: boolean, allowRepeats: boolean) {
  // Score groups first: the further apart in the standings, the worse. Scores
  // come in halves, so doubling keeps the term an integer.
  const scoreSteps = Math.min(MAX_SCORE_GAP_STEPS, Math.round(Math.abs(a.points - b.points) * 2));
  const colour = colourConflict(a, b);
  let weight =
    BASE_WEIGHT -
    colour.absolute * ABSOLUTE_COLOUR_UNIT -
    scoreSteps * SCORE_UNIT -
    colour.soft * SOFT_COLOUR_UNIT -
    floatCost(a, b) * FLOAT_UNIT;
  // A stable, tiny nudge so equally good pairings resolve the same way twice.
  weight -= (Math.abs(hashKey(a.playerKey) - hashKey(b.playerKey)) % 64);
  if (hasMet) {
    if (!allowRepeats) return null;
    weight -= REPEAT_PENALTY;
  }
  return Math.max(1, weight);
}

function hashKey(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

function buildEdges(players: SwissPlayer[], allowRepeats: boolean) {
  const met = new Map<string, Set<string>>(players.map((player) => [player.playerKey, new Set(player.opponents || [])]));
  const edges: WeightedEdge[] = [];
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i];
      const b = players[j];
      const hasMet = Boolean(met.get(a.playerKey)?.has(b.playerKey) || met.get(b.playerKey)?.has(a.playerKey));
      const weight = edgeWeight(a, b, hasMet, allowRepeats);
      if (weight === null) continue;
      edges.push([i, j, weight]);
    }
  }
  return { edges, met };
}

function matchAll(players: SwissPlayer[], allowRepeats: boolean) {
  if (players.length < 2) return null;
  const { edges } = buildEdges(players, allowRepeats);
  if (!edges.length) return null;
  const mate = maxWeightMatching(edges, true);
  // Anything short of pairing everyone is not a usable Swiss round.
  for (let index = 0; index < players.length; index += 1) {
    if ((mate[index] ?? -1) < 0) return null;
  }
  return mate;
}

export type SwissPairingOptions = {
  /**
   * Permit repeat pairings when nothing else is possible. Off by default: a
   * Swiss event that has run out of legal pairings should end, not silently
   * start replaying the same games.
   */
  allowRepeats?: boolean;
  /**
   * Rounds still to be played, this one included. When given, a pairing that
   * would leave a later round with no legal pairing is avoided if another
   * pairing keeps more of the schedule playable. Small fields are where this
   * bites: six players can play five rounds, but a greedy Swiss often paints
   * itself into a corner after three.
   */
  roundsRemaining?: number;
  /** Search budget for the look-ahead, in visited nodes. */
  lookaheadBudget?: number;
};

/** Beyond this field size a dead end within the scheduled rounds is not a practical risk. */
const LOOKAHEAD_MAX_PLAYERS = 24;
const DEFAULT_LOOKAHEAD_BUDGET = 200_000;
const BYE_NODE = "\u0000bye";

/**
 * Bye candidates in the order they should be tried: players without a bye from
 * the bottom of the standings up, then — only if every player has had one —
 * the rest, bottom up.
 */
export function byeCandidates(ordered: SwissPlayer[]) {
  const fresh = ordered.filter((player) => Number(player.byes || 0) === 0).reverse();
  return fresh.length ? fresh : [...ordered].reverse();
}

class BudgetExceeded extends Error {}

/** Search steps left, shared by every question asked while pairing one round. */
type Budget = { left: number };

/**
 * Whether `rounds` further rounds can each pair the whole field without a
 * repeat or a second bye. A pure feasibility search — pairing quality is
 * irrelevant here — trying the most-constrained player first, which is what
 * keeps it fast.
 *
 * "unknown" when the budget runs out: an unanswered question must not block a
 * pairing that may well be fine.
 */
function feasibility(
  keys: string[],
  met: Map<string, Set<string>>,
  hadBye: Set<string>,
  rounds: number,
  budget: Budget,
  /**
   * When given, the first round is searched best-first by this score (higher
   * is better) and the pairs it settles on are written to `firstRound`.
   */
  schedule?: { preference: (a: string, b: string) => number; firstRound: Array<[string, string]> }
): "yes" | "no" | "unknown" {
  if (rounds <= 0 || keys.length < 2) return "yes";
  if (budget.left <= 0) return "unknown";
  const nodes = keys.length % 2 === 1 ? [...keys, BYE_NODE] : [...keys];
  const blocked = new Map<string, Set<string>>(nodes.map((node) => [node, new Set(met.get(node) || [])]));
  if (keys.length % 2 === 1) {
    // Once everyone has had a bye the rule relaxes, exactly as selectByePlayer does.
    const relaxed = keys.every((key) => hadBye.has(key));
    for (const key of keys) {
      if (hadBye.has(key) && !relaxed) {
        blocked.get(key)!.add(BYE_NODE);
        blocked.get(BYE_NODE)!.add(key);
      }
    }
  }
  const options = (node: string, free: Set<string>) => {
    const no = blocked.get(node)!;
    let count = 0;
    for (const other of Array.from(free)) if (other !== node && !no.has(other)) count += 1;
    return count;
  };

  const solve = (free: Set<string>, remaining: number): boolean => {
    budget.left -= 1;
    if (budget.left < 0) throw new BudgetExceeded();
    if (!free.size) return remaining <= 1 || solve(new Set(nodes), remaining - 1);
    let pick = "";
    let fewest = Infinity;
    for (const node of Array.from(free)) {
      const count = options(node, free);
      if (count < fewest) {
        fewest = count;
        pick = node;
      }
    }
    if (fewest === 0) return false;
    const no = blocked.get(pick)!;
    const firstRound = schedule && remaining === rounds;
    let partners = Array.from(free).filter((other) => other !== pick && !no.has(other));
    if (firstRound) partners = partners.sort((a, b) => schedule.preference(pick, b) - schedule.preference(pick, a));
    for (const other of partners) {
      free.delete(pick);
      free.delete(other);
      no.add(other);
      blocked.get(other)!.add(pick);
      if (firstRound) schedule.firstRound.push([pick, other]);
      const ok = solve(free, remaining);
      if (ok) return true;
      if (firstRound) schedule.firstRound.pop();
      no.delete(other);
      blocked.get(other)!.delete(pick);
      free.add(pick);
      free.add(other);
    }
    return false;
  };

  try {
    return solve(new Set(nodes), rounds) ? "yes" : "no";
  } catch (error) {
    if (error instanceof BudgetExceeded) return "unknown";
    throw error;
  }
}

export function canCompleteRounds(
  keys: string[],
  met: Map<string, Set<string>>,
  hadBye: Set<string>,
  rounds: number,
  budget: number = DEFAULT_LOOKAHEAD_BUDGET
) {
  return feasibility(keys, met, hadBye, rounds, { left: budget }) !== "no";
}

/**
 * The most further rounds this field could possibly play: each round needs a
 * new opponent (or, in an odd field, a first bye) for every player. A cheap
 * upper bound, so the search never hunts for a schedule that cannot exist.
 */
function roundsBound(players: SwissPlayer[]) {
  const odd = players.length % 2 === 1;
  let bound = Infinity;
  for (const player of players) {
    const met = new Set(player.opponents || []);
    const fresh = players.filter((other) => other.playerKey !== player.playerKey && !met.has(other.playerKey)).length;
    bound = Math.min(bound, fresh + (odd && !Number(player.byes || 0) ? 1 : 0));
  }
  return bound === Infinity ? 0 : bound;
}

type Candidate = { bye: SwissPlayer | null; byeRank: number; field: SwissPlayer[]; mate: number[]; weight: number };

function matchingWeight(field: SwissPlayer[], mate: number[], allowRepeats: boolean) {
  let total = 0;
  for (let index = 0; index < field.length; index += 1) {
    const other = mate[index];
    if (other <= index) continue;
    const a = field[index];
    const b = field[other];
    const hasMet = Boolean(a.opponents?.includes(b.playerKey) || b.opponents?.includes(a.playerKey));
    total += edgeWeight(a, b, hasMet, allowRepeats) || 0;
  }
  return total;
}

/** The best matching with one of its pairs forbidden, for each pair in turn. */
function alternativeMatchings(field: SwissPlayer[], mate: number[]) {
  const { edges } = buildEdges(field, false);
  const alternatives: number[][] = [];
  for (let index = 0; index < field.length; index += 1) {
    const other = mate[index];
    if (other <= index) continue;
    const filtered = edges.filter(([i, j]) => !((i === index && j === other) || (i === other && j === index)));
    const next = maxWeightMatching(filtered, true);
    if (field.every((_, position) => (next[position] ?? -1) >= 0)) alternatives.push(next);
  }
  return alternatives;
}

function laterRoundsPlayable(players: SwissPlayer[], candidate: Candidate, rounds: number, budget: Budget) {
  const met = new Map<string, Set<string>>(players.map((player) => [player.playerKey, new Set(player.opponents || [])]));
  const hadBye = new Set(players.filter((player) => Number(player.byes || 0) > 0).map((player) => player.playerKey));
  if (candidate.bye) hadBye.add(candidate.bye.playerKey);
  candidate.field.forEach((player, index) => {
    const other = candidate.field[candidate.mate[index]];
    if (other) met.get(player.playerKey)!.add(other.playerKey);
  });
  return feasibility(
    players.map((player) => player.playerKey),
    met,
    hadBye,
    rounds,
    budget
  );
}

/** This round's pairing taken from a complete schedule of `rounds` rounds, if one exists. */
function scheduledCandidate(ordered: SwissPlayer[], rounds: number, budget: Budget): Candidate | "no" | "unknown" {
  const byKey = new Map(ordered.map((player) => [player.playerKey, player]));
  const rank = new Map(ordered.map((player, index) => [player.playerKey, index]));
  const met = new Map<string, Set<string>>(ordered.map((player) => [player.playerKey, new Set(player.opponents || [])]));
  const hadBye = new Set(ordered.filter((player) => Number(player.byes || 0) > 0).map((player) => player.playerKey));
  const preference = (a: string, b: string) => {
    // The bye goes as low in the standings as possible; players prefer a game.
    if (a === BYE_NODE) return rank.get(b) || 0;
    if (b === BYE_NODE) return -1;
    return edgeWeight(byKey.get(a)!, byKey.get(b)!, false, false) || 0;
  };
  const firstRound: Array<[string, string]> = [];
  const answer = feasibility(Array.from(byKey.keys()), met, hadBye, rounds, budget, { preference, firstRound });
  if (answer !== "yes") return answer;

  const byePair = firstRound.find(([a, b]) => a === BYE_NODE || b === BYE_NODE);
  const bye = byePair ? byKey.get(byePair[0] === BYE_NODE ? byePair[1] : byePair[0])! : null;
  const field = bye ? ordered.filter((player) => player !== bye) : ordered;
  const position = new Map(field.map((player, index) => [player.playerKey, index]));
  const mate = field.map(() => -1);
  for (const [a, b] of firstRound) {
    if (a === BYE_NODE || b === BYE_NODE) continue;
    mate[position.get(a)!] = position.get(b)!;
    mate[position.get(b)!] = position.get(a)!;
  }
  return { bye, byeRank: 0, field, mate, weight: matchingWeight(field, mate, false) };
}

/**
 * Pair one Swiss round.
 *
 * Returns `exhausted` rather than throwing when the field can no longer be
 * paired without repeats, so the caller can end the tournament cleanly.
 */
export function pairSwissRound(players: SwissPlayer[], options: SwissPairingOptions = {}): SwissPairingResult {
  const ordered = orderPlayers(players);
  const empty: SwissPairingResult = { pairs: [], bye: null, exhausted: false, repeats: 0 };
  if (!ordered.length) return empty;

  const odd = ordered.length % 2 === 1;
  if (odd && ordered.length < 3) return { ...empty, bye: selectByePlayer(ordered) };

  // Never look further than this field could ever play; this round uses one.
  const later = Math.max(0, Math.min(Number(options.roundsRemaining || 0), roundsBound(ordered)) - 1);
  const budget: Budget = { left: options.lookaheadBudget ?? DEFAULT_LOOKAHEAD_BUDGET };
  const lookahead = later > 0 && ordered.length <= LOOKAHEAD_MAX_PLAYERS;

  // Bye choices that yield a full pairing, preferred bye first. A plain Swiss
  // stops at the first; the others exist so that a bye which strands the field
  // does not end the event while a different one would not.
  const candidates: Candidate[] = [];
  const collect = (allowRepeats: boolean) => {
    const byes = odd ? byeCandidates(ordered) : [null];
    byes.forEach((bye, byeRank) => {
      if (candidates.length && !lookahead) return;
      const field = bye ? ordered.filter((player) => player.playerKey !== bye.playerKey) : ordered;
      const mate = matchAll(field, allowRepeats);
      if (mate) candidates.push({ bye, byeRank, field, mate, weight: matchingWeight(field, mate, allowRepeats) });
    });
  };

  let repeatsUsed = false;
  collect(false);
  if (!candidates.length && options.allowRepeats) {
    repeatsUsed = true;
    collect(true);
  }
  if (!candidates.length) return { pairs: [], bye: odd ? selectByePlayer(ordered) : null, exhausted: true, repeats: 0 };

  let chosen = candidates[0];
  if (lookahead && !repeatsUsed && laterRoundsPlayable(ordered, chosen, later, budget) === "no") {
    // The plain Swiss choice leads to a dead end. Take the best pairing that
    // keeps the most of the remaining schedule playable: preferred bye first,
    // then heaviest (most Swiss-correct) matching.
    const pool: Candidate[] = [];
    for (const candidate of candidates) {
      pool.push(candidate);
      for (const mate of alternativeMatchings(candidate.field, candidate.mate)) {
        pool.push({ ...candidate, mate, weight: matchingWeight(candidate.field, mate, false) });
      }
    }
    pool.sort((a, b) => a.byeRank - b.byeRank || b.weight - a.weight);
    // Most rounds first. An "unknown" (budget spent) is accepted rather than
    // searched further: past that point the plain choice is as good a bet.
    search: for (let rounds = later; rounds > 0; rounds -= 1) {
      for (const candidate of pool) {
        const answer = laterRoundsPlayable(ordered, candidate, rounds, budget);
        if (answer === "no") continue;
        if (answer === "yes") chosen = candidate;
        break search;
      }
      // None of the near-Swiss pairings survive. Build this round from a whole
      // schedule that does, taking the Swiss-best partner at every choice.
      const scheduled = scheduledCandidate(ordered, rounds + 1, budget);
      if (scheduled === "no") continue;
      if (scheduled !== "unknown") chosen = scheduled;
      break;
    }
  }

  const { bye, field, mate } = chosen;
  const pairs: SwissPair[] = [];
  const seen = new Set<number>();
  let repeats = 0;
  for (let index = 0; index < field.length; index += 1) {
    const other = mate[index];
    if (other < 0 || seen.has(index) || seen.has(other)) continue;
    seen.add(index);
    seen.add(other);
    const a = field[index];
    const b = field[other];
    if (a.opponents?.includes(b.playerKey) || b.opponents?.includes(a.playerKey)) repeats += 1;
    pairs.push(assignColours(a, b));
  }

  // Board order follows the standings: the leaders play on board one.
  pairs.sort((x, y) => {
    const bestOf = (pair: SwissPair) => Math.max(pair.white.points, pair.black.points);
    if (bestOf(y) !== bestOf(x)) return bestOf(y) - bestOf(x);
    return ordered.indexOf(x.white) - ordered.indexOf(y.white);
  });

  return { pairs, bye, exhausted: false, repeats };
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export type SwissHistoryGame = {
  roundNumber?: number;
  whiteKey: string;
  blackKey?: string;
  status: string;
  result?: string;
  termination?: string;
};

/**
 * Each player's Swiss history, derived from the games themselves: who they
 * faced, which colours they held, and which way they floated in the latest
 * round. Derived rather than stored, so nothing that rebuilds the standings can
 * wipe it — a stored float was being reset by every standings recalculation.
 *
 * Unplayed games — byes, forfeits, aborted boards — give no opponent and no
 * colour, so the two players may still meet and colours stay honest. A bye
 * counts as a downfloat, as in the Dutch system.
 */
export function swissHistoriesFromGames(games: SwissHistoryGame[]) {
  const opponents = new Map<string, string[]>();
  const colours = new Map<string, Colour[]>();
  const lastFloat = new Map<string, "up" | "down" | null>();
  const points = new Map<string, number>();

  const byRound = new Map<number, SwissHistoryGame[]>();
  for (const game of games) {
    const round = Number(game.roundNumber || 0);
    if (!byRound.has(round)) byRound.set(round, []);
    byRound.get(round)!.push(game);
  }
  const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);
  const latestRound = rounds[rounds.length - 1] ?? 0;

  for (const round of rounds) {
    const before = new Map(points);
    for (const game of byRound.get(round)!) {
      if (game.status === "aborted") continue;
      const isBye = !game.blackKey || game.termination === "bye";
      const blackKey = String(game.blackKey || "");

      if (round === latestRound) {
        if (isBye) lastFloat.set(game.whiteKey, "down");
        else if (game.termination !== "forfeit") {
          const white = before.get(game.whiteKey) || 0;
          const black = before.get(blackKey) || 0;
          lastFloat.set(game.whiteKey, white === black ? null : white > black ? "down" : "up");
          lastFloat.set(blackKey, white === black ? null : black > white ? "down" : "up");
        }
      }

      if (game.status === "completed") {
        const result = isBye ? "1-0" : String(game.result || "*");
        points.set(game.whiteKey, (points.get(game.whiteKey) || 0) + (result === "1-0" ? 1 : result === "1/2-1/2" ? 0.5 : 0));
        if (blackKey) points.set(blackKey, (points.get(blackKey) || 0) + (result === "0-1" ? 1 : result === "1/2-1/2" ? 0.5 : 0));
      }

      if (isBye || game.termination === "forfeit") continue;
      for (const key of [game.whiteKey, blackKey]) {
        if (!opponents.has(key)) opponents.set(key, []);
        if (!colours.has(key)) colours.set(key, []);
      }
      opponents.get(game.whiteKey)!.push(blackKey);
      opponents.get(blackKey)!.push(game.whiteKey);
      colours.get(game.whiteKey)!.push("white");
      colours.get(blackKey)!.push("black");
    }
  }
  return { opponents, colours, lastFloat };
}
