type RateLimitRecord = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
};

declare global {
  var _requestRateLimits: Map<string, RateLimitRecord> | undefined;
}

const rateLimitStore = global._requestRateLimits ?? new Map<string, RateLimitRecord>();
if (!global._requestRateLimits) global._requestRateLimits = rateLimitStore;

/**
 * Keys are per IP and per login name, so without pruning the store grows with
 * every visitor for as long as the process runs. Expired records are dropped
 * once the store passes SWEEP_AT; if a flood from many addresses keeps it above
 * MAX_KEYS even then, the oldest records go - forgetting a stranger's counter
 * is better than running out of memory.
 */
const SWEEP_AT = 5_000;
const MAX_KEYS = 50_000;

export function pruneExpiredEntries<T extends { resetAt: number }>(store: Map<string, T>, now = Date.now(), sweepAt = SWEEP_AT, maxKeys = MAX_KEYS) {
  if (store.size < sweepAt) return;
  store.forEach((record, key) => {
    if (record.resetAt <= now) store.delete(key);
  });
  if (store.size <= maxKeys) return;
  // Maps iterate in insertion order, so this drops the longest-held keys first.
  for (const key of store.keys()) {
    if (store.size <= maxKeys) break;
    store.delete(key);
  }
}

function normalizeIp(value: string) {
  return String(value || "").trim() || "unknown";
}

function readHeader(headers: Headers | { get?(name: string): string | null | undefined; [key: string]: unknown }, name: string) {
  if (typeof (headers as Headers)?.get === "function") return (headers as Headers).get(name) || "";
  const direct = (headers as Record<string, unknown>)[name];
  const lower = (headers as Record<string, unknown>)[name.toLowerCase()];
  return String(direct || lower || "");
}

export function getClientIp(headers: Headers | { get?(name: string): string | null | undefined; [key: string]: unknown }) {
  const forwardedFor = readHeader(headers, "x-forwarded-for").split(",")[0]?.trim();
  const realIp = readHeader(headers, "x-real-ip").trim();
  const cfConnectingIp = readHeader(headers, "cf-connecting-ip").trim();
  return normalizeIp(forwardedFor || realIp || cfConnectingIp);
}

export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const normalizedKey = String(key || "").trim();
  const existing = rateLimitStore.get(normalizedKey);
  if (!existing || existing.resetAt <= now) {
    pruneExpiredEntries(rateLimitStore, now);
    rateLimitStore.set(normalizedKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, limit, remaining: Math.max(0, limit - 1), retryAfterMs: windowMs };
  }
  if (existing.count >= limit) {
    return { allowed: false, limit, remaining: 0, retryAfterMs: Math.max(0, existing.resetAt - now) };
  }
  existing.count += 1;
  rateLimitStore.set(normalizedKey, existing);
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterMs: Math.max(0, existing.resetAt - now),
  };
}

/** Give back one attempt, for limits that should only count failures. */
export function releaseRateLimit(key: string) {
  const existing = rateLimitStore.get(String(key || "").trim());
  if (existing && existing.count > 0) existing.count -= 1;
}

export function jsonRateLimitHeaders(result: RateLimitResult) {
  return {
    "Retry-After": String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
  };
}
