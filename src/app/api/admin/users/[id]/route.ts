import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

function genPassword() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const body = await req.json();
  if (body.resetPassword) {
    const tempPassword = body.password || genPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const u = await User.findByIdAndUpdate(params.id, { passwordHash, tempPassword }, { new: true, projection: { passwordHash: 0 } });
    return NextResponse.json({ ...u?.toObject?.(), tempPassword });
  }
  // Whitelist allowed fields
  const allowed = ["name", "email", "phone", "role", "tags", "batches", "fideId", "rating", "notes", "isActive"];
  const update: any = {};
  for (const k of allowed) if (k in body) update[k] = body[k];
  if (update.email) update.email = String(update.email).toLowerCase();
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
