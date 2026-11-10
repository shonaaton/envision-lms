/**
 * Who the free demo form's leads are shared between, and in what order.
 *
 * The order is a list of first names, matched against staff accounts rather than
 * pinned to ids, so it follows whoever holds the account. Lead 1 goes to the
 * first name, lead 2 to the second, lead 3 back to the first.
 * `DEMO_LEAD_ROTATION="mohammed,sayandeb"` overrides it; an entry may be an
 * email address when a first name is not enough to tell two accounts apart.
 *
 * Pure, so the turn-taking can be tested without a database. The counter and
 * the staff lookup are in demoLeadCrm.ts.
 */

export const DEFAULT_DEMO_LEAD_ROTATION = ["mohammed", "sayandeb"];

export type RotationCandidate = { userId: string; name: string; email: string; isSales: boolean };

export function demoLeadRotationNames(raw = process.env.DEMO_LEAD_ROTATION) {
  const names = String(raw || "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return names.length ? names : DEFAULT_DEMO_LEAD_ROTATION;
}

function words(value: string) {
  return String(value || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** The one account a rotation entry means, or null when it matches nobody or cannot choose. */
function accountFor(entry: string, candidates: RotationCandidate[]) {
  const matched = entry.includes("@")
    ? candidates.filter((candidate) => candidate.email.toLowerCase() === entry)
    : candidates.filter((candidate) => words(candidate.name).includes(entry));
  if (matched.length === 1) return matched[0];
  // "Mohammed" on the sales role is the salesperson; another Mohammed on staff is not.
  const sales = matched.filter((candidate) => candidate.isSales);
  return sales.length === 1 ? sales[0] : null;
}

/** The rotation as accounts, in order. Entries that resolve to nobody are dropped, so the rest still take turns. */
export function resolveDemoLeadRotation(names: string[], candidates: RotationCandidate[]) {
  const seen = new Set<string>();
  return names
    .map((name) => accountFor(name, candidates))
    .filter((candidate): candidate is RotationCandidate => {
      if (!candidate || seen.has(candidate.userId)) return false;
      seen.add(candidate.userId);
      return true;
    });
}

/** `turn` counts from 1: the first lead ever is turn 1 and goes to the first name. */
export function demoLeadOwnerForTurn<T>(turn: number, rotation: T[]): T | null {
  if (!rotation.length) return null;
  return rotation[(((turn - 1) % rotation.length) + rotation.length) % rotation.length];
}
