import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Edge-safe middleware: uses only the Edge-compatible config (no mongoose, no bcrypt).
const { auth: middleware } = NextAuth(authConfig);

export default middleware((request) => {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
});

export const config = {
  // Skip static assets, _next internals, and the NextAuth API itself.
  matcher: ["/((?!_next/static|_next/image|favicon|logo|stockfish|api/auth).*)"],
};
