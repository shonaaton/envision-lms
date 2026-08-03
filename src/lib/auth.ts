import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { authConfig } from "./auth.config";
import { isInactiveRestrictedPath } from "./inactiveAccess";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "student" | "instructor" | "admin";
      isSuperAdmin?: boolean;
      isActive?: boolean;
      accountStatus?: "demo" | "enrolled" | "coach_applicant" | "approved" | "rejected";
    } & DefaultSession["user"];
  }
  // Augment — only add `role`. NextAuth's base User already declares `id`.
  interface User {
    role?: "student" | "instructor" | "admin";
    isSuperAdmin?: boolean;
    isActive?: boolean;
    accountStatus?: "demo" | "enrolled" | "coach_applicant" | "approved" | "rejected";
  }
}

const nextAuth = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null;
        // Lazy-import to keep this file out of the Edge bundle if anything ever inlines it.
        const { dbConnect } = await import("./db");
        const { User } = await import("@/models/User");
        await dbConnect();
        const loginValue = String(creds.email).trim();
        const normalized = loginValue.toLowerCase();
        const user = await User.findOne({
          $or: [
            { email: normalized },
            { username: loginValue },
            { username: normalized },
          ],
        });
        if (!user) return null;
        const ok = await bcrypt.compare(String(creds.password), user.passwordHash);
        if (!ok) return null;
        const explicitSuperAdminExists = await User.exists({ role: "admin", isSuperAdmin: true, isActive: { $ne: false } });
        const isBootstrapSuperAdmin = user.role === "admin" && !explicitSuperAdminExists;
        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          isSuperAdmin: Boolean(user.isSuperAdmin || isBootstrapSuperAdmin),
          isActive: user.isActive !== false,
          accountStatus: user.accountStatus || "enrolled",
        };
      },
    }),
  ],
});

export const { handlers, signIn, signOut } = nextAuth;

// JWT sessions can outlive an admin status change. Re-check the database on every
// authenticated server request so deactivation and deletion take effect immediately.
export async function auth() {
  const session = await nextAuth.auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return session;

  const { dbConnect } = await import("./db");
  const { User } = await import("@/models/User");
  await dbConnect();
  const currentUser: any = await User.findById(userId).select("isActive").lean();
  if (!currentUser) return null;

  const isActive = currentUser.isActive !== false;
  (session!.user as any).isActive = isActive;
  const pathname = headers().get("x-pathname") || "";
  if (!isActive && pathname.startsWith("/api/") && isInactiveRestrictedPath(pathname)) return null;
  return session;
}
