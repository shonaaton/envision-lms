import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

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

export const { handlers, auth, signIn, signOut } = NextAuth({
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
        if (!user || (user.isActive === false && user.role !== "student")) return null;
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
