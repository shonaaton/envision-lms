import "server-only";

import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import type { PauseActor } from "@/lib/studentPause";

/**
 * Pausing a student touches both their enrolment and their billing, so either the
 * dedicated Student Pause permission or user-management rights unlock it.
 */
export async function requireStudentPauseAccess(permission: "view" | "manage") {
  const session = await auth();
  if (!session?.user) return null;
  const user = session.user as any;
  const allowed =
    (await canAccessFeature("studentPause", user, permission)) ||
    (await canAccessFeature("userManagement", user, permission === "manage" ? "edit" : "view"));
  return allowed ? session : null;
}

export function pauseActorFromSession(session: any): PauseActor {
  const user = session?.user || {};
  return { id: String(user.id || ""), name: user.name || "", role: user.role || "" };
}
