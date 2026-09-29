import { cookies } from "next/headers";
import { getSessionAccountState, signOut } from "@/lib/auth";
import { SESSION_ENDED_COOKIE } from "@/lib/sessionNotices";

export const dynamic = "force-dynamic";

/**
 * Where middleware sends a signed-in visitor who opens /login.
 *
 * It used to send them straight to /dashboard. Middleware runs on the Edge and
 * only sees the cookie, so for an account that had since been deleted the
 * dashboard found no account and sent them to /login, which sent them back:
 * the browser bounced between the two until the cookie expired. This route has
 * the database and settles it:
 * - the account exists: on to the dashboard, as before;
 * - it no longer exists: the stale cookie is cleared and the login page opens;
 * - no answer from MongoDB: a "try again" page. Nobody is signed out because
 *   the database was briefly unreachable, and an outage no longer turns every
 *   open tab into a redirect loop against the server.
 *
 * This lives under /api/auth, which middleware skips, so it cannot be bounced
 * itself. Redirects are relative: behind the proxy, the request URL does not
 * carry the public host.
 */
export async function GET() {
  const state = await getSessionAccountState();
  if (state === "missing") {
    // Tells the login page why it is showing. A cookie rather than only the
    // query string: when this chain starts from a client-side navigation, the
    // Next.js router lands on its own target, plain /login, and drops the query.
    cookies().set(SESSION_ENDED_COOKIE, "1", { path: "/", maxAge: 120, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    // Clears the session cookie (with the right name and flags for this host)
    // and redirects; throws, like every Next.js redirect.
    await signOut({ redirectTo: "/login?session=ended" });
  }
  if (state === "exists") return redirectTo("/dashboard");
  if (state === "none") return redirectTo("/login");
  return new Response(UNAVAILABLE_PAGE, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "10", "Cache-Control": "no-store" },
  });
}

function redirectTo(path: string) {
  return new Response(null, { status: 307, headers: { Location: path, "Cache-Control": "no-store" } });
}

const UNAVAILABLE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Envision Chess Academy</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f6f9; color: #0a0a0a; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 26rem; margin: 1rem; padding: 2rem; background: #fff; border-radius: 1rem; box-shadow: 0 10px 30px rgba(90, 19, 114, 0.12); text-align: center; }
  h1 { margin: 0 0 0.5rem; font-size: 1.25rem; }
  p { margin: 0 0 1.5rem; color: #475569; line-height: 1.5; }
  a { display: inline-block; padding: 0.7rem 1.4rem; border-radius: 0.6rem; background: #5a1372; color: #fff; font-weight: 600; text-decoration: none; }
</style>
</head>
<body>
<main>
  <h1>We could not reach your account just now</h1>
  <p>You are still signed in. Please try again in a few seconds.</p>
  <a href="/dashboard">Try again</a>
</main>
</body>
</html>`;
