import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { User } from "@/models/User";
import { batchSchema } from "@/lib/validation";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const list = await Batch.find({})
    .populate("coach", "name email")
    .populate({ path: "students", select: "name email username isActive", match: { isActive: { $ne: false } } })
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json((list as any[]).map((batch) => ({ ...batch, students: (batch.students || []).filter(Boolean) })));
}

export async function POST(req: Request) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  try {
    const body = batchSchema.parse(await req.json());
    await dbConnect();
    if (Array.isArray(body.students) && body.students.length) {
      const activeStudents = await User.find({ _id: { $in: body.students }, role: "student", isActive: { $ne: false } }).select("_id").lean();
      body.students = activeStudents.map((student: any) => student._id.toString());
    }
    const b = await Batch.create(body);
    await recordActivity({
      actor: actorId,
      type: "batch.created",
      label: `Created batch ${b.name}`,
      entityType: "Batch",
      entityId: b._id.toString(),
      metadata: { students: body.students?.length ?? 0 },
    });
    return NextResponse.json(b);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}
