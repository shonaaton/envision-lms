import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { User } from "@/models/User";
import { recordActivity } from "@/lib/activity";
import { canAccessFeature } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

async function requireBatchAccess(permission: "edit" | "delete") {
  const session = await auth();
  if (!session?.user) return null;
  const user = session.user as any;
  const allowed =
    (await canAccessFeature("courseManagement", user, permission)) ||
    (await canAccessFeature("userManagement", user, permission));
  return allowed ? session : null;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireBatchAccess("edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  await dbConnect();
  const body = await req.json();
  const existing: any = await Batch.findById(params.id).select("students").lean();
  if (!existing) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  if (Array.isArray(body.students)) {
    const activeStudents = body.students.length
      ? await User.find({ _id: { $in: body.students }, role: "student", isActive: { $ne: false } }).select("_id").lean()
      : [];
    body.students = activeStudents.map((student: any) => student._id.toString());
  }
  const b = await Batch.findByIdAndUpdate(params.id, body, { new: true });
  if (Array.isArray(body.students)) {
    const previousIds = (existing.students || []).map((student: any) => student.toString());
    const nextIds = body.students.map(String);
    const removedIds = previousIds.filter((studentId: string) => !nextIds.includes(studentId));
    if (removedIds.length) await User.updateMany({ _id: { $in: removedIds } }, { $pull: { batches: b?._id } });
    if (nextIds.length) await User.updateMany({ _id: { $in: nextIds } }, { $addToSet: { batches: b?._id } });
  }
  await recordActivity({
    actor: actorId,
    type: "batch.updated",
    label: `Updated batch ${b?.name ?? "batch"}`,
    entityType: "Batch",
    entityId: params.id,
    metadata: { fields: Object.keys(body) },
  });
  return NextResponse.json(b);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await requireBatchAccess("delete");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  await dbConnect();
  const b = await Batch.findByIdAndDelete(params.id);
  if (b?._id) await User.updateMany({ batches: b._id }, { $pull: { batches: b._id } });
  await recordActivity({
    actor: actorId,
    type: "batch.deleted",
    label: `Deleted batch ${b?.name ?? "batch"}`,
    entityType: "Batch",
    entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
