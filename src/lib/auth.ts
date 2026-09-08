import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { authConfig } from "./auth.config";
import { isInactiveRestrictedPath } from "./inactiveAccess";
import { consumeRateLimit, getClientIp } from "./requestSecurity";
import { loginIdentifierFilter } from "./loginIdentity";
import { requestCache as cache } from "./requestCache";
import { resolveAccessRole } from "./accessRoles";
import { namedRoleApiFeature, namedRoleApiPermissions } from "./accessRoleRequests";

const LOGIN_IP_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_ID_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS_PER_IP = 20;
const MAX_LOGIN_ATTEMPTS_PER_LOGIN = 10;
const MAX_FAILED_LOGINS_BEFORE_LOCK = 5;
const DUMMY_PASSWORD_HASH = "$2a$10$0dHO062F6m6nM0JQ5nM0JeH7GZq4wS6vJzpuG1HsfrN7kYMva9nQG";


declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "student" | "instructor" | "admin" | "sub-admin";
      accessRoleId?: string;
      roleName?: string;
      roleEnabled?: boolean;
      isSuperAdmin?: boolean;
      isActive?: boolean;
      isPaused?: boolean;
      accountStatus?: "demo" | "enrolled" | "coach_applicant" | "approved" | "rejected";
    } & DefaultSession["user"];
  }
  // Augment — only add `role`. NextAuth's base User already declares `id`.
  interface User {
    role?: "student" | "instructor" | "admin" | "sub-admin";
    isSuperAdmin?: boolean;
    isActive?: boolean;
    accountStatus?: "demo" | "enrolled" | "coach_applicant" | "approved" | "rejected";
  }
}


/**
 * Every refusal below returns null so the browser only ever sees a generic
 * "invalid credentials" and no account information leaks. That also means the
 * server log is the only place the real reason exists - without this, a support
 * question like "the password is right but it says invalid" is undiagnosable.
 * Passwords are never logged.
 */
function logLoginFailure(reason: string, identifier: string, extra: Record<string, unknown> = {}) {
  const details = Object.entries(extra)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.warn(`[login] refused reason=${reason} identifier="${identifier}"${details ? ` ${details}` : ""}`);
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
        if (!ipLimit.allowed || !loginLimit.allowed) {
          logLoginFailure(ipLimit.allowed ? "rate_limited_identifier" : "rate_limited_ip", loginValue, {
            ip: clientIp,
            retryAfterSeconds: Math.ceil((ipLimit.allowed ? loginLimit.retryAfterMs : ipLimit.retryAfterMs) / 1000),
          });
          return null;
        }
        const user = await User.findOne(loginIdentifierFilter(loginValue));
        if (!user) {
          await bcrypt.compare(String(creds.password), DUMMY_PASSWORD_HASH);
          logLoginFailure("no_matching_account", loginValue, { ip: clientIp });
          return null;
        }
        if (user.loginLockedUntil && new Date(user.loginLockedUntil).getTime() > Date.now()) {
          await bcrypt.compare(String(creds.password), DUMMY_PASSWORD_HASH);
          logLoginFailure("account_locked", loginValue, {
            ip: clientIp,
            lockedUntil: new Date(user.loginLockedUntil).toISOString(),
          });
          return null;
        }
        const ok = await bcrypt.compare(String(creds.password), user.passwordHash);
        if (!ok) {
          const failedAttempts = Number(user.failedLoginAttempts || 0) + 1;
          const update: Record<string, unknown> = { failedLoginAttempts: failedAttempts };
          if (failedAttempts >= MAX_FAILED_LOGINS_BEFORE_LOCK) update.loginLockedUntil = new Date(Date.now() + LOGIN_LOCK_WINDOW_MS);
          await User.updateOne({ _id: user._id }, { $set: update });
          logLoginFailure("wrong_password", loginValue, {
            ip: clientIp,
            matchedUsername: user.username || "",
            failedAttempts,
            nowLocked: failedAttempts >= MAX_FAILED_LOGINS_BEFORE_LOCK,
          });
          return null;
        }
        if ((user.failedLoginAttempts || 0) > 0 || user.loginLockedUntil) {
          await User.updateOne(
            { _id: user._id },
            { $set: { failedLoginAttempts: 0 }, $unset: { loginLockedUntil: 1 } }
          );
        }
        const explicitSuperAdminExists = await User.exists({ role: "admin", isSuperAdmin: true, isActive: { $ne: false } });
        const isBootstrapSuperAdmin = user.role === "admin" && !user.accessRole && !explicitSuperAdminExists;
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
export const auth = cache(async () => {
  const session = await nextAuth.auth();
  const userId = (session?.user as any)?.id;
  if (!userId) return session;
  const pathname = headers().get("x-pathname") || "";
  const isApiRequest = pathname.startsWith("/api/");

  try {
    const { dbConnect } = await import("./db");
    const { User } = await import("@/models/User");
    await dbConnect();
    const currentUser: any = await User.findById(userId).select("name email role accountStatus isSuperAdmin accessRole isActive isPaused").lean();
    if (!currentUser) return null;

    const isActive = currentUser.isActive !== false;
    // A student paused from their batch keeps their login but loses class,
    // booking, and homework access for the length of the pause.
    const isPaused = currentUser.isPaused === true;
    (session!.user as any).isActive = isActive;
    (session!.user as any).isPaused = isPaused;
    Object.assign(session!.user, {
      role: currentUser.role, name: currentUser.name, email: currentUser.email,
      accountStatus: currentUser.accountStatus,
      isSuperAdmin: Boolean(currentUser.isSuperAdmin && !currentUser.accessRole),
    });
    const assigned = await resolveAccessRole(userId);
    if (assigned) {
      Object.assign(session!.user, assigned, { isSuperAdmin: false });
      if (isApiRequest && pathname !== "/api/branding") {
        if ((!isActive || !assigned.roleEnabled) && !pathname.startsWith("/api/profile")) return null;
        const feature = pathname === "/api/admin/roles" ? "userManagement" : namedRoleApiFeature(pathname);
        if (!feature) return null;
        const { canAccessFeature } = await import("./featureAccess");
        if (!(await canAccessFeature(feature, session!.user as any, "view"))) return null;
        const method = headers().get("x-request-method") || "GET";
        const permissions = namedRoleApiPermissions(pathname, method);
        if (!(await Promise.all(permissions.map(permission => canAccessFeature(feature, session!.user as any, permission)))).some(Boolean)) return null;
      }
    }
    if ((!isActive || isPaused) && isApiRequest && isInactiveRestrictedPath(pathname)) return null;
    return session;
  } catch (error) {
    console.error("Auth access refresh failed; access denied.", error);
    return null;
  }
});
