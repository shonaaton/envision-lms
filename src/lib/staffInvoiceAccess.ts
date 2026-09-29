import "server-only";

import { auth } from "@/lib/auth";
import { getFeaturePermissionState } from "@/lib/featureAccess";

export const STAFF_INVOICE_FEATURE = "staffInvoices";
const PERMISSIONS = ["view", "view_all", "manage"] as const;

export type StaffInvoiceViewer = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  /** May raise their own invoice. */
  canCreate: boolean;
  /** May read everyone's invoices, bank details included. */
  canViewAll: boolean;
  /** May mark invoices paid or reopen them. */
  canManage: boolean;
};

/**
 * Who is looking at staff invoices and what they may do. Null means no access
 * at all. Every page, action and route calls this itself: the dashboard
 * layout's redirect does not stop a page from rendering.
 */
export async function resolveStaffInvoiceViewer(): Promise<StaffInvoiceViewer | null> {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.id) return null;
  const permissions = await getFeaturePermissionState(STAFF_INVOICE_FEATURE, user, PERMISSIONS);
  if (!permissions.view && !permissions.view_all) return null;
  return {
    userId: String(user.id),
    name: user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    role: String(user.role || ""),
    canCreate: Boolean(permissions.view),
    canViewAll: Boolean(permissions.view_all),
    canManage: Boolean(permissions.manage && permissions.view_all),
  };
}
