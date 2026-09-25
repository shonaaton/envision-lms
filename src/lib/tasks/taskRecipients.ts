import "server-only";

import { dbConnect } from "@/lib/db";
import { SALES_ACCESS_ROLE_NAME_KEY } from "@/lib/demoNotificationRecipients";
import { AccessRole } from "@/models/AccessRole";
import { User } from "@/models/User";
import type { TaskPool } from "@/lib/tasks/taskRules";

export type TaskActor = {
  id: string;
  name?: string;
  role?: string;
  accessRoleId?: string | null;
  isSuperAdmin?: boolean;
};

export type TaskStaffMember = { _id: string; name: string; email: string };

const STAFF_FIELDS = "_id name email role accessRole";

async function salesRoleIds(): Promise<string[]> {
  const roles: any[] = await AccessRole.find({ nameKey: SALES_ACCESS_ROLE_NAME_KEY, isActive: true, archivedAt: null })
    .select("_id")
    .lean();
  return roles.map((role) => String(role._id));
}

/**
 * Which shared queues a person works from, resolved from their live platform
 * identity rather than a static contact list: admins and plain sub-admins
 * share the "admins" pool, sub-admins on the Sales role share "sales".
 */
export async function poolsForActor(actor: TaskActor): Promise<TaskPool[]> {
  if (actor.role === "admin") return ["admins"];
  if (actor.role !== "sub-admin") return [];
  if (!actor.accessRoleId) return ["admins"];
  const sales = await salesRoleIds();
  return sales.includes(String(actor.accessRoleId)) ? ["sales"] : [];
}

/** Everyone who currently works a pool. Sales falls back to admins so a task never lands with nobody. */
export async function poolMembers(pool: TaskPool): Promise<TaskStaffMember[]> {
  await dbConnect();
  let users: any[] = [];
  if (pool === "sales") {
    const roles = await salesRoleIds();
    users = roles.length
      ? await User.find({ accessRole: { $in: roles }, isActive: { $ne: false } }).select(STAFF_FIELDS).lean()
      : [];
    if (!users.length) return poolMembers("admins");
  } else {
    users = await User.find({
      isActive: { $ne: false },
      $or: [{ role: "admin" }, { role: "sub-admin", $or: [{ accessRole: null }, { accessRole: { $exists: false } }] }],
    })
      .select(STAFF_FIELDS)
      .lean();
  }
  return users.map((user) => ({ _id: String(user._id), name: user.name || "", email: user.email || "" }));
}

/** People a task can be assigned to by hand, labelled for the picker. */
export async function manualAssigneeOptions() {
  await dbConnect();
  const [users, sales] = await Promise.all([
    User.find({ role: { $in: ["admin", "sub-admin"] }, isActive: { $ne: false } })
      .select("_id name email role accessRole")
      .sort({ name: 1 })
      .lean() as Promise<any[]>,
    salesRoleIds(),
  ]);
  return users.map((user) => ({
    _id: String(user._id),
    name: user.name || user.email || "Unnamed",
    email: user.email || "",
    label: user.role === "admin" ? "Admin" : user.accessRole && sales.includes(String(user.accessRole)) ? "Sales" : user.accessRole ? "Staff" : "Sub-admin",
  }));
}
