import { BRANCHES } from "./scope";
import { branchAccess } from "./rules";
import { getRoleAccess } from "./settings";

/**
 * What a branch account may do, with the branch admin's feature-access
 * choices applied. Pages, APIs and the sidebar all ask this; the pure rule is
 * branchAccess in rules.ts.
 */
export async function resolveBranchAccess(user: { role?: string; branch?: string; branchRole?: string } | null | undefined) {
  if (!user?.branch || !(BRANCHES as readonly string[]).includes(user.branch)) return branchAccess(user);
  const overrides = user.branchRole === "manager" || user.branchRole === "coach" ? await getRoleAccess(user.branch as (typeof BRANCHES)[number]) : null;
  return branchAccess(user, overrides);
}
