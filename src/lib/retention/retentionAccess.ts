import "server-only";

import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";

export async function requireRetentionAccess(permission: "view" | "manage") {
  const session = await auth();
  if (!session?.user) return null;
  return (await canAccessFeature("retention", session.user as any, permission)) ? session : null;
}

/** The same viewer shape the Sales pages log and watermark with. */
export async function requireRetentionViewer() {
  const session = await requireRetentionAccess("view");
  const user = session?.user as any;
  if (!user?.id) return null;
  return {
    id: String(user.id),
    name: String(user.name || user.email || "Unknown user"),
    role: String(user.role || ""),
    permissions: { view: true },
  };
}

export function retentionActor(session: any) {
  const user = session?.user || {};
  return { id: String(user.id || ""), name: String(user.name || "") };
}
