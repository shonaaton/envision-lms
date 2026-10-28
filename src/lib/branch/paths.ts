/**
 * Where an offline-branch account may go. Edge-safe (middleware imports it):
 * no database, no mongoose.
 *
 * A branch account is confined to its own portal plus the parts of the online
 * academy it shares - tournaments, homework, its own profile and notifications.
 * Everything else is closed to it, whatever its role would otherwise open,
 * because a branch coach is an `instructor` and the online app gives
 * instructors a great deal.
 */

export type BranchStaffRole = "admin" | "manager" | "coach";

const SHARED_PREFIXES = [
  "/bowbazar",
  "/api/bowbazar",
  "/tournaments",
  "/api/tournaments",
  "/homework",
  "/api/homework",
  "/profile",
  "/api/profile",
  "/api/notifications",
  "/api/branding",
  "/api/popups",
  // Homework "play the computer" activities open this board.
  "/play/computer",
  "/api/play/computer",
];

/**
 * The teaching tools a branch's staff use to run its online class over a
 * screen share: the PGN library and the analysis board. Students don't get them.
 */
const STAFF_TOOL_PREFIXES = ["/pgn", "/api/pgn", "/analysis"];

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** A branch student gets their own page from the branch portal, never the staff screens. */
export function isBranchAllowedPath(pathname: string, role?: string) {
  if (role === "student" && (matches(pathname, "/bowbazar") || matches(pathname, "/api/bowbazar"))) {
    return matches(pathname, "/bowbazar/me");
  }
  if (role !== "student" && STAFF_TOOL_PREFIXES.some((prefix) => matches(pathname, prefix))) return true;
  return SHARED_PREFIXES.some((prefix) => matches(pathname, prefix));
}

/** Where a branch account lands instead of the online dashboard. */
export function branchHomePath(role: string | undefined) {
  return role === "student" ? "/bowbazar/me" : "/bowbazar";
}
