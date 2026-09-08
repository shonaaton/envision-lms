import { NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";
import { auth } from "@/lib/auth";
import { isSuperAdminSession } from "@/lib/featureAccess";
import { dbConnect } from "@/lib/db";
import { roleInputSchema, validateRoleGrants } from "@/lib/accessRolePolicy";
import { AccessRole } from "@/models/AccessRole";
import { User } from "@/models/User";
import { PermissionAudit } from "@/models/FeatureAccess";

export const dynamic = "force-dynamic";
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || !(await isSuperAdminSession(session.user as any))) return NextResponse.json({ error: "Only Super Admins can edit roles." }, { status: 403 });
  if (!isValidObjectId(params.id)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  try {
    const input = roleInputSchema.parse(await req.json());
    if (!input.updatedAt) return NextResponse.json({ error: "Reload the role before saving." }, { status: 409 });
    const permissions = validateRoleGrants(input.permissions);
    await dbConnect();
    const previous = await AccessRole.findById(params.id).lean();
    const role = await AccessRole.findOneAndUpdate({ _id: params.id, archivedAt: null, updatedAt: new Date(input.updatedAt) }, { $set: { name: input.name, nameKey: input.name.toLowerCase(), description: input.description, permissions, isActive: input.isActive, updatedBy: session.user.id } }, { new: true, runValidators: true });
    if (!role) return NextResponse.json({ error: "This role changed or was removed. Reload before saving." }, { status: 409 });
    await PermissionAudit.create({ featureKey: "roleManagement", featureLabel: "Roles", actor: session.user.id, targetType: "role", targetId: params.id, targetLabel: role.name, previousValue: previous, newValue: role.toObject(), reason: "Updated named role" });
    return NextResponse.json(role);
  } catch (error: any) {
    return NextResponse.json({ error: error.code === 11000 ? "A role with this name already exists." : error.message || "Could not save role." }, { status: error.code === 11000 ? 409 : 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || !(await isSuperAdminSession(session.user as any))) return NextResponse.json({ error: "Only Super Admins can remove roles." }, { status: 403 });
  if (!isValidObjectId(params.id)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  await dbConnect();
  if (await User.exists({ accessRole: params.id })) return NextResponse.json({ error: "Reassign all members before removing this role, or deactivate it to suspend access." }, { status: 409 });
  const previous = await AccessRole.findOneAndUpdate({ _id: params.id, archivedAt: null }, { $set: { archivedAt: new Date(), isActive: false, updatedBy: session.user.id } });
  if (!previous) return NextResponse.json({ error: "Role not found." }, { status: 404 });
  await PermissionAudit.create({ featureKey: "roleManagement", featureLabel: "Roles", actor: session.user.id, targetType: "role", targetId: params.id, targetLabel: previous.name, previousValue: previous.toObject(), reason: "Archived named role" });
  return NextResponse.json({ ok: true });
}
