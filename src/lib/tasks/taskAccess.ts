import "server-only";

import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import type { TaskActor } from "@/lib/tasks/taskRecipients";
import { MANUAL_ASSIGNER_ROLES } from "@/lib/tasks/taskRules";

export const TASK_FEATURE_KEY = "taskManager";

export async function requireTaskAccess(permission: "view" | "create" | "edit" = "view") {
  const session = await auth();
  if (!session?.user) return null;
  const user = session.user as any;
  if (!["admin", "sub-admin", "instructor"].includes(user.role)) return null;
  if (!(await canAccessFeature(TASK_FEATURE_KEY, user, permission))) return null;
  if (permission === "create" && !(MANUAL_ASSIGNER_ROLES as readonly string[]).includes(user.role)) return null;
  return session;
}

export function taskActorFromSession(session: any): TaskActor {
  const user = session?.user || {};
  return {
    id: String(user.id || ""),
    name: user.name || "",
    role: user.role || "",
    accessRoleId: user.accessRoleId || null,
    isSuperAdmin: Boolean(user.isSuperAdmin),
  };
}
