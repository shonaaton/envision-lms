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
};

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

  let bye: SwissPlayer | null = null;
  let field = ordered;
  if (ordered.length % 2 === 1) {
    bye = selectByePlayer(ordered);
    field = ordered.filter((player) => player.playerKey !== bye?.playerKey);
  }

  if (field.length < 2) return { ...empty, bye };

  let mate = matchAll(field, false);
  let repeats = 0;

  if (!mate) {
    if (!options.allowRepeats) return { pairs: [], bye, exhausted: true, repeats: 0 };
    mate = matchAll(field, true);
    if (!mate) return { pairs: [], bye, exhausted: true, repeats: 0 };
  }

  const met = new Map<string, Set<string>>(field.map((player) => [player.playerKey, new Set(player.opponents || [])]));
  const pairs: SwissPair[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < field.length; index += 1) {
    const other = mate[index];
    if (other < 0 || seen.has(index) || seen.has(other)) continue;
    seen.add(index);
    seen.add(other);
    const a = field[index];
    const b = field[other];
    if (met.get(a.playerKey)?.has(b.playerKey)) repeats += 1;
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
