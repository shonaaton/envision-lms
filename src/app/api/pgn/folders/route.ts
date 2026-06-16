import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { PGN } from "@/models/PGN";
import { PgnFolder } from "@/models/PgnFolder";
import { buildOwnedFolderFilter, buildPgnFolderFilter, canManageSharedFolder, normalizeFolderPath } from "@/lib/pgnAccess";

export const dynamic = "force-dynamic";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function folderTreeMatcher(path: string) {
  return new RegExp(`^${escapeRegex(path)}(?:/|$)`);
}

function folderVisibility(session: any, personal?: boolean) {
  if ((session?.user as any)?.role === "admin" && !personal) return "shared";
  return "private";
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const folders = await PgnFolder.find(buildPgnFolderFilter(session)).sort({ path: 1 }).lean();
  return NextResponse.json(folders);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const { name, currentFolder, personal = false } = await req.json();
  const trimmedName = String(name || "").trim();
  if (!trimmedName) return NextResponse.json({ error: "Folder name required" }, { status: 400 });

  const parentPath = normalizeFolderPath(currentFolder);
  const path = normalizeFolderPath(parentPath ? `${parentPath}/${trimmedName}` : trimmedName);
  const visibility = folderVisibility(session, !!personal);

  const existing = await PgnFolder.findOne({ path, uploadedBy: (session.user as any).id, visibility }).lean();
  if (existing) return NextResponse.json({ error: "Folder already exists" }, { status: 409 });

  const created = await PgnFolder.create({
    name: trimmedName,
    path,
    parentPath: parentPath || "",
    uploadedBy: (session.user as any).id,
    visibility,
  });

  return NextResponse.json(created);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const { oldName, newName } = await req.json();
  const oldPath = normalizeFolderPath(oldName);
  const newPath = normalizeFolderPath(newName);
  if (!oldPath || !newPath) return NextResponse.json({ error: "Folder names required" }, { status: 400 });

  const rootFolder: any = await PgnFolder.findOne(buildOwnedFolderFilter(session, { path: oldPath }));
  if (!rootFolder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  if (rootFolder.visibility === "shared" && !canManageSharedFolder(session)) {
    return NextResponse.json({ error: "Only admins can edit shared folders" }, { status: 403 });
  }

  const matcher = folderTreeMatcher(oldPath);
  const folders = await PgnFolder.find(buildOwnedFolderFilter(session, { path: matcher })).lean();
  const docs = await PGN.find(buildOwnedFolderFilter(session, { folder: matcher })).lean();

  await Promise.all([
    ...folders.map((folder: any) => {
      const nextFolderPath = normalizeFolderPath(`${newPath}${String(folder.path).slice(oldPath.length)}`);
      return PgnFolder.updateOne(
        { _id: folder._id },
        {
          $set: {
            name: nextFolderPath.split("/").pop(),
            path: nextFolderPath,
            parentPath: normalizeFolderPath(nextFolderPath.split("/").slice(0, -1).join("/")),
          },
        }
      );
    }),
    ...docs.map((doc: any) => {
      const currentFolder = String(doc.folder || "");
      const nextFolder = normalizeFolderPath(`${newPath}${currentFolder.slice(oldPath.length)}`);
      return PGN.updateOne({ _id: doc._id }, { $set: { folder: nextFolder } });
    }),
  ]);

  return NextResponse.json({ ok: true, name: newPath });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const url = new URL(req.url);
  const name = normalizeFolderPath(url.searchParams.get("name"));
  if (!name) return NextResponse.json({ error: "Folder name required" }, { status: 400 });

  const rootFolder: any = await PgnFolder.findOne(buildOwnedFolderFilter(session, { path: name }));
  if (!rootFolder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  if (rootFolder.visibility === "shared" && !canManageSharedFolder(session)) {
    return NextResponse.json({ error: "Only admins can delete shared folders" }, { status: 403 });
  }

  const matcher = folderTreeMatcher(name);
  await Promise.all([
    PgnFolder.deleteMany(buildOwnedFolderFilter(session, { path: matcher })),
    PGN.deleteMany(buildOwnedFolderFilter(session, { folder: matcher })),
  ]);

  return NextResponse.json({ ok: true });
}
