/**
 * Glicko-2, with Lichess's settings (lila modules/rating Glicko.scala and
 * scalachess rating/glicko): new players start at 1500 / RD 500 / volatility
 * 0.09, tau is 0.75, RD is clamped to 45..500, volatility to at most 0.1,
 * ratings to 400..4000, one game moves a rating by at most 700, and RD grows
 * back with inactivity at 0.21436 rating periods per day. Each game is rated
 * on its own, as Lichess does (scalachess GlickoCalculator.computeGame).
 *
 * Pure. Reference: Glickman, "Example of the Glicko-2 system" (2012).
 */

export type Glicko = { rating: number; deviation: number; volatility: number };

export const GLICKO_DEFAULT: Glicko = { rating: 1500, deviation: 500, volatility: 0.09 };
export const GLICKO_TAU = 0.75;
export const MIN_DEVIATION = 45;
export const MAX_DEVIATION = 500;
export const MAX_VOLATILITY = 0.1;
export const MIN_RATING = 400;
export const MAX_RATING = 4000;
export const MAX_RATING_DELTA = 700;
export const RATING_PERIODS_PER_DAY = 0.21436;
/** scalachess provisionalDeviation: a rating with RD of 110 or more is provisional ("?"). */
export const PROVISIONAL_DEVIATION = 110;

const SCALE = 173.7178;
const EPSILON = 0.000001;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function isProvisional(glicko: Pick<Glicko, "deviation">) {
  return glicko.deviation >= PROVISIONAL_DEVIATION;
}

/** RD after `days` without a game (scalachess previewDeviation). */
export function deviationAfterInactivity(glicko: Glicko, days: number) {
  if (!(days > 0)) return glicko.deviation;
  const phi = glicko.deviation / SCALE;
  const periods = days * RATING_PERIODS_PER_DAY;
  return clamp(Math.sqrt(phi * phi + glicko.volatility * glicko.volatility * periods) * SCALE, MIN_DEVIATION, MAX_DEVIATION);
}

function g(phi: number) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expected(mu: number, muOpponent: number, phiOpponent: number) {
  return 1 / (1 + Math.exp(-g(phiOpponent) * (mu - muOpponent)));
}

/** New volatility (Glickman step 5, the Illinois algorithm). */
function nextVolatility(phi: number, sigma: number, delta: number, v: number) {
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const d = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d * d) - (x - a) / (GLICKO_TAU * GLICKO_TAU);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * GLICKO_TAU) < 0) k += 1;
    B = a - k * GLICKO_TAU;
  }
  let fA = f(A);
  let fB = f(B);
  for (let guard = 0; Math.abs(B - A) > EPSILON && guard < 200; guard += 1) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

/** One player's rating after one game. `score` is 1, 0.5 or 0. Both inputs are the pre-game values. */
export function rateOne(player: Glicko, opponent: Glicko, score: number): Glicko {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.deviation / SCALE;
  const muJ = (opponent.rating - 1500) / SCALE;
  const phiJ = opponent.deviation / SCALE;

  const E = expected(mu, muJ, phiJ);
  const gJ = g(phiJ);
  const v = 1 / (gJ * gJ * E * (1 - E));
  const delta = v * gJ * (score - E);
  const sigma = nextVolatility(phi, player.volatility, delta, v);
  const phiStar = Math.sqrt(phi * phi + sigma * sigma);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * gJ * (score - E);

  const rawRating = muNew * SCALE + 1500;
  const rating = clamp(
    clamp(rawRating, player.rating - MAX_RATING_DELTA, player.rating + MAX_RATING_DELTA),
    MIN_RATING,
    MAX_RATING
  );
  return {
    rating,
    deviation: clamp(phiNew * SCALE, MIN_DEVIATION, MAX_DEVIATION),
    volatility: Math.min(MAX_VOLATILITY, sigma),
  };
}

/** Both players' new ratings after a game between them. `whiteScore` is 1, 0.5 or 0. */
export function rateGame(white: Glicko, black: Glicko, whiteScore: number) {
  return { white: rateOne(white, black, whiteScore), black: rateOne(black, white, 1 - whiteScore) };
}
