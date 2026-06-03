import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe NextAuth config (no DB imports).
 * Used by middleware.ts which runs in Edge Runtime.
 * The full `auth.ts` extends this with the Credentials provider that hits MongoDB.
 */
export const authConfig = {
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

      const isAuthRoute = ["/login", "/register"].some((p) => nextUrl.pathname.startsWith(p));
      const isPublic =
        nextUrl.pathname === "/" ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/register");
      const isAdminRoute = nextUrl.pathname.startsWith("/admin");
      const isInstructorRoute = nextUrl.pathname.startsWith("/instructor");

      if (isPublic) return true;
      if (isAuthRoute) {
        if (isLoggedIn) return Response.redirect(new URL("/dashboard", nextUrl));
        return true;
      }
      if (!isLoggedIn) return false; // triggers redirect to signIn
      if (isAdminRoute && role !== "admin") return Response.redirect(new URL("/dashboard", nextUrl));
      if (isInstructorRoute && role !== "instructor" && role !== "admin")
        return Response.redirect(new URL("/dashboard", nextUrl));
      return true;
    },
  },
} satisfies NextAuthConfig;
