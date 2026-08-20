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

export function jsonRateLimitHeaders(result: RateLimitResult) {
  return {
    "Retry-After": String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
  };
}
