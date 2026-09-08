import "server-only";
import { requestCache as cache } from "./requestCache";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { AccessRole } from "@/models/AccessRole";
import { User } from "@/models/User";
import { SALES_ROLE_GRANTS } from "@/lib/accessRolePolicy";

export async function ensureSalesRole() {
  await dbConnect();
  await AccessRole.updateOne({ nameKey: "sales and relationship management" }, { $setOnInsert: {
    name: "Sales and Relationship Management", nameKey: "sales and relationship management",
    description: "Lead CRM, calls and notes, contacts, batch vacancies, and sales performance.",
    permissions: SALES_ROLE_GRANTS,
  } }, { upsert: true });
}

// Request-local only: revocation and role edits take effect on the next request,
// including sessions issued before this role system was introduced.
export const resolveAccessRole = cache(async (userId: string) => {
  await dbConnect();
  const user: any = await User.findById(userId).select("accessRole").lean();
  if (!user?.accessRole) return null;
  const role: any = await AccessRole.findById(user.accessRole).lean();
  return {
    accessRoleId: String(user.accessRole),
    roleName: role?.name || "Unavailable role",
    roleGrants: role?.isActive && !role.archivedAt ? role.permissions || {} : {},
    roleEnabled: Boolean(role?.isActive && !role.archivedAt),
  };
});

export async function validateRoleAssignment(id: unknown) {
  if (typeof id !== "string" || !Types.ObjectId.isValid(id)) throw new Error("Choose a valid role.");
  const role: any = await AccessRole.findOne({ _id: id, isActive: true, archivedAt: null }).lean();
  if (!role) throw new Error("This role is unavailable. Choose an active role.");
  return role;
}
