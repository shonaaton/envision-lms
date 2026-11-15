import { beforeEach, describe, expect, it, vi } from "vitest";

const feature: { current: any } = { current: null };
vi.mock("@/lib/featureAccess", () => ({
  getFeatureAccessMap: async () => new Map(feature.current ? [["tournaments", feature.current]] : []),
  canAccessFeature: async () => true,
}));

import { studentRoleTournamentAccess } from "./studentAccess";

const base = { key: "tournaments", status: "enabled", pilotRoles: [], rolePermissions: { student: ["view", "join"] } };

describe("studentRoleTournamentAccess", () => {
  beforeEach(() => {
    feature.current = { ...base };
  });

  it("is fine when students may view and join", async () => {
    expect(await studentRoleTournamentAccess()).toEqual({ ok: true, problem: "" });
  });

  it("flags the 14 Nov 2026 setting: no student permissions at all", async () => {
    feature.current = { ...base, rolePermissions: { student: [] } };
    const access = await studentRoleTournamentAccess();
    expect(access.ok).toBe(false);
    expect(access.problem).toContain('"View" and "Join Tournament"');
  });

  it("flags a missing join permission alone", async () => {
    feature.current = { ...base, rolePermissions: { student: ["view"] } };
    expect((await studentRoleTournamentAccess()).problem).toContain('"Join Tournament"');
  });

  it("accepts full access", async () => {
    feature.current = { ...base, rolePermissions: { student: ["full"] } };
    expect((await studentRoleTournamentAccess()).ok).toBe(true);
  });

  it("flags a feature that is off, coming soon, or in testing without students", async () => {
    for (const status of ["disabled", "coming_soon", "testing"]) {
      feature.current = { ...base, status };
      expect((await studentRoleTournamentAccess()).ok).toBe(false);
    }
    feature.current = { ...base, status: "testing", pilotRoles: ["student"] };
    expect((await studentRoleTournamentAccess()).ok).toBe(true);
  });
});
