import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { PGN } from "@/models/PGN";

export const dynamic = "force-dynamic";

function userFolderFilter(session: any, folder: string) {
  const role = (session.user as any).role;
  return role === "admin" ? { folder } : { uploadedBy: (session.user as any).id, folder };
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const { oldName, newName } = await req.json();
  if (!oldName?.trim() || !newName?.trim()) return NextResponse.json({ error: "folder names required" }, { status: 400 });

  await PGN.updateMany(userFolderFilter(session, oldName.trim()), { $set: { folder: newName.trim() } });
  return NextResponse.json({ ok: true, name: newName.trim() });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ error: "folder name required" }, { status: 400 });

  await PGN.deleteMany(userFolderFilter(session, name));
  return NextResponse.json({ ok: true });
}
