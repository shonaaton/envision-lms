import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const body = await req.json();
  // Whitelist allowed fields
  const allowed = ["name", "phone", "role", "tags", "batches", "fideId", "rating", "notes", "isActive"];
  const update: any = {};
  for (const k of allowed) if (k in body) update[k] = body[k];
  const u = await User.findByIdAndUpdate(params.id, update, { new: true, projection: { passwordHash: 0 } });
  return NextResponse.json(u);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  // Soft-delete: deactivate, don't drop, so historical refs stay valid.
  await User.findByIdAndUpdate(params.id, { isActive: false });
  return NextResponse.json({ ok: true });
}
