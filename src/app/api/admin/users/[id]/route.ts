import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { isValidObjectId } from "mongoose";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { recordActivity } from "@/lib/activity";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";
import { deleteUserRecords } from "@/lib/deleteUserRecords";

export const dynamic = "force-dynamic";

async function requireUserManagement(permission: "edit" | "delete" | "manage") {
  const session = await auth();
  if (!session?.user) return null;
  if (!(await canAccessFeature("userManagement", session.user as any, permission))) return null;
  return session;
}

function genPassword() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const session = await requireUserManagement(body.resetPassword ? "manage" : "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  await dbConnect();
  const actorIsSuperAdmin = await isSuperAdminSession(session!.user as any);
  const target = await User.findById(params.id).select("name role isSuperAdmin").lean();
  if ((target as any)?.isSuperAdmin && !actorIsSuperAdmin) return NextResponse.json({ error: "Only Super Admins can update another Super Admin." }, { status: 403 });
  if (body.resetPassword) {
    const tempPassword = body.password || genPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const u = await User.findByIdAndUpdate(
      params.id,
      {
        $set: {
          passwordHash,
          tempPassword,
          passwordChangedAt: new Date(),
          passwordChangeSource: "admin_reset",
        },
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
      },
      { new: true, projection: { passwordHash: 0 } }
    );
    await recordActivity({
      actor: actorId,
      targetUser: params.id,
      type: "user.password_reset",
      label: `Reset password for ${u?.name ?? "user"}`,
      entityType: "User",
      entityId: params.id,
    });
    return NextResponse.json({ ...u?.toObject?.(), tempPassword });
  }
  // Whitelist allowed fields
  const allowed = ["name", "email", "countryCode", "phone", "role", "tags", "batches", "fideId", "rating", "notes", "isActive", "isSuperAdmin"];
  const update: any = {};
  for (const k of allowed) if (k in body) update[k] = body[k];
  if ("isSuperAdmin" in update && !actorIsSuperAdmin) return NextResponse.json({ error: "Only Super Admins can grant or remove Super Admin access." }, { status: 403 });
  if ((update.role === "admin" || update.role === "sub-admin") && !actorIsSuperAdmin) return NextResponse.json({ error: "Only Super Admins can assign admin or sub-admin roles." }, { status: 403 });
  if (update.role && update.role !== "admin") update.isSuperAdmin = false;
  if (update.email) update.email = String(update.email).toLowerCase();
  const removingSuperAdmin =
    (target as any)?.isSuperAdmin &&
    (update.isSuperAdmin === false || update.role !== undefined && update.role !== "admin" || update.isActive === false);
  if (removingSuperAdmin) {
    const remaining = await User.countDocuments({ _id: { $ne: params.id }, role: "admin", isSuperAdmin: true, isActive: { $ne: false } });
    if (remaining === 0) return NextResponse.json({ error: "At least one active Super Admin must remain." }, { status: 409 });
  }
  const u = await User.findByIdAndUpdate(params.id, update, { new: true, projection: { passwordHash: 0 } });
  await recordActivity({
    actor: actorId,
    targetUser: params.id,
    type: "user.updated",
    label: `Updated ${u?.name ?? "user"} profile`,
    entityType: "User",
    entityId: params.id,
    metadata: { fields: Object.keys(update) },
  });
  return NextResponse.json(u);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await requireUserManagement("delete");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  if (!isValidObjectId(params.id)) return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
  if (actorId === params.id) return NextResponse.json({ error: "You cannot permanently delete your own account." }, { status: 409 });
  await dbConnect();
  const target: any = await User.findById(params.id).select("name role isSuperAdmin").lean();
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const actorIsSuperAdmin = await isSuperAdminSession(session!.user as any);
  if ((target.role === "admin" || target.role === "sub-admin" || target.isSuperAdmin) && !actorIsSuperAdmin) {
    return NextResponse.json({ error: "Only Super Admins can permanently delete admin accounts." }, { status: 403 });
  }
  if (target.isSuperAdmin) {
    const remaining = await User.countDocuments({ _id: { $ne: params.id }, role: "admin", isSuperAdmin: true, isActive: { $ne: false } });
    if (remaining === 0) return NextResponse.json({ error: "At least one active Super Admin must remain." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.confirmName !== target.name) {
    return NextResponse.json({ error: "Enter the user's full name to confirm permanent deletion." }, { status: 400 });
  }

  const summary = await deleteUserRecords(params.id);
  await recordActivity({
    actor: actorId,
    type: "user.deleted",
    label: `Permanently deleted a ${target.role} account`,
    metadata: summary,
  });
  return NextResponse.json({ ok: true, ...summary });
}
