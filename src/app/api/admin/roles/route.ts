import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessFeature, getFeatureAccessSnapshot, getFeaturePermissionState, isSuperAdminSession } from "@/lib/featureAccess";
import { ensureSalesRole } from "@/lib/accessRoles";
import { roleInputSchema, validateRoleGrants } from "@/lib/accessRolePolicy";
import { AccessRole } from "@/models/AccessRole";
import { User } from "@/models/User";
import { PermissionAudit } from "@/models/FeatureAccess";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const canManage = await isSuperAdminSession(session.user as any);
  if (!canManage && !(await canAccessFeature("userManagement", session.user as any))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureSalesRole();
  const [roles, counts] = await Promise.all([
    AccessRole.find({ archivedAt: null }).sort({ name: 1 }).lean(),
    User.aggregate([{ $match: { accessRole: { $ne: null } } }, { $group: { _id: "$accessRole", count: { $sum: 1 } } }]),
  ]);
  const members = new Map(counts.map((row: any) => [String(row._id), row.count]));
  const statuses = Object.fromEntries((await getFeatureAccessSnapshot()).map(feature => [feature.key, feature.status]));
  const userPermissions = await getFeaturePermissionState("userManagement", session.user as any, ["view", "create", "edit", "delete", "manage", "export"]);
  return NextResponse.json({ canManage, statuses, userPermissions, roles: roles.map((role: any) => ({ ...role, memberCount: members.get(String(role._id)) || 0 })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !(await isSuperAdminSession(session.user as any))) return NextResponse.json({ error: "Only Super Admins can create roles." }, { status: 403 });
  try {
    const input = roleInputSchema.parse(await req.json());
    const permissions = validateRoleGrants(input.permissions);
    await ensureSalesRole();
    const role = await AccessRole.create({ ...input, permissions, nameKey: input.name.toLowerCase(), updatedBy: session.user.id });
    await PermissionAudit.create({ featureKey: "roleManagement", featureLabel: "Roles", actor: session.user.id, targetType: "role", targetId: String(role._id), targetLabel: role.name, newValue: role.toObject(), reason: "Created named role" });
    return NextResponse.json(role, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.code === 11000 ? "A role with this name already exists." : error.message || "Could not create role." }, { status: error.code === 11000 ? 409 : 400 });
  }
}
