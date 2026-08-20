import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { authConfig } from "./auth.config";
import { isInactiveRestrictedPath } from "./inactiveAccess";
import { consumeRateLimit, getClientIp } from "./requestSecurity";

const SESSION_USER_STATUS_TTL_MS = 60_000;
const LOGIN_IP_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_ID_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS_PER_IP = 20;
const MAX_LOGIN_ATTEMPTS_PER_LOGIN = 10;
const MAX_FAILED_LOGINS_BEFORE_LOCK = 5;
const DUMMY_PASSWORD_HASH = "$2a$10$0dHO062F6m6nM0JQ5nM0JeH7GZq4wS6vJzpuG1HsfrN7kYMva9nQG";

type SessionUserStatusCacheEntry = {
  isActive: boolean;
  expiresAt: number;
};

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

declare global {
  var _sessionUserStatusCache: Map<string, SessionUserStatusCacheEntry> | undefined;
}

const sessionUserStatusCache = global._sessionUserStatusCache ?? new Map<string, SessionUserStatusCacheEntry>();
if (!global._sessionUserStatusCache) global._sessionUserStatusCache = sessionUserStatusCache;

function readCachedUserStatus(userId: string) {
  const cached = sessionUserStatusCache.get(userId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    sessionUserStatusCache.delete(userId);
    return null;
  }
  return cached;
}

function writeCachedUserStatus(userId: string, isActive: boolean) {
  sessionUserStatusCache.set(userId, {
    isActive,
    expiresAt: Date.now() + SESSION_USER_STATUS_TTL_MS,
  });
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
        const requestHeaders = headers();
        const clientIp = getClientIp(requestHeaders);
        const ipLimit = consumeRateLimit(`login:ip:${clientIp}`, MAX_LOGIN_ATTEMPTS_PER_IP, LOGIN_IP_WINDOW_MS);
        const loginLimit = consumeRateLimit(`login:identifier:${normalized}`, MAX_LOGIN_ATTEMPTS_PER_LOGIN, LOGIN_ID_WINDOW_MS);
        if (!ipLimit.allowed || !loginLimit.allowed) return null;
        const user = await User.findOne({
          $or: [
            { email: normalized },
            { username: loginValue },
            { username: normalized },
          ],
        });
        if (!user) {
          await bcrypt.compare(String(creds.password), DUMMY_PASSWORD_HASH);
          return null;
        }
        if (user.loginLockedUntil && new Date(user.loginLockedUntil).getTime() > Date.now()) {
          await bcrypt.compare(String(creds.password), DUMMY_PASSWORD_HASH);
          return null;
        }
        const ok = await bcrypt.compare(String(creds.password), user.passwordHash);
        if (!ok) {
          const failedAttempts = Number(user.failedLoginAttempts || 0) + 1;
          const update: Record<string, unknown> = { failedLoginAttempts: failedAttempts };
          if (failedAttempts >= MAX_FAILED_LOGINS_BEFORE_LOCK) update.loginLockedUntil = new Date(Date.now() + LOGIN_LOCK_WINDOW_MS);
          await User.updateOne({ _id: user._id }, { $set: update });
          return null;
        }
        if ((user.failedLoginAttempts || 0) > 0 || user.loginLockedUntil) {
          await User.updateOne(
            { _id: user._id },
            { $set: { failedLoginAttempts: 0 }, $unset: { loginLockedUntil: 1 } }
          );
        }
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
  const pathname = headers().get("x-pathname") || "";
  const isApiRequest = pathname.startsWith("/api/");
  const cachedUserStatus = readCachedUserStatus(userId);

  if (cachedUserStatus && !isApiRequest) {
    (session!.user as any).isActive = cachedUserStatus.isActive;
    return session;
  }

  try {
    const { dbConnect } = await import("./db");
    const { User } = await import("@/models/User");
    await dbConnect();
    const currentUser: any = await User.findById(userId).select("isActive").lean();
    if (!currentUser) return null;

    const isActive = currentUser.isActive !== false;
    writeCachedUserStatus(userId, isActive);
    (session!.user as any).isActive = isActive;
    if (!isActive && isApiRequest && isInactiveRestrictedPath(pathname)) return null;
    return session;
  } catch (error) {
    if (cachedUserStatus) {
      (session!.user as any).isActive = cachedUserStatus.isActive;
      if (!cachedUserStatus.isActive && isApiRequest && isInactiveRestrictedPath(pathname)) return null;
      return session;
    }
    if (isApiRequest && isInactiveRestrictedPath(pathname)) return null;
    console.error("Auth user status refresh failed; using session token state instead.", error);
    return session;
  }
}
