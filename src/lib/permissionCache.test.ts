import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

import {
  PERMISSION_CACHE_TTL_MS,
  cachedPermissionValue,
  invalidateAccessRoleCache,
  invalidateFeatureAccessCache,
  invalidateUserPermissionCache,
  userIdsFromFilter,
} from "./permissionCache";

const A = "aaaaaaaaaaaaaaaaaaaaaaa1";
const B = "aaaaaaaaaaaaaaaaaaaaaaa2";

function counter<T>(value: T) {
  const load = vi.fn(async () => value);
  return load;
}

beforeEach(() => {
  globalThis.__lmsPermissionCache = undefined;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cachedPermissionValue", () => {
  it("reads once and serves the same value until it expires", async () => {
    const load = counter({ role: "student" });
    expect(await cachedPermissionValue("users", A, load)).toEqual({ role: "student" });
    vi.advanceTimersByTime(PERMISSION_CACHE_TTL_MS - 1);
    await cachedPermissionValue("users", A, load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reads again once the 30 seconds are up", async () => {
    const load = counter(1);
    await cachedPermissionValue("users", A, load);
    vi.advanceTimersByTime(PERMISSION_CACHE_TTL_MS);
    await cachedPermissionValue("users", A, load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(PERMISSION_CACHE_TTL_MS).toBe(30_000);
  });

  it("shares one read between requests that arrive together", async () => {
    let release!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    const first = cachedPermissionValue("users", A, load);
    const second = cachedPermissionValue("users", A, load);
    release("x");
    expect(await first).toBe("x");
    expect(await second).toBe("x");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps entries apart by bucket and by key", async () => {
    const load = counter("v");
    await cachedPermissionValue("users", A, load);
    await cachedPermissionValue("users", B, load);
    await cachedPermissionValue("roles", A, load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not cache a failed read", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce("ok");
    await expect(cachedPermissionValue("users", A, load)).rejects.toThrow("db down");
    await Promise.resolve();
    expect(await cachedPermissionValue("users", A, load)).toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("never stores a read that an invalidation overtook", async () => {
    let release!: (value: string) => void;
    const slow = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    const stale = cachedPermissionValue("users", A, slow);
    invalidateUserPermissionCache([A]); // e.g. the account was deactivated mid-read
    const fresh = counter("fresh");
    expect(await cachedPermissionValue("users", A, fresh)).toBe("fresh");
    release("stale");
    await stale;
    expect(await cachedPermissionValue("users", A, counter("unused"))).toBe("fresh");
  });
});

describe("invalidation", () => {
  async function prime() {
    for (const bucket of ["users", "roles", "cohorts"] as const) {
      await cachedPermissionValue(bucket, A, counter(`${bucket}-A`));
      await cachedPermissionValue(bucket, B, counter(`${bucket}-B`));
    }
    await cachedPermissionValue("features", "all", counter("features"));
    await cachedPermissionValue("flags", "explicitSuperAdminExists", counter(true));
  }
  const isCached = async (bucket: Parameters<typeof cachedPermissionValue>[0], key: string) => {
    const probe = counter("probe");
    await cachedPermissionValue(bucket, key, probe);
    return probe.mock.calls.length === 0;
  };

  it("a write to one account clears only that account, plus the super admin flag", async () => {
    await prime();
    invalidateUserPermissionCache([A]);
    expect(await isCached("users", A)).toBe(false);
    expect(await isCached("roles", A)).toBe(false);
    expect(await isCached("cohorts", A)).toBe(false);
    expect(await isCached("flags", "explicitSuperAdminExists")).toBe(false);
    expect(await isCached("users", B)).toBe(true);
    expect(await isCached("roles", B)).toBe(true);
    expect(await isCached("features", "all")).toBe(true);
  });

  it("a write it cannot pin to accounts clears every account", async () => {
    await prime();
    invalidateUserPermissionCache(null);
    expect(await isCached("users", A)).toBe(false);
    expect(await isCached("users", B)).toBe(false);
    expect(await isCached("roles", B)).toBe(false);
    expect(await isCached("cohorts", B)).toBe(false);
    expect(await isCached("features", "all")).toBe(true);
  });

  it("a role write clears every resolved role and nothing else", async () => {
    await prime();
    invalidateAccessRoleCache();
    expect(await isCached("roles", A)).toBe(false);
    expect(await isCached("roles", B)).toBe(false);
    expect(await isCached("users", A)).toBe(true);
    expect(await isCached("features", "all")).toBe(true);
  });

  it("a feature settings write clears the settings and nothing else", async () => {
    await prime();
    invalidateFeatureAccessCache();
    expect(await isCached("features", "all")).toBe(false);
    expect(await isCached("users", A)).toBe(true);
    expect(await isCached("roles", A)).toBe(true);
  });
});

describe("userIdsFromFilter", () => {
  const oid = new Types.ObjectId(A);

  it("reads a single id, as an ObjectId or a string", () => {
    expect(userIdsFromFilter({ _id: oid })).toEqual([A]);
    expect(userIdsFromFilter({ _id: A })).toEqual([A]);
    expect(userIdsFromFilter({ _id: oid, role: "admin" })).toEqual([A]);
  });

  it("reads $eq and $in", () => {
    expect(userIdsFromFilter({ _id: { $eq: oid } })).toEqual([A]);
    expect(userIdsFromFilter({ _id: { $in: [oid, B] } })).toEqual([A, B]);
  });

  it("gives up - so everything is cleared - on anything else", () => {
    expect(userIdsFromFilter({})).toBeNull();
    expect(userIdsFromFilter(undefined)).toBeNull();
    expect(userIdsFromFilter({ email: "x@y.z" })).toBeNull();
    expect(userIdsFromFilter({ _id: { $ne: oid } })).toBeNull();
    expect(userIdsFromFilter({ _id: { $in: [oid, { $gt: 1 }] } })).toBeNull();
    expect(userIdsFromFilter({ _id: { $in: [oid], $nin: [B] } })).toBeNull();
    expect(userIdsFromFilter({ $or: [{ _id: oid }] })).toBeNull();
  });
});
