import "server-only";
import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import type { PtmViewer } from "./ptmRules";

export async function requirePtmViewer(): Promise<PtmViewer | null> {
  const user = (await auth())?.user as any;
  if (!user || !["student", "instructor", "admin", "sub-admin"].includes(user.role) || !await canAccessFeature("ptm", user, "view")) return null;
  const [canCreate, canApprove, canEdit] = await Promise.all(["create", "approve", "edit"].map(permission => canAccessFeature("ptm", user, permission)));
  return { id: String(user.id), role: user.role, canCreate, canApprove, canEdit };
}
