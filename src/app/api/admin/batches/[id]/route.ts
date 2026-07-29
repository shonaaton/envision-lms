import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { User } from "@/models/User";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  await dbConnect();
  const body = await req.json();
  if (Array.isArray(body.students) && body.students.length) {
    const activeStudents = await User.find({ _id: { $in: body.students }, role: "student", isActive: { $ne: false } }).select("_id").lean();
    body.students = activeStudents.map((student: any) => student._id.toString());
  }
  const b = await Batch.findByIdAndUpdate(params.id, body, { new: true });
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
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  await dbConnect();
  const b = await Batch.findByIdAndDelete(params.id);
  await recordActivity({
    actor: actorId,
    type: "batch.deleted",
    label: `Deleted batch ${b?.name ?? "batch"}`,
    entityType: "Batch",
    entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
