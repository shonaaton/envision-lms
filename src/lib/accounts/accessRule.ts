/**
 * Who may open Accounts. Pure, so the rule is unit-tested without a session.
 *
 * Accounts is deliberately not a registered feature: anything in the feature
 * registry can be granted to sub-admins or named roles from Feature Access, and
 * the academy's books are for admins only. A named-role user (Marketing, Sales)
 * carries `accessRoleId` and is refused even if their role reads "admin".
 */
export function isAccountsAdmin(user: { id?: unknown; role?: unknown; isActive?: unknown; accessRoleId?: unknown } | null | undefined) {
  if (!user?.id) return false;
  if (user.role !== "admin") return false;
  if (user.isActive === false) return false;
  if (user.accessRoleId) return false;
  return true;
}
