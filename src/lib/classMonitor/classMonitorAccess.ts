import "server-only";

import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import { isClassMonitorPerson, isClassMonitorReviewer } from "./classMonitorPeople";

export type ClassMonitorViewer = {
  id: string;
  name: string;
  role: string;
  isAdmin: boolean;
  isMonitor: boolean;
  isReviewer: boolean;
  /** Fill a form and correct a filled one (join times included). */
  canFill: boolean;
  canExport: boolean;
};

/**
 * Whether this person belongs in the Class Monitor at all: admins, the monitor
 * and the reviewers. Salespeople are sub-admins too, so the sub-admin role alone
 * is not enough - the sidebar uses this to hide the section from everyone else.
 */
export function isClassMonitorAudience(user: { role?: unknown; email?: unknown; username?: unknown } | null | undefined) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "sub-admin") return false;
  return isClassMonitorPerson(user) || isClassMonitorReviewer(user);
}

/** The signed-in person as the Class Monitor sees them, or null when it is closed to them. */
export async function resolveClassMonitorViewer(): Promise<ClassMonitorViewer | null> {
  const user = (await auth())?.user as any;
  if (!user?.id || !isClassMonitorAudience(user)) return null;
  if (!(await canAccessFeature("classMonitor", user, "view"))) return null;
  const isAdmin = user.role === "admin";
  const isMonitor = isClassMonitorPerson(user);
  const isReviewer = isClassMonitorReviewer(user);
  // Plain sub-admins never hold `export` anywhere (accessRolePolicy), so the
  // named monitor and reviewers download by identity, like the Demo Center Excel.
  const [canEdit, canExport] = await Promise.all([
    canAccessFeature("classMonitor", user, "edit"),
    isAdmin ? canAccessFeature("classMonitor", user, "export") : Promise.resolve(isMonitor || isReviewer),
  ]);
  return {
    id: String(user.id),
    name: String(user.name || ""),
    role: String(user.role),
    isAdmin,
    isMonitor,
    isReviewer,
    canFill: canEdit && (isAdmin || isMonitor),
    canExport,
  };
}
