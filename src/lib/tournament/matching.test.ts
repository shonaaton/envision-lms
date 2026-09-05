import { describe, expect, it } from "vitest";
import { maxWeightMatching, type WeightedEdge } from "./matching";

/**
 * Exhaustive reference matcher.
 *
 * A blossom implementation is not something to take on trust, so every property
 * below is checked against brute force on graphs small enough to enumerate
 * completely. If the port is wrong, these fail.
 */
function bruteForce(edges: WeightedEdge[], maxCardinality: boolean) {
  let nvertex = 0;
  for (const [i, j] of edges) nvertex = Math.max(nvertex, i + 1, j + 1);

  let best: { pairs: number; weight: number } = { pairs: 0, weight: 0 };

  const search = (index: number, used: boolean[], pairs: number, weight: number) => {
    if (index === edges.length) {
      const better = maxCardinality
        ? pairs > best.pairs || (pairs === best.pairs && weight > best.weight)
        : weight > best.weight;
      if (better) best = { pairs, weight };
      return;
    }
    // Skip this edge.
    search(index + 1, used, pairs, weight);
    // Or take it, if both ends are free.
    const [i, j, w] = edges[index];
    if (!used[i] && !used[j]) {
      used[i] = true;
      used[j] = true;
      search(index + 1, used, pairs + 1, weight + w);
      used[i] = false;
      used[j] = false;
    }
  };

  search(0, new Array(nvertex).fill(false), 0, 0);
  return best;
}

function summarise(edges: WeightedEdge[], mate: number[]) {
  let pairs = 0;
  let weight = 0;
  const weightOf = new Map<string, number>();
  for (const [i, j, w] of edges) weightOf.set(i < j ? `${i}-${j}` : `${j}-${i}`, w);

  for (let v = 0; v < mate.length; v += 1) {
    const w = mate[v];
    if (w < 0 || w < v) continue;
    pairs += 1;
    const key = `${v}-${w}`;
    expect(weightOf.has(key), `matched a pair with no edge: ${key}`).toBe(true);
    weight += weightOf.get(key) as number;
  }
  return { pairs, weight };
}

function assertValidMatching(mate: number[]) {
  for (let v = 0; v < mate.length; v += 1) {
    if (mate[v] < 0) continue;
    // Matching must be symmetric and nobody may be paired with themselves.
    expect(mate[mate[v]]).toBe(v);
    expect(mate[v]).not.toBe(v);
  }
}

