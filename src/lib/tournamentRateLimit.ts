type Bucket = { tokens: number; updatedAt: number };

declare global {
  var _tournamentRateBuckets: Map<string, Bucket> | undefined;
}

const buckets = global._tournamentRateBuckets ?? new Map<string, Bucket>();
if (!global._tournamentRateBuckets) global._tournamentRateBuckets = buckets;

/**
 * Token-bucket limits for tournament mutations.
 *
 * Sized for blitz, not for a generic API: a 1+0 game legitimately produces
 * several moves per second, so the move bucket is deliberately generous and
 * refills fast. The tight limits are on the endpoints that cost real work.
 */
export const TOURNAMENT_LIMITS = {
  /** Bursty by nature; a premove chain can fire several in a moment. */
  move: { capacity: 60, refillPerSecond: 8 },
  /** Resign, draw, berserk: deliberate actions, never spammed legitimately. */
  result: { capacity: 12, refillPerSecond: 0.5 },
  /** Heartbeat every 10s per board; allow for a few tabs and a reconnect. */
  presence: { capacity: 20, refillPerSecond: 1 },
  /** The heaviest read in the app, so the most worth protecting. */
  state: { capacity: 30, refillPerSecond: 1 },
} as const;

export type LimitName = keyof typeof TOURNAMENT_LIMITS;

const SWEEP_AFTER_MS = 5 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < SWEEP_AFTER_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.updatedAt > SWEEP_AFTER_MS) buckets.delete(key);
  }
}

/**
 * Consume one token. Returns whether the request may proceed, and how long to
 * wait if not.
 */
export function consumeTournamentRate(name: LimitName, identity: string) {
  const limit = TOURNAMENT_LIMITS[name];
  const now = Date.now();
  sweep(now);

  const key = `${name}:${identity || "anonymous"}`;
  const existing = buckets.get(key);
  if (!existing) {
    buckets.set(key, { tokens: limit.capacity - 1, updatedAt: now });
    return { allowed: true, retryAfterMs: 0 };
  }

  const refill = ((now - existing.updatedAt) / 1000) * limit.refillPerSecond;
  const tokens = Math.min(limit.capacity, existing.tokens + refill);
  if (tokens < 1) {
    existing.tokens = tokens;
    existing.updatedAt = now;
    return { allowed: false, retryAfterMs: Math.ceil(((1 - tokens) / limit.refillPerSecond) * 1000) };
  }

  buckets.set(key, { tokens: tokens - 1, updatedAt: now });
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Identity for limiting: the signed-in user, the guest username, or the client
 * address. Never the address alone for a signed-in user — a whole classroom
 * commonly shares one NAT and must not share one budget.
 */
export function rateIdentity(input: { userId?: string; guestUsername?: string; request?: Request }) {
  if (input.userId) return `user:${input.userId}`;
  if (input.guestUsername) return `guest:${input.guestUsername.toLowerCase()}`;
  const headers = input.request?.headers;
  const forwarded = String(headers?.get("x-forwarded-for") || "").split(",")[0]?.trim();
  return `ip:${forwarded || headers?.get("x-real-ip") || "unknown"}`;
}

export function rateLimitedResponse(retryAfterMs: number) {
  return new Response(JSON.stringify({ error: "You are sending requests too quickly. Please slow down." }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
    },
  });
}
