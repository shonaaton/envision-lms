import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "student" | "instructor" | "admin";
    } & DefaultSession["user"];
  }
  // Augment — only add `role`. NextAuth's base User already declares `id`.
  interface User {
    role?: "student" | "instructor" | "admin";
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
        const user = await User.findOne({ email: String(creds.email).toLowerCase() });
        if (!user || !user.isActive) return null;
        const ok = await bcrypt.compare(String(creds.password), user.passwordHash);
        if (!ok) return null;
        return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
});