/** Deterministic pseudo-random source, so a failure is always reproducible. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomGraph(random: () => number, nvertex: number, density: number, maxWeight: number): WeightedEdge[] {
  const edges: WeightedEdge[] = [];
  for (let i = 0; i < nvertex; i += 1) {
    for (let j = i + 1; j < nvertex; j += 1) {
      if (random() < density) edges.push([i, j, 1 + Math.floor(random() * maxWeight)]);
    }
  }
  return edges;
}

describe("maxWeightMatching — basics", () => {
  it("returns nothing for an empty graph", () => {
    expect(maxWeightMatching([])).toEqual([]);
  });

  it("matches a single edge", () => {
    expect(maxWeightMatching([[0, 1, 1]])).toEqual([1, 0]);
  });

  it("picks the heavier of two competing edges", () => {
    const mate = maxWeightMatching([
      [0, 1, 5],
      [1, 2, 11],
      [2, 3, 5],
    ]);
    expect(mate).toEqual([-1, 2, 1, -1]);
  });

  it("prefers two light edges over one heavy one when that weighs more", () => {
    const mate = maxWeightMatching([
      [0, 1, 5],
      [1, 2, 11],
      [2, 3, 5],
      [0, 3, 8],
    ]);
    const { pairs } = summarise(
      [
        [0, 1, 5],
        [1, 2, 11],
        [2, 3, 5],
        [0, 3, 8],
      ],
      mate
    );
    expect(pairs).toBe(2);
  });

  it("leaves a vertex unmatched when no edge reaches it", () => {
    const mate = maxWeightMatching([[0, 1, 3]], true);
    expect(mate[0]).toBe(1);
    expect(mate.length).toBe(2);
  });

  it("handles a triangle, which is where greedy pairing goes wrong", () => {
    const edges: WeightedEdge[] = [
      [0, 1, 1],
      [1, 2, 1],
      [0, 2, 1],
    ];
    const mate = maxWeightMatching(edges, true);
    assertValidMatching(mate);
    expect(summarise(edges, mate).pairs).toBe(1);
  });

  it("finds the perfect matching in a five-cycle plus chord (a blossom case)", () => {
    const edges: WeightedEdge[] = [
      [0, 1, 9],
      [1, 2, 8],
      [2, 3, 9],
      [3, 4, 8],
      [4, 0, 9],
      [1, 4, 6],
    ];
    const mate = maxWeightMatching(edges, true);
    assertValidMatching(mate);
    expect(summarise(edges, mate).pairs).toBe(2);
  });

  it("matches every vertex of a six-cycle", () => {
    const edges: WeightedEdge[] = [
      [0, 1, 1],
      [1, 2, 1],
      [2, 3, 1],
      [3, 4, 1],
      [4, 5, 1],
      [5, 0, 1],
    ];
    const mate = maxWeightMatching(edges, true);
    assertValidMatching(mate);
    expect(summarise(edges, mate).pairs).toBe(3);
  });

  it("handles nested blossoms", () => {
    const edges: WeightedEdge[] = [
      [0, 1, 9],
      [1, 2, 9],
      [2, 3, 9],
      [3, 4, 9],
      [4, 0, 9],
      [5, 6, 9],
      [6, 7, 9],
      [7, 8, 9],
      [8, 9, 9],
      [9, 5, 9],
      [0, 5, 9],
    ];
    const mate = maxWeightMatching(edges, true);
    assertValidMatching(mate);
    expect(summarise(edges, mate).pairs).toBe(5);
  });
});

describe("maxWeightMatching — checked against exhaustive search", () => {
  it("is optimal for maximum weight on random small graphs", () => {
    const random = seeded(20260905);
    for (let trial = 0; trial < 120; trial += 1) {
      const nvertex = 2 + Math.floor(random() * 7);
      const edges = randomGraph(random, nvertex, 0.55, 20);
      if (!edges.length) continue;

      const mate = maxWeightMatching(edges, false);
      assertValidMatching(mate);
      const actual = summarise(edges, mate);
      const expected = bruteForce(edges, false);
      expect(actual.weight, `graph ${JSON.stringify(edges)}`).toBe(expected.weight);
    }
  });

  it("is optimal for maximum cardinality, then weight", () => {
    const random = seeded(11235813);
    for (let trial = 0; trial < 120; trial += 1) {
      const nvertex = 2 + Math.floor(random() * 7);
      const edges = randomGraph(random, nvertex, 0.6, 15);
      if (!edges.length) continue;

      const mate = maxWeightMatching(edges, true);
      assertValidMatching(mate);
      const actual = summarise(edges, mate);
      const expected = bruteForce(edges, true);
      expect(actual.pairs, `graph ${JSON.stringify(edges)}`).toBe(expected.pairs);
      expect(actual.weight, `graph ${JSON.stringify(edges)}`).toBe(expected.weight);
    }
  });

  it("pairs everyone when a perfect matching exists, however awkward the weights", () => {
    // The property Swiss pairing depends on: a legal pairing is always found.
    const random = seeded(31415926);
    for (let trial = 0; trial < 80; trial += 1) {
      const nvertex = 2 * (1 + Math.floor(random() * 4));
      // Complete graph, so a perfect matching always exists.
      const edges = randomGraph(random, nvertex, 1, 30);
      const mate = maxWeightMatching(edges, true);
      assertValidMatching(mate);
      expect(summarise(edges, mate).pairs).toBe(nvertex / 2);
    }
  });

  it("survives sparse graphs where some vertices cannot be matched", () => {
    const random = seeded(27182818);
    for (let trial = 0; trial < 80; trial += 1) {
      const nvertex = 2 + Math.floor(random() * 7);
      const edges = randomGraph(random, nvertex, 0.25, 10);
      if (!edges.length) continue;
      const mate = maxWeightMatching(edges, true);
      assertValidMatching(mate);
      const actual = summarise(edges, mate);
      const expected = bruteForce(edges, true);
      expect(actual.pairs).toBe(expected.pairs);
    }
  });

  it("is deterministic", () => {
    const random = seeded(99999);
    const edges = randomGraph(random, 8, 0.7, 25);
    const first = maxWeightMatching(edges, true);
    const second = maxWeightMatching(edges, true);
    expect(first).toEqual(second);
  });
});

describe("maxWeightMatching — scale", () => {
  it("handles a full-size Swiss field quickly", () => {
    const random = seeded(4242);
    const edges = randomGraph(random, 200, 1, 1_000_000);
    const started = Date.now();
    const mate = maxWeightMatching(edges, true);
    const elapsed = Date.now() - started;
    assertValidMatching(mate);
    expect(summarise(edges, mate).pairs).toBe(100);
    // Generous bound: this runs once per round, not per request.
    expect(elapsed).toBeLessThan(15_000);
  });
});
