import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe NextAuth config (no DB imports).
 * Used by middleware.ts which runs in Edge Runtime.
 * The full `auth.ts` extends this with the Credentials provider that hits MongoDB.
 */
export const authConfig = {
  // Trust the proxy host (Traefik in front of us) — required since NextAuth v5
  // refuses to operate behind reverse proxies without this flag.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // populated in auth.ts (Node runtime)
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as any;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = (auth?.user as any)?.role as "student" | "instructor" | "admin" | undefined;

      const isAuthRoute = ["/login", "/register", "/forgot-password", "/reset-password"].some((p) => nextUrl.pathname.startsWith(p));
      const isPublic =
        nextUrl.pathname === "/" ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/register") ||
        nextUrl.pathname.startsWith("/api/password") ||
        nextUrl.pathname.startsWith("/tournament-join");
      const isAdminRoute = nextUrl.pathname.startsWith("/admin");
      const isInstructorRoute = nextUrl.pathname.startsWith("/instructor");
      const isPgnRoute = nextUrl.pathname.startsWith("/pgn");
      const isAnalysisRoute = nextUrl.pathname.startsWith("/analysis");
      const isPlayVsComputerRoute = nextUrl.pathname.startsWith("/play/computer");
      const isFeesRoute = nextUrl.pathname.startsWith("/fees") || nextUrl.pathname.startsWith("/invoices");
      const isTournamentCreateRoute = nextUrl.pathname.startsWith("/tournaments/new");

      if (isPublic) return true;
      if (isAuthRoute) {
        if (isLoggedIn) return Response.redirect(new URL("/dashboard", nextUrl));
        return true;
      }
      if (!isLoggedIn) return false; // triggers redirect to signIn
      if (isAdminRoute && role !== "admin") return Response.redirect(new URL("/dashboard", nextUrl));
      if (isInstructorRoute && role !== "instructor" && role !== "admin")
        return Response.redirect(new URL("/dashboard", nextUrl));
      if (isPgnRoute && role === "student") return Response.redirect(new URL("/dashboard", nextUrl));
      if (isAnalysisRoute && role === "student") return Response.redirect(new URL("/dashboard", nextUrl));
      if (isPlayVsComputerRoute && role === "instructor") return Response.redirect(new URL("/dashboard", nextUrl));
      if (isFeesRoute && role === "instructor") return Response.redirect(new URL("/dashboard", nextUrl));
      if (isTournamentCreateRoute && role !== "admin") return Response.redirect(new URL("/tournaments", nextUrl));
      return true;
    },
  },
} satisfies NextAuthConfig;
