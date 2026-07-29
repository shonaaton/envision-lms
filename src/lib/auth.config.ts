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
        token.isSuperAdmin = (user as any).isSuperAdmin;
        token.isActive = (user as any).isActive;
        token.accountStatus = (user as any).accountStatus;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as any;
        (session.user as any).isSuperAdmin = token.isSuperAdmin as boolean | undefined;
        (session.user as any).isActive = token.isActive as boolean | undefined;
        (session.user as any).accountStatus = token.accountStatus as any;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const role = (auth?.user as any)?.role as "student" | "instructor" | "admin" | undefined;
      const accountStatus = (auth?.user as any)?.accountStatus as string | undefined;
      const isInactiveStudent = role === "student" && (auth?.user as any)?.isActive === false;

      const isAuthRoute = ["/login", "/register", "/forgot-password", "/reset-password"].some((p) => nextUrl.pathname.startsWith(p));
      const isPublic =
        nextUrl.pathname === "/" ||
        nextUrl.pathname === "/privacy" ||
        nextUrl.pathname === "/terms" ||
        nextUrl.pathname === "/refund-policy" ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/register") ||
        nextUrl.pathname.startsWith("/api/password") ||
        nextUrl.pathname.startsWith("/tournament-join");
      const isAdminRoute = nextUrl.pathname.startsWith("/admin");
      const isInstructorRoute = nextUrl.pathname.startsWith("/instructor");
      const isPgnRoute = nextUrl.pathname.startsWith("/pgn");
      const isAnalysisRoute = nextUrl.pathname.startsWith("/analysis");
      const isPlayVsComputerRoute = nextUrl.pathname.startsWith("/play/computer");
      const isSquareTrainerRoute = nextUrl.pathname.startsWith("/play/square-trainer") || nextUrl.pathname.startsWith("/square-trainer");
      const isTacticsTrainerRoute = nextUrl.pathname.startsWith("/play/tactics-trainer") || nextUrl.pathname.startsWith("/tactics-trainer");
      const isKingHuntRoute = nextUrl.pathname.startsWith("/play/king-hunt") || nextUrl.pathname.startsWith("/king-hunt");
      const isBookingRoute = nextUrl.pathname.startsWith("/booking") || nextUrl.pathname.startsWith("/demo-booking");
      const isFeesRoute = nextUrl.pathname.startsWith("/fees") || nextUrl.pathname.startsWith("/invoices");
      const isTournamentCreateRoute = nextUrl.pathname.startsWith("/tournaments/new");
      const demoAllowed =
        nextUrl.pathname.startsWith("/dashboard") ||
        isBookingRoute ||
        isPlayVsComputerRoute ||
        isSquareTrainerRoute ||
        isTacticsTrainerRoute ||
        isKingHuntRoute ||
        nextUrl.pathname.startsWith("/api/bookings") ||
        nextUrl.pathname.startsWith("/api/availability") ||
        nextUrl.pathname.startsWith("/api/play/computer/reward") ||
        nextUrl.pathname.startsWith("/api/square-trainer") ||
        nextUrl.pathname.startsWith("/api/tactics-trainer");

      if (isPublic) return true;
      if (isAuthRoute) return true;
      if (!isLoggedIn) return false; // triggers redirect to signIn
      if (
        isInactiveStudent &&
        (
          nextUrl.pathname.startsWith("/booking") ||
          nextUrl.pathname.startsWith("/classrooms") ||
          nextUrl.pathname.startsWith("/calendar") ||
          nextUrl.pathname.startsWith("/tournaments") ||
          nextUrl.pathname.startsWith("/api/bookings") ||
          nextUrl.pathname.startsWith("/api/classrooms") ||
          nextUrl.pathname.startsWith("/api/tournaments")
        )
      ) return Response.redirect(new URL("/dashboard", nextUrl));
      if (accountStatus === "demo" && !demoAllowed) return Response.redirect(new URL("/dashboard", nextUrl));
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
