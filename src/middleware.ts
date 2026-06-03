import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Edge-safe middleware: uses only the Edge-compatible config (no mongoose, no bcrypt).
export const { auth: middleware } = NextAuth(authConfig);
export default middleware;

export const config = {
  // Skip static assets, _next internals, and the NextAuth API itself.
  matcher: ["/((?!_next/static|_next/image|favicon|logo|stockfish|api/auth).*)"],
};
