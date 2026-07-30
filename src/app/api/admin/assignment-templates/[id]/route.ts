import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { normalizeTopicKey } from "@/lib/assignmentAutomation";
import { assignmentTemplateSchema } from "@/lib/validation";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";

export const dynamic = "force-dynamic";

function canManage(role?: string) {
  return role === "admin" || role === "instructor";
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !canManage(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const existing: any = await AssignmentTemplate.findById(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "instructor" && String(existing.createdBy || "") !== (session.user as any).id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = assignmentTemplateSchema.parse(await req.json());
    existing.set({
      ...body,
      topicKey: normalizeTopicKey(body.topicName),
      updatedBy: (session.user as any).id,
    });
    await existing.save();
    return NextResponse.json(existing);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Bad request" }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || !canManage(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const existing: any = await AssignmentTemplate.findById(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "instructor" && String(existing.createdBy || "") !== (session.user as any).id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  existing.isActive = false;
  existing.autoAssign = false;
  await existing.save();
  return NextResponse.json({ ok: true });
}
