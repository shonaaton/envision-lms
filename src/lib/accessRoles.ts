import "server-only";
import { Types } from "mongoose";
import { cachedPermissionValue } from "@/lib/permissionCache";
import { dbConnect } from "@/lib/db";
import { AccessRole } from "@/models/AccessRole";
import { User } from "@/models/User";
import { MARKETING_ROLE_GRANTS, SALES_ROLE_GRANTS } from "@/lib/accessRolePolicy";

export async function ensureSalesRole() {
  await dbConnect();
  await AccessRole.updateOne({ nameKey: "sales and relationship management" }, { $setOnInsert: {
    name: "Sales and Relationship Management", nameKey: "sales and relationship management",
    description: "Batch vacancies and contact enquiries.",
    permissions: SALES_ROLE_GRANTS,
  } }, { upsert: true });
}

/**
 * Salespeople raise a monthly invoice like coaches do, but their access comes
 * from the saved Sales role, which predates the Staff Invoices feature. Called
 * once, when that feature's settings are first created, so a later decision to
 * take it away in Roles & Access is not undone on the next deploy.
 */
export async function grantStaffInvoicesToSalesRole() {
  await dbConnect();
  await AccessRole.updateOne(
    { nameKey: "sales and relationship management", "permissions.staffInvoices": { $exists: false } },
    { $set: { "permissions.staffInvoices": ["view"] } }
  );
}

/**
 * Marketing downloads the demo leads report (user, 2026-10-03). The saved
 * Marketing role is rewritten from MARKETING_ROLE_GRANTS only when someone
 * opens Roles & Access, so this adds the grant once without waiting for that.
 */
export async function grantDemoExportToMarketingRole() {
  await dbConnect();
  await AccessRole.updateOne(
    { nameKey: "marketing", archivedAt: null },
    { $addToSet: { "permissions.demoCenter": { $each: ["view", "export"] } } }
  );
}

export async function ensureMarketingRole() {
  await dbConnect();
  await AccessRole.updateOne({ nameKey: "marketing" }, {
    $set: {
      description: "Sales and relationship work, Demo Center operations, and marketing analytics. Demo student conversion is excluded.",
      permissions: MARKETING_ROLE_GRANTS,
    },
    $setOnInsert: { name: "Marketing", nameKey: "marketing" },
  }, { upsert: true });
}

/** The account fields every permission check reads. */
export type AccessUser = {
  name?: string;
  email?: string;
  role?: string;
  accountStatus?: string;
  isSuperAdmin?: boolean;
  accessRole?: string;
  isActive?: boolean;
  isPaused?: boolean;
};

/**
 * This account as permission checks see it, or `null` once it no longer exists.
 * Cached for up to 30 seconds and cleared by any write to the account (see
 * lib/permissionCache.ts), so `auth()`, the super admin check and role
 * resolution share one read instead of making three.
 */
export async function getAccessUser(userId: string): Promise<AccessUser | null> {
  const user = await cachedPermissionValue("users", userId, async (): Promise<AccessUser | null> => {
    await dbConnect();
    const doc: any = await User.findById(userId).select("name email role accountStatus isSuperAdmin accessRole isActive isPaused").lean();
    if (!doc) return null;
    return {
      name: doc.name,
      email: doc.email,
      role: doc.role,
      accountStatus: doc.accountStatus,
      isSuperAdmin: doc.isSuperAdmin,
      accessRole: doc.accessRole ? String(doc.accessRole) : undefined,
      isActive: doc.isActive,
      isPaused: doc.isPaused,
    };
  });
  return user ? { ...user } : null;
}

/** Whether any active admin is marked as an explicit super admin. */
export function explicitSuperAdminExists(): Promise<boolean> {
  return cachedPermissionValue("flags", "explicitSuperAdminExists", async () => {
    await dbConnect();
    return Boolean(await User.exists({ role: "admin", isSuperAdmin: true, isActive: { $ne: false } }));
  });
}

type ResolvedAccessRole = {
  accessRoleId: string;
  roleName: string;
  roleGrants: Record<string, string[]>;
  roleEnabled: boolean;
};

// Revocation and role edits made in the app apply on the next request: a write
// to the role or to the account clears this (lib/permissionCache.ts). This also
// covers sessions issued before this role system was introduced.
export async function resolveAccessRole(userId: string): Promise<ResolvedAccessRole | null> {
  const resolved = await cachedPermissionValue("roles", userId, async (): Promise<ResolvedAccessRole | null> => {
    const user = await getAccessUser(userId);
    if (!user?.accessRole) return null;
    await dbConnect();
    const role: any = await AccessRole.findById(user.accessRole).lean();
    return {
      accessRoleId: String(user.accessRole),
      roleName: role?.name || "Unavailable role",
      roleGrants: role?.isActive && !role.archivedAt ? role.permissions || {} : {},
      roleEnabled: Boolean(role?.isActive && !role.archivedAt),
    };
  });
  // Callers merge this into the session; give each its own copy of the grants.
  return resolved ? structuredClone(resolved) : null;
}

export async function validateRoleAssignment(id: unknown) {
  if (typeof id !== "string" || !Types.ObjectId.isValid(id)) throw new Error("Choose a valid role.");
  const role: any = await AccessRole.findOne({ _id: id, isActive: true, archivedAt: null }).lean();
  if (!role) throw new Error("This role is unavailable. Choose an active role.");
  return role;
}
