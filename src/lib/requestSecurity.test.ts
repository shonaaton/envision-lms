import { describe, expect, it } from "vitest";

import { consumeRateLimit, pruneExpiredEntries } from "./requestSecurity";

const fill = (count: number, resetAt: (i: number) => number) =>
  new Map(Array.from({ length: count }, (_, i) => [`k${i}`, { count: 1, resetAt: resetAt(i) }]));

describe("pruneExpiredEntries", () => {
  it("does nothing while the store is small", () => {
    const store = fill(10, () => 0);
    pruneExpiredEntries(store, 100, 50, 100);
    expect(store.size).toBe(10);
  });

  it("drops expired records once the store is large", () => {
    const store = fill(60, (i) => (i % 2 ? 50 : 500));
    pruneExpiredEntries(store, 100, 50, 100);
    expect(store.size).toBe(30);
    expect([...store.values()].every((record) => record.resetAt > 100)).toBe(true);
  });

  it("caps the store under a flood of live keys, dropping the oldest first", () => {
    const store = fill(150, () => 1_000);
    pruneExpiredEntries(store, 100, 50, 100);
    expect(store.size).toBe(100);
    expect(store.has("k0")).toBe(false);
    expect(store.has("k149")).toBe(true);
  });
});

describe("consumeRateLimit", () => {
  it("still counts and refuses as before", () => {
    const key = `test:${Math.random()}`;
    expect(consumeRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(consumeRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(consumeRateLimit(key, 2, 60_000).allowed).toBe(false);
  });
});
