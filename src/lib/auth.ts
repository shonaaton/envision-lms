import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { dbConnect } from "./db";
import { User } from "@/models/User";

declare module "next-auth" {
  interface Session { user: { id: string; role: "student" | "instructor" | "admin"; name?: string | null; email?: string | null; image?: string | null } & DefaultSession["user"]; }
  interface User { id: string; role: "student" | "instructor" | "admin"; }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null;
        await dbConnect();
        const user = await User.findOne({ email: String(creds.email).toLowerCase() });
        if (!user || !user.isActive) return null;
        const ok = await bcrypt.compare(String(creds.password), user.passwordHash);
        if (!ok) return null;
        return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.id = (user as any).id; token.role = (user as any).role; }
      return token;
    },
    async session({ session, token }) {
      if (token) { (session.user as any).id = token.id as string; (session.user as any).role = token.role as any; }
      return session;
    },
  },
});
