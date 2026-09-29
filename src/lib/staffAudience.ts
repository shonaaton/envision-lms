/**
 * Who hears about academy-wide operations (demo requests, class problems, CRM
 * events): admins and the plain sub-admins who run the academy.
 *
 * Salespeople and marketing staff are also `sub-admin` accounts, told apart
 * only by a named access role (`User.accessRole`), so `role: "sub-admin"` on its
 * own pages them with everything. Anyone on a named role is left out here and
 * hears only what is routed to them personally - a salesperson their own leads.
 * The Tasks "admins" pool draws the same line.
 */
export function coreStaffFilter() {
  return {
    isActive: { $ne: false },
    $or: [{ role: "admin" }, { role: "sub-admin", accessRole: null }],
  };
}
