import "server-only";

import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";

export async function requireRetentionAccess(permission: "view" | "manage") {
  const session = await auth();
  if (!session?.user) return null;
  return (await canAccessFeature("retention", session.user as any, permission)) ? session : null;
}

export function retentionActor(session: any) {
  const user = session?.user || {};
  return { id: String(user.id || ""), name: String(user.name || "") };
}
