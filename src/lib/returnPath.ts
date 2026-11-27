/**
 * Where to send someone after they sign in.
 *
 * A student who opens an exam, class or homework link from WhatsApp or email in
 * a browser where they are not signed in is sent to /login. Before this, the
 * login page always went on to /dashboard, so the link they tapped was lost and
 * it looked like the portal "redirected them away" from the exam.
 *
 * Only a path on this site is accepted ("/exams/123"), never another host
 * ("//evil.test", "/\\evil.test", "https://..."), so the parameter cannot be
 * used to send someone off the site after they sign in.
 */
export const DEFAULT_RETURN_PATH = "/dashboard";

export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_RETURN_PATH;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return DEFAULT_RETURN_PATH;
  if (/[\u0000-\u001f]/.test(path)) return DEFAULT_RETURN_PATH;
  // Back to the sign-in screens or the auth API would loop or sign them out.
  if (/^\/(login|register|forgot-password|reset-password)(\/|\?|#|$)/.test(path) || path.startsWith("/api/")) return DEFAULT_RETURN_PATH;
  return path;
}

/** The login URL that brings the visitor back to `pathname` once they sign in. */
export function loginPathFor(pathname: string | null | undefined): string {
  const back = safeReturnPath(pathname || "");
  return back === DEFAULT_RETURN_PATH ? "/login" : `/login?callbackUrl=${encodeURIComponent(back)}`;
}
