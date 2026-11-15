import { canAccessFeature, getFeatureAccessMap, type SessionUser } from "@/lib/featureAccess";

/**
 * Whether students can actually reach a tournament.
 *
 * The tournament pages live in the dashboard, and the dashboard layout sends
 * anyone without Tournaments "view" to /dashboard?restricted=1 - including on
 * every router refresh. For months the student role had no Tournaments
 * permission at all, yet students were still registered, reminded and paired:
 * on 7 Oct and 14 Nov 2026 their board flashed up and they were thrown back to
 * the dashboard, and every one of their games was lost by "no first move".
 *
 * So everything that brings a student into an event checks the same thing the
 * pages check: Tournaments "view" (to open the room) and "join" (to enter).
 */
export const STUDENT_TOURNAMENT_BLOCKED_MESSAGE =
  "Tournaments are not open to your account yet, so you cannot join. Please contact the academy.";

export async function memberCanPlayTournaments(user: SessionUser | null | undefined) {
  if (!user) return false;
  const [view, join] = await Promise.all([
    canAccessFeature("tournaments", user, "view"),
    canAccessFeature("tournaments", user, "join"),
  ]);
  return view && join;
}

export type StudentRoleTournamentAccess = {
  /** Every ordinary student can open and join tournaments. */
  ok: boolean;
  /** Why not, in words an admin can act on; empty when ok. */
  problem: string;
};

/**
 * The student role's Tournaments setting in Feature Access, for the warning on
 * the organiser's screens. It reads the role-level setting only: a per-student
 * override can still let individual students in.
 */
export async function studentRoleTournamentAccess(): Promise<StudentRoleTournamentAccess> {
  const feature: any = (await getFeatureAccessMap()).get("tournaments");
  if (!feature) return { ok: false, problem: "The Tournaments feature is missing from Feature Access." };
  if (feature.status === "disabled") return { ok: false, problem: "Tournaments is switched off in Feature Access." };
  if (feature.status === "coming_soon") return { ok: false, problem: "Tournaments is set to Coming soon in Feature Access, so students cannot open it." };
  if (feature.status === "testing" && !(feature.pilotRoles || []).includes("student")) {
    return { ok: false, problem: "Tournaments is in Testing in Feature Access, and only pilot users and cohorts can open it." };
  }
  const granted: string[] = feature.rolePermissions?.student || [];
  const has = (permission: string) => granted.includes("full") || granted.includes(permission);
  const missing = ["view", "join"].filter((permission) => !has(permission));
  if (missing.length) {
    return {
      ok: false,
      problem: `In Feature Access, the student role is missing Tournaments ${missing.map((p) => (p === "view" ? '"View"' : '"Join Tournament"')).join(" and ")}.`,
    };
  }
  return { ok: true, problem: "" };
}
