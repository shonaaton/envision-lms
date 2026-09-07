import "server-only";

import { auth } from "@/lib/auth";
import { canAccessFeature } from "@/lib/featureAccess";
import { recordActivity } from "@/lib/activity";

export type SalesSurface = "salesPerformance" | "salesDirectory" | "batchVacancy" | "salesCrm";

const SURFACE_LABELS: Record<SalesSurface, string> = {
  salesPerformance: "Sales performance dashboard",
  salesDirectory: "Contact directory",
  batchVacancy: "Batch vacancy board",
  salesCrm: "Lead CRM",
};

export type SalesViewer = {
  id: string;
  name: string;
  role: string;
  /** Grants held on the requested surface, so a page can hide what it cannot do. */
  permissions: Record<string, boolean>;
};

/**
 * Guard for every sales page.
 *
 * Returns the viewer or null; callers redirect on null, matching how the rest of
 * the portal's page guards behave. The access log is the counterweight to showing
 * this team phone numbers and revenue movement: nothing here is anonymous.
 */
export async function requireSalesViewer(
  surface: SalesSurface,
  permissions: readonly string[] = ["view"],
): Promise<SalesViewer | null> {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.id) return null;
  if (!(await canAccessFeature(surface, user, "view"))) return null;

  const granted: Record<string, boolean> = {};
  await Promise.all(
    permissions.map(async (permission) => {
      granted[permission] = await canAccessFeature(surface, user, permission);
    }),
  );

  return {
    id: String(user.id),
    name: String(user.name || user.email || "Unknown user"),
    role: String(user.role || ""),
    permissions: granted,
  };
}

/** Fire-and-forget, like `recordActivity` itself - never blocks a page render. */
export function logSalesView(viewer: SalesViewer, surface: SalesSurface, metadata?: Record<string, unknown>) {
  void recordActivity({
    actor: viewer.id,
    type: "sales_view",
    label: `${viewer.name} opened ${SURFACE_LABELS[surface]}`,
    entityType: "sales",
    entityId: surface,
    metadata,
  });
}

export function logSalesAction(viewer: SalesViewer, label: string, metadata?: Record<string, unknown>) {
  void recordActivity({
    actor: viewer.id,
    type: "sales_action",
    label,
    entityType: "sales",
    metadata,
  });
}
