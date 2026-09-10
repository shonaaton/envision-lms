import type { NextAuthConfig } from "next-auth";
import { isInactiveRestrictedPath } from "./inactiveAccess";

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
      const role = (auth?.user as any)?.role as "student" | "instructor" | "admin" | "sub-admin" | undefined;
      const accountStatus = (auth?.user as any)?.accountStatus as string | undefined;
      const isInactiveAccount = (auth?.user as any)?.isActive === false;

      const isLoginRoute = nextUrl.pathname.startsWith("/login");
      const isAuthRoute = ["/login", "/register", "/forgot-password", "/reset-password"].some((p) => nextUrl.pathname.startsWith(p));
      const isPublic =
        nextUrl.pathname === "/" ||
        nextUrl.pathname === "/privacy" ||
        nextUrl.pathname === "/terms" ||
        nextUrl.pathname === "/refund-policy" ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/webhooks") ||
        nextUrl.pathname.startsWith("/api/webhook") ||
        // The CRM webhook carries no session - it authenticates with the
        // X-KRAYA-WEBHOOK-SECRET header, which the route itself verifies. Without
        // this line middleware answers Kraya with a redirect to /login, and Kraya
        // treats any non-200 as a delivery failure.
        nextUrl.pathname.startsWith("/api/crm/kraya/webhook") ||
        nextUrl.pathname.startsWith("/api/register") ||
        nextUrl.pathname.startsWith("/api/password") ||
        nextUrl.pathname.startsWith("/api/fees/invoices") ||
        nextUrl.pathname.startsWith("/tournament-join");
      // The sales workspace is staff-only. The real gate is the feature check in
      // (dashboard)/layout.tsx; this is the coarse outer shell, same as /admin.
      const isAdminRoute = nextUrl.pathname.startsWith("/admin") || nextUrl.pathname.startsWith("/sales");
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
      // An approved demo is a real class in a real classroom: the demo dashboard
      // renders the same join button an enrolled student gets, the sidebar adds
      // Classrooms and Homework once the classroom exists, and the starter
      // assignment and the linked chess accounts are the student's own records.
      // Those destinations have to be reachable, or the join button opens Google
      // Meet in a new tab and the live board bounces straight back to the
      // dashboard - which is exactly what happened before these were listed.
      //
      // Middleware runs on the Edge with no database, so it cannot tell whether
      // this account is on that classroom's roster. It does not need to: the
      // live classroom page, `getLiveClassroomForUser` and the homework routes
      // each check membership themselves. This list only decides which doors a
      // demo account may knock on.
      const isClassroomRoute =
        nextUrl.pathname.startsWith("/classrooms") || nextUrl.pathname.startsWith("/api/classrooms");
      const isHomeworkRoute =
        nextUrl.pathname.startsWith("/homework") || nextUrl.pathname.startsWith("/api/homework");
      const isChessProfileRoute =
        nextUrl.pathname.startsWith("/chess-profile") || nextUrl.pathname.startsWith("/api/chess");
      const demoAllowed =
        nextUrl.pathname.startsWith("/dashboard") ||
        nextUrl.pathname.startsWith("/demo-preview") ||
        nextUrl.pathname.startsWith("/profile") ||
        nextUrl.pathname.startsWith("/api/profile") ||
        isBookingRoute ||
        isPlayVsComputerRoute ||
        isSquareTrainerRoute ||
        isTacticsTrainerRoute ||
        isKingHuntRoute ||
        isClassroomRoute ||
        isHomeworkRoute ||
        isChessProfileRoute ||
        nextUrl.pathname.startsWith("/api/bookings") ||
        nextUrl.pathname.startsWith("/api/availability") ||
        nextUrl.pathname.startsWith("/api/play/computer/reward") ||
        nextUrl.pathname.startsWith("/api/square-trainer") ||
        nextUrl.pathname.startsWith("/api/tactics-trainer") ||
        // The join button asks whether the account is credit-blocked before it
        // opens anything; the answer is the caller's own.
        nextUrl.pathname.startsWith("/api/fees/credit-eligibility") ||
        // Every dashboard page renders the shared frame, which reads the academy
        // branding and the account's own notifications.
        nextUrl.pathname.startsWith("/api/branding") ||
        nextUrl.pathname.startsWith("/api/notifications");

      if (isPublic) return true;
      // A valid session is already durable. Keep the login route from mounting
      // for an authenticated user, so it cannot accidentally clear that session.
      if (isLoginRoute && isLoggedIn) return Response.redirect(new URL("/dashboard", nextUrl));
      if (isAuthRoute) return true;
      if (!isLoggedIn) return false; // triggers redirect to signIn
      if (isInactiveAccount && isInactiveRestrictedPath(nextUrl.pathname)) return Response.redirect(new URL("/dashboard", nextUrl));
      if (accountStatus === "demo" && !demoAllowed) return Response.redirect(new URL("/dashboard", nextUrl));
      if (isAdminRoute && role !== "admin" && role !== "sub-admin") return Response.redirect(new URL("/dashboard", nextUrl));
      if (isInstructorRoute && role !== "instructor" && role !== "admin" && role !== "sub-admin")
        return Response.redirect(new URL("/dashboard", nextUrl));
      if (isPgnRoute && role === "student") return Response.redirect(new URL("/dashboard", nextUrl));
      if (isAnalysisRoute && role === "student") return Response.redirect(new URL("/dashboard", nextUrl));
      if (isPlayVsComputerRoute && role === "instructor") return Response.redirect(new URL("/dashboard", nextUrl));
      if (isFeesRoute && role === "instructor") return Response.redirect(new URL("/dashboard", nextUrl));
      if (isTournamentCreateRoute && role !== "admin" && role !== "sub-admin") return Response.redirect(new URL("/tournaments", nextUrl));
      return true;
    },
  },
} satisfies NextAuthConfig;
