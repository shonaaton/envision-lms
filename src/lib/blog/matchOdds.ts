/**
 * Chances of winning a fixed-length chess match from per-game chances.
 *
 * Used by the match predictor on the World Championship predictions post. The
 * match ends early once someone is out of reach, but stopping early never
 * changes who wins, so the full 14 games are counted and the result is exact.
 *
 * Every game is treated alike: the per-game chances already average out the
 * white and black games, and nerves or a comeback are left to the reader's
 * sliders.
 */

export type MatchOdds = {
  /** Player A wins the match, tiebreak share included. */
  a: number;
  b: number;
  /** The classical games end level and go to tiebreaks. */
  tiebreak: number;
  /** Final classical score as A's points (in halves) → chance, for the most likely scores. */
  scores: { aPoints: number; chance: number }[];
};

export function matchOdds(
  aWin: number,
  bWin: number,
  { games = 14, tiebreakA = 0.5 }: { games?: number; tiebreakA?: number } = {},
): MatchOdds {
  const a = clamp(aWin);
  const b = clamp(Math.min(bWin, 1 - a));
  const draw = 1 - a - b;

  // dist[k] = chance that A has k half-points after the games so far.
  let dist = [1];
  for (let game = 0; game < games; game += 1) {
    const next = new Array(dist.length + 2).fill(0);
    dist.forEach((chance, halves) => {
      next[halves] += chance * b;
      next[halves + 1] += chance * draw;
      next[halves + 2] += chance * a;
    });
    dist = next;
  }

  const level = games; // half-points for a level score, e.g. 14 halves = 7 points
  let aOutright = 0;
  let bOutright = 0;
  dist.forEach((chance, halves) => {
    if (halves > level) aOutright += chance;
    else if (halves < level) bOutright += chance;
  });
  const tiebreak = dist[level] ?? 0;
  const tb = clamp(tiebreakA);

  return {
    a: aOutright + tiebreak * tb,
    b: bOutright + tiebreak * (1 - tb),
    tiebreak,
    scores: dist
      .map((chance, halves) => ({ aPoints: halves / 2, chance }))
      .sort((x, y) => y.chance - x.chance),
  };
}

/** Elo's expected score for the player rated `diff` points higher. */
export function eloExpected(diff: number) {
  return 1 / (1 + 10 ** (-diff / 400));
}

function clamp(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
