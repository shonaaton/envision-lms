/**
 * A short-lived, in-process cache for the records behind every permission check.
 *
 * `auth()`, the dashboard layout and each API route used to re-read the same
 * user record, access role and feature settings from MongoDB on every request -
 * several times per page, and every second from each open live classroom. On
 * the Atlas free plan's 100 operations a second that was a large share of the
 * budget for data that almost never changes.
 *
 * Freshness rules:
 * - A change saved through the app clears the affected entries at once, through
 *   the Mongoose hooks on the User, AccessRole and FeatureAccess models. So a
 *   deactivation, a pause, a role or permission edit applies on the next request,
 *   as it did before.
 * - Anything else - a script or a manual database edit - is picked up within
 *   PERMISSION_CACHE_TTL_MS. The academy agreed to that 30 second window.
 * - Batch and course membership (only used for pilot "testing" features) and
 *   Learn Chess eligibility have no hook and rely on the same 30 second expiry.
 *
 * The store lives on `globalThis`: Next.js bundles route handlers, pages and the
 * instrumentation hook separately, and a write in any of them must clear the
 * one cache all of them read. This module imports no models so the model files
 * can import it.
 */

export const PERMISSION_CACHE_TTL_MS = 30_000;

/** Above this many entries a bucket drops its expired ones before adding more. */
const SWEEP_THRESHOLD = 2_000;

type Entry = { promise: Promise<unknown>; expiresAt: number };

/**
 * - features: the normalised FeatureAccess settings (one entry)
 * - users: the user fields permission checks read, per user
 * - roles: the resolved named access role, per user
 * - cohorts: batch and course ids, per user, for pilot features; and, keyed
 *   `learnChess:<id>`, whether a student's classes open Learn Chess
 * - flags: academy-wide facts, such as whether an explicit super admin exists
 */
type Bucket = "features" | "users" | "roles" | "cohorts" | "flags";
type Store = Record<Bucket, Map<string, Entry>>;

declare global {
  var __lmsPermissionCache: Store | undefined;
}

function store(): Store {
  if (!globalThis.__lmsPermissionCache) {
    globalThis.__lmsPermissionCache = {
      features: new Map(),
      users: new Map(),
      roles: new Map(),
      cohorts: new Map(),
      flags: new Map(),
    };
  }
  return globalThis.__lmsPermissionCache;
}

function sweep(map: Map<string, Entry>, now: number) {
  if (map.size < SWEEP_THRESHOLD) return;
  map.forEach((entry, key) => {
    if (entry.expiresAt <= now) map.delete(key);
  });
}

/**
 * Returns the cached value for `key`, loading it at most once per expiry.
 *
 * The promise is stored when loading starts, so requests arriving together
 * share one database read, and an invalidation that lands mid-load removes the
 * entry rather than letting the older result be stored afterwards. A failed
 * load is not cached.
 *
 * Callers receive the shared value: they must copy anything they intend to
 * change.
 */
export function cachedPermissionValue<T>(bucket: Bucket, key: string, load: () => Promise<T>): Promise<T> {
  const map = store()[bucket];
  const now = Date.now();
  const existing = map.get(key);
  if (existing && existing.expiresAt > now) return existing.promise as Promise<T>;
  sweep(map, now);
  const promise = load();
  const entry: Entry = { promise, expiresAt: now + PERMISSION_CACHE_TTL_MS };
  map.set(key, entry);
  promise.catch(() => {
    if (map.get(key) === entry) map.delete(key);
  });
  return promise;
}

/** Any FeatureAccess write: status, role permissions, pilots or overrides. */
export function invalidateFeatureAccessCache() {
  store().features.clear();
}

/** Any AccessRole write. Every user's resolved role may have changed. */
export function invalidateAccessRoleCache() {
  store().roles.clear();
}

/**
 * A User write. `userIds` names the accounts it touched; `null` means it could
 * not be told (an `updateMany`, or a filter that is not by `_id`), so every
 * user's entries go. Whether an explicit super admin exists can change with any
 * user write, so that flag always goes.
 */
export function invalidateUserPermissionCache(userIds: string[] | null) {
  const { users, roles, cohorts, flags } = store();
  flags.clear();
  if (!userIds) {
    users.clear();
    roles.clear();
    cohorts.clear();
    return;
  }
  for (const id of userIds) {
    users.delete(id);
    roles.delete(id);
    cohorts.delete(id);
  }
}

function idString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof (value as { toHexString?: unknown }).toHexString === "function") {
    return (value as { toHexString: () => string }).toHexString();
  }
  return null;
}

/**
 * The user ids a write filter targets, or `null` when they cannot be read off
 * it. Handles `{ _id }`, `{ _id: { $eq } }` and `{ _id: { $in } }`; anything
 * else clears the whole user cache, which is always safe.
 */
export function userIdsFromFilter(filter: unknown): string[] | null {
  const id = (filter as { _id?: unknown } | null | undefined)?._id;
  const direct = idString(id);
  if (direct) return [direct];
  if (id && typeof id === "object") {
    const operators = id as { $eq?: unknown; $in?: unknown };
    const keys = Object.keys(operators);
    if (keys.length === 1 && keys[0] === "$eq") {
      const eq = idString(operators.$eq);
      return eq ? [eq] : null;
    }
    if (keys.length === 1 && keys[0] === "$in" && Array.isArray(operators.$in)) {
      const ids = operators.$in.map(idString);
      return ids.every(Boolean) ? (ids as string[]) : null;
    }
  }
  return null;
}

/** Every Mongoose query operation that can change or remove documents. */
export const WRITE_QUERY_MIDDLEWARE = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findOneAndReplace",
  "findOneAndDelete",
  "replaceOne",
  "deleteOne",
  "deleteMany",
] as const;
