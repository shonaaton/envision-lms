/**
 * Offline branches (Bowbazar today) live in the same database as the online
 * academy, but must never show up in it. Branch students are ordinary
 * `role: "student"` accounts with `User.branch` set, so they keep every student
 * right - tournaments above all - and gain no staff rights.
 *
 * The online app has close to a hundred `role: "student"` queries (digests,
 * invoices, retention, leaderboards, pickers). Rather than edit each one, the
 * User model runs every such query through `scopeStudentFilter`, which adds
 * "and not a branch student" unless the query already says which branch it
 * wants. Branch code always names its branch; lookups of one account by id are
 * left alone so login, profile and permission checks keep working.
 *
 * Pure on purpose - no mongoose import - so it can be unit tested and used from
 * the Edge-safe auth config.
 */

export const BRANCHES = ["bowbazar"] as const;
export type BranchKey = (typeof BRANCHES)[number];

export const BRANCH_LABELS: Record<BranchKey, string> = {
  bowbazar: "Bowbazar",
};

export function isBranchKey(value: unknown): value is BranchKey {
  return typeof value === "string" && (BRANCHES as readonly string[]).includes(value);
}

/** Query option that turns the scope off, for screens that deliberately span every branch. */
export const ALL_BRANCHES_OPTION = "allBranches";

type Filter = Record<string, unknown>;

function isPlainObject(value: unknown): value is Filter {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof RegExp) && !(value instanceof Date);
}

/**
 * Roles a branch account can hold. Branch coaches and the branch manager are
 * `instructor` accounts (the least-privileged staff role), so the online coach
 * lists - pay, leave, invoices, pickers - need the same narrowing as students.
 */
export const BRANCH_SCOPED_ROLES = ["student", "instructor"] as const;
const isScopedRole = (value: unknown) => (BRANCH_SCOPED_ROLES as readonly unknown[]).includes(value);

/** Does a `role` condition admit students or coaches? */
function roleAdmitsScopedRole(condition: unknown): boolean {
  if (isScopedRole(condition)) return true;
  if (!isPlainObject(condition)) return false;
  if (isScopedRole(condition.$eq)) return true;
  if (Array.isArray(condition.$in) && condition.$in.some(isScopedRole)) return true;
  return false;
}

/** Walks the filter, including `$and`/`$or`/`$nor` branches. */
function someCondition(filter: unknown, test: (key: string, value: unknown) => boolean): boolean {
  if (!isPlainObject(filter)) return false;
  for (const [key, value] of Object.entries(filter)) {
    if (key === "$and" || key === "$or" || key === "$nor") {
      if (Array.isArray(value) && value.some((part) => someCondition(part, test))) return true;
      continue;
    }
    if (test(key, value)) return true;
  }
  return false;
}

export function filterTargetsStudents(filter: unknown) {
  return someCondition(filter, (key, value) => key === "role" && roleAdmitsScopedRole(value));
}

export function filterNamesBranch(filter: unknown) {
  return someCondition(filter, (key) => key === "branch");
}

/**
 * A lookup of particular accounts by id - the caller already knows who it
 * wants. `{ _id: { $ne: x } }` ("everyone but x") is not one.
 */
function filterNamesAccounts(filter: unknown) {
  if (!isPlainObject(filter) || filter._id === undefined || filter._id === null) return false;
  const condition = filter._id;
  if (!isPlainObject(condition) || typeof (condition as any).toHexString === "function") return true;
  return condition.$eq !== undefined || condition.$in !== undefined;
}

/**
 * Returns the filter to run, or `null` when it should run unchanged.
 *
 * `{ role: "student" }` becomes `{ role: "student", branch: null }` (null also
 * matches a missing field, which is every online account). A mixed role list
 * keeps admins and sub-admins in and drops only branch accounts.
 */
export function scopeStudentFilter(filter: unknown): Filter | null {
  if (!isPlainObject(filter)) return null;
  if (!filterTargetsStudents(filter) || filterNamesBranch(filter) || filterNamesAccounts(filter)) return null;
  if (isScopedRole(filter.role)) return { ...filter, branch: null };
  const onlineOnly = { $or: [{ role: { $nin: [...BRANCH_SCOPED_ROLES] } }, { branch: null }] };
  const and = Array.isArray(filter.$and) ? [...filter.$and, onlineOnly] : [onlineOnly];
  return { ...filter, $and: and };
}

/** Same rule for an aggregation: only a leading `$match` is scoped. */
export function scopeStudentPipeline(pipeline: unknown[]): unknown[] | null {
  const first = pipeline[0];
  if (!isPlainObject(first) || !isPlainObject(first.$match)) return null;
  const scoped = scopeStudentFilter(first.$match);
  if (!scoped) return null;
  return [{ ...first, $match: scoped }, ...pipeline.slice(1)];
}
