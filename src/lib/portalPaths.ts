/**
 * The routes that live behind a login, as URL prefixes.
 *
 * This list mirrors the route folders in `app/(dashboard)`. It is shared rather
 * than local to one caller because two unrelated things depend on it being
 * right:
 *
 *  - `app/robots.ts` keeps the portal out of search results, and
 *  - `components/marketing/PublicPageTracking` keeps advertising and analytics
 *    scripts off every page a signed-in student can reach.
 *
 * The second one is the reason this must not drift. Our students are children,
 * and section 9(3) of the Digital Personal Data Protection Act, 2023 prohibits
 * tracking and behavioural monitoring of children outright - a parent's consent
 * does not make it lawful. A dashboard route missing from this list would be
 * tracked, so `portalPaths.test.ts` asserts the list still covers every folder
 * in `app/(dashboard)`.
 */
export const portalPaths = [
  "/admin",
  "/analysis",
  "/ask-coach",
  "/attendance",
  "/availability",
  "/booking",
  "/calendar",
  "/chess-profile",
  "/classrooms",
  "/coach-pay",
  "/dashboard",
  "/demo-feedback",
  "/demo-preview",
  "/feedback",
  "/fees",
  "/homework",
  "/instructor",
  "/invoices",
  "/king-hunt",
  "/leaderboard",
  "/learn",
  "/pgn",
  "/play",
  "/profile",
  "/sales",
  "/square-trainer",
  "/tactics-trainer",
  "/tasks",
  "/tournaments",
] as const;

/** Endpoints that serve machines rather than readers. */
export const machinePaths = ["/api/", "/v1/", "/fishnet", "/health", "/tournament-join"] as const;

/** Sign-in surfaces. `/register` is deliberately absent: it is a public landing page. */
export const authPaths = ["/login", "/forgot-password", "/reset-password"] as const;

/**
 * True when `pathname` is inside the signed-in portal.
 *
 * Prefix matching, so "/fees" covers "/fees/invoices" as well, but "/playground"
 * is not matched by "/play" - the next character has to end the segment.
 */
export function isPortalPath(pathname: string | null | undefined) {
  if (!pathname) return false;
  const path = pathname.split("?")[0].split("#")[0];
  return portalPaths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
