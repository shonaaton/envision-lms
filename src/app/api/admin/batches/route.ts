import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Batch } from "@/models/Batch";
import { batchSchema } from "@/lib/validation";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const list = await Batch.find({})
    .populate("coach", "name email")
    .populate("students", "name email username")
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;
  try {
    const body = batchSchema.parse(await req.json());
    await dbConnect();
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
