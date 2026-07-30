import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { PGN } from "@/models/PGN";
import { PgnFolder } from "@/models/PgnFolder";
import { buildManageableFolderFilter, buildManageablePgnFilter, buildOwnedFolderFilter, buildPgnFolderFilter, buildPgnLibraryFilter, canManageSharedFolder, normalizeFolderPath } from "@/lib/pgnAccess";

export const dynamic = "force-dynamic";

function hasPgnAccess(session: any) {
  const role = (session?.user as any)?.role;
  return role === "instructor" || role === "admin";
}

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
  if (!hasPgnAccess(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const folders = await PgnFolder.find(buildPgnFolderFilter(session)).sort({ sortOrder: 1, path: 1 }).lean();
  const games = await PGN.find(buildPgnLibraryFilter(session)).select("folder visibility updatedAt createdAt").lean();
  const stats = new Map<string, { gameCount: number; lastUpdatedAt?: Date }>();
  games.forEach((game: any) => {
    const path = normalizeFolderPath(game.folder);
    if (!path) return;
    const scope = game.visibility === "shared" ? "shared" : "personal";
    const parts = path.split("/");
    for (let index = 0; index < parts.length; index += 1) {
      const folderPath = parts.slice(0, index + 1).join("/");
      const key = `${scope}:${folderPath}`;
      const current = stats.get(key) || { gameCount: 0 };
      current.gameCount += 1;
      const updatedAt = new Date(game.updatedAt || game.createdAt);
      if (!current.lastUpdatedAt || updatedAt > current.lastUpdatedAt) current.lastUpdatedAt = updatedAt;
      stats.set(key, current);
    }
  });
  return NextResponse.json(folders.map((folder: any) => {
    const scope = folder.visibility === "shared" ? "shared" : "personal";
    const stat = stats.get(`${scope}:${normalizeFolderPath(folder.path)}`) || { gameCount: 0 };
    return { ...folder, gameCount: stat.gameCount, lastUpdatedAt: stat.lastUpdatedAt || folder.updatedAt };
  }));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPgnAccess(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const { name, currentFolder, personal = false, description, coverImage, tags = [] } = await req.json();
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
    description: String(description || "").trim(),
    coverImage: String(coverImage || "").trim(),
    tags: Array.isArray(tags) ? tags.map(String).filter(Boolean) : [],
    uploadedBy: (session.user as any).id,
    visibility,
  });

  return NextResponse.json(created);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPgnAccess(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  if (!hasPgnAccess(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const url = new URL(req.url);
  const name = normalizeFolderPath(url.searchParams.get("name"));
  const requestedVisibility = url.searchParams.get("scope") === "shared" ? "shared" : url.searchParams.get("scope") === "personal" ? "private" : undefined;
  if (!name) return NextResponse.json({ error: "Folder name required" }, { status: 400 });

  const rootFolder: any = await PgnFolder.findOne(buildManageableFolderFilter(session, { path: name, ...(requestedVisibility ? { visibility: requestedVisibility } : {}) }));
  if (!rootFolder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  if (rootFolder.visibility === "shared" && !canManageSharedFolder(session)) {
    return NextResponse.json({ error: "Only admins can delete shared folders" }, { status: 403 });
  }

  const matcher = folderTreeMatcher(name);
  const pgnVisibilityFilter = rootFolder.visibility === "shared" ? "shared" : { $ne: "shared" };
  await Promise.all([
    PgnFolder.deleteMany(buildManageableFolderFilter(session, { path: matcher, visibility: rootFolder.visibility })),
    PGN.deleteMany(buildManageablePgnFilter(session, { folder: matcher, visibility: pgnVisibilityFilter })),
  ]);

  return NextResponse.json({ ok: true });
}
