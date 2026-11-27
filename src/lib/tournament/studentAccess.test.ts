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

describe("coaches can play switch", () => {
  const off = { access: {} };
  const on = { access: { coachesCanPlay: true } };

  it("lets students and admins play in any event", async () => {
    const { roleCanPlayTournament } = await import("./studentAccess");
    for (const role of ["student", "admin"]) {
      expect(roleCanPlayTournament(role, off)).toBe(true);
      expect(roleCanPlayTournament(role, on)).toBe(true);
    }
  });

  it("keeps coaches and sub-admins watching unless the event switches them in", async () => {
    const { roleCanPlayTournament } = await import("./studentAccess");
    for (const role of ["instructor", "sub-admin"]) {
      expect(roleCanPlayTournament(role, off)).toBe(false);
      expect(roleCanPlayTournament(role, null)).toBe(false);
      expect(roleCanPlayTournament(role, on)).toBe(true);
    }
    expect(roleCanPlayTournament("", on)).toBe(false);
  });

  it("counts a coach as a player only in a switched-on event", async () => {
    const { memberCanPlayTournaments } = await import("./studentAccess");
    const coach = { id: "c1", role: "instructor" } as any;
    expect(await memberCanPlayTournaments(coach, off)).toBe(false);
    expect(await memberCanPlayTournaments(coach)).toBe(false);
    expect(await memberCanPlayTournaments(coach, on)).toBe(true);
    expect(await memberCanPlayTournaments({ id: "s1", role: "student" } as any)).toBe(true);
  });
});
