import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { PGN } from "@/models/PGN";

export const dynamic = "force-dynamic";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function userFolderFilter(session: any, folder: string | RegExp) {
  const role = (session.user as any).role;
  return role === "admin" ? { folder } : { uploadedBy: (session.user as any).id, folder };
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const { oldName, newName } = await req.json();
  if (!oldName?.trim() || !newName?.trim()) return NextResponse.json({ error: "folder names required" }, { status: 400 });

  const oldPath = oldName.trim();
  const newPath = newName.trim();
  const matcher = new RegExp(`^${escapeRegex(oldPath)}(?:/|$)`);
  const docs = await PGN.find(userFolderFilter(session, matcher)).lean();
  await Promise.all(
    docs.map((doc: any) => {
      const currentFolder = String(doc.folder || "");
      const nextFolder = `${newPath}${currentFolder.slice(oldPath.length)}`.replace(/\/$/, "");
      return PGN.updateOne({ _id: doc._id }, { $set: { folder: nextFolder } });
    })
  );

  return NextResponse.json({ ok: true, name: newPath });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ error: "folder name required" }, { status: 400 });
  const matcher = new RegExp(`^${escapeRegex(name)}(?:/|$)`);

  await PGN.deleteMany(userFolderFilter(session, matcher));
  return NextResponse.json({ ok: true });
}
