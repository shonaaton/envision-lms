import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { PGN } from "@/models/PGN";
import { PgnFolder } from "@/models/PgnFolder";
import { buildManageableFolderFilter, buildManageablePgnFilter, buildPgnFolderFilter, buildPgnLibraryFilter, canManageSharedFolder, normalizeFolderPath } from "@/lib/pgnAccess";

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

  const currentUserId = String((session.user as any).id);
  const isAdmin = (session.user as any).role === "admin";
  const folders = await PgnFolder.find(buildPgnFolderFilter(session)).sort({ sortOrder: 1, path: 1 }).lean();
  const games = await PGN.find(buildPgnLibraryFilter(session)).select("folder visibility uploadedBy updatedAt createdAt").lean();
  const stats = new Map<string, { gameCount: number; lastUpdatedAt?: Date; uploaderIds: Set<string> }>();
  games.forEach((game: any) => {
    const path = normalizeFolderPath(game.folder);
    if (!path) return;
    const scope = game.visibility === "shared" ? "shared" : "personal";
    const parts = path.split("/");
    for (let index = 0; index < parts.length; index += 1) {
      const folderPath = parts.slice(0, index + 1).join("/");
      const key = `${scope}:${folderPath}`;
      const current = stats.get(key) || { gameCount: 0, uploaderIds: new Set<string>() };
      current.gameCount += 1;
      if (game.uploadedBy) current.uploaderIds.add(String(game.uploadedBy));
      const updatedAt = new Date(game.updatedAt || game.createdAt);
      if (!current.lastUpdatedAt || updatedAt > current.lastUpdatedAt) current.lastUpdatedAt = updatedAt;
      stats.set(key, current);
    }
  });
  const folderRows = new Map<string, any>();
  folders.forEach((folder: any) => {
    const scope = folder.visibility === "shared" ? "shared" : "personal";
    const stat = stats.get(`${scope}:${normalizeFolderPath(folder.path)}`) || { gameCount: 0, uploaderIds: new Set<string>() };
    const uploadedBy = folder.uploadedBy ? String(folder.uploadedBy) : "";
    folderRows.set(`${scope}:${normalizeFolderPath(folder.path)}`, {
      ...folder,
      gameCount: stat.gameCount,
      lastUpdatedAt: stat.lastUpdatedAt || folder.updatedAt,
      canManage: isAdmin ? scope === "shared" || uploadedBy === currentUserId : uploadedBy === currentUserId,
    });
  });

  stats.forEach((stat, key) => {
    if (folderRows.has(key)) return;
    const [scope, ...pathParts] = key.split(":");
    const path = normalizeFolderPath(pathParts.join(":"));
    if (!path) return;
    folderRows.set(key, {
      _id: key,
      name: path.split("/").pop(),
      path,
      parentPath: normalizeFolderPath(path.split("/").slice(0, -1).join("/")),
      visibility: scope === "shared" ? "shared" : "private",
      gameCount: stat.gameCount,
      lastUpdatedAt: stat.lastUpdatedAt,
      canManage: isAdmin
        ? scope === "shared" || stat.uploaderIds.has(currentUserId)
        : stat.uploaderIds.size > 0 && Array.from(stat.uploaderIds).every((id) => id === currentUserId),
      inferred: true,
    });
  });

  return NextResponse.json(Array.from(folderRows.values()).sort((a: any, b: any) => {
    const visibilitySort = String(a.visibility || "").localeCompare(String(b.visibility || ""));
    return visibilitySort || String(a.path || "").localeCompare(String(b.path || ""));
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
  await recordActivity({
    actor: (session.user as any).id,
    type: "pgn.folder.created",
    label: `Created PGN folder ${created.path}`,
    entityType: "PgnFolder",
    entityId: created._id.toString(),
    metadata: {
      path: created.path,
      parentPath: created.parentPath,
      visibility: created.visibility,
      source: "manual_library",
    },
  });

  return NextResponse.json(created);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPgnAccess(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const { oldName, newName, scope } = await req.json();
  const oldPath = normalizeFolderPath(oldName);
  const newPath = normalizeFolderPath(newName);
  if (!oldPath || !newPath) return NextResponse.json({ error: "Folder names required" }, { status: 400 });
  if (oldPath === newPath) return NextResponse.json({ ok: true, name: newPath, unchanged: true });
  if (newPath.startsWith(`${oldPath}/`)) {
    return NextResponse.json({ error: "A folder cannot be renamed inside itself" }, { status: 400 });
  }

  const requestedVisibility = scope === "shared" ? "shared" : scope === "personal" ? "private" : undefined;
  const rootFolder: any = await PgnFolder.findOne(buildManageableFolderFilter(session, { path: oldPath, ...(requestedVisibility ? { visibility: requestedVisibility } : {}) }));
  const folderVisibility = rootFolder?.visibility || requestedVisibility;
  if (folderVisibility === "shared" && !canManageSharedFolder(session)) {
    return NextResponse.json({ error: "Only admins can edit shared folders" }, { status: 403 });
  }

  const matcher = folderTreeMatcher(oldPath);
  const pgnVisibilityFilter = folderVisibility === "shared" ? "shared" : folderVisibility === "private" ? { $ne: "shared" } : undefined;
  const folderVisibilityFilter = folderVisibility ? { visibility: folderVisibility } : {};
  const folders = await PgnFolder.find(buildManageableFolderFilter(session, { path: matcher, ...folderVisibilityFilter })).lean();
  const docs = await PGN.find(buildManageablePgnFilter(session, { folder: matcher, ...(pgnVisibilityFilter ? { visibility: pgnVisibilityFilter } : {}) })).lean();

  if (!rootFolder && !folders.length && !docs.length) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const targetMatcher = folderTreeMatcher(newPath);
  const [targetFolder, targetPgn] = await Promise.all([
    PgnFolder.findOne(buildManageableFolderFilter(session, { $and: [{ path: targetMatcher }, { path: { $not: matcher } }], ...folderVisibilityFilter })).select("_id").lean(),
    PGN.findOne(buildManageablePgnFilter(session, { $and: [{ folder: targetMatcher }, { folder: { $not: matcher } }], ...(pgnVisibilityFilter ? { visibility: pgnVisibilityFilter } : {}) })).select("_id").lean(),
  ]);
  if (targetFolder || targetPgn) {
    return NextResponse.json({ error: "A folder already exists with that name" }, { status: 409 });
  }

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
  await recordActivity({
    actor: (session.user as any).id,
    type: "pgn.folder.renamed",
    label: `Renamed PGN folder ${oldPath} to ${newPath}`,
    entityType: "PgnFolder",
    entityId: rootFolder?._id?.toString?.() || oldPath,
    metadata: {
      oldPath,
      newPath,
      updatedFolders: folders.length,
      updatedPgns: docs.length,
      visibility: folderVisibility || "mixed",
      source: "manual_library",
    },
  });

  return NextResponse.json({ ok: true, name: newPath, updatedFolders: folders.length, updatedPgns: docs.length });
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
  const folderVisibility = rootFolder?.visibility || requestedVisibility;
  if (folderVisibility === "shared" && !canManageSharedFolder(session)) {
    return NextResponse.json({ error: "Only admins can delete shared folders" }, { status: 403 });
  }

  const matcher = folderTreeMatcher(name);
  const pgnVisibilityFilter = folderVisibility === "shared" ? "shared" : folderVisibility === "private" ? { $ne: "shared" } : undefined;
  const [deletedFolders, deletedPgns] = await Promise.all([
    PgnFolder.deleteMany(buildManageableFolderFilter(session, { path: matcher, ...(folderVisibility ? { visibility: folderVisibility } : {}) })),
    PGN.deleteMany(buildManageablePgnFilter(session, { folder: matcher, ...(pgnVisibilityFilter ? { visibility: pgnVisibilityFilter } : {}) })),
  ]);

  if (!rootFolder && !deletedFolders.deletedCount && !deletedPgns.deletedCount) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }
  await recordActivity({
    actor: (session.user as any).id,
    type: "pgn.folder.deleted",
    label: `Deleted PGN folder ${name}`,
    entityType: "PgnFolder",
    entityId: rootFolder?._id?.toString?.() || name,
    metadata: {
      path: name,
      deletedFolders: deletedFolders.deletedCount || 0,
      deletedPgns: deletedPgns.deletedCount || 0,
      visibility: folderVisibility || "mixed",
      source: "manual_library",
    },
  });

  return NextResponse.json({ ok: true, deletedFolders: deletedFolders.deletedCount || 0, deletedPgns: deletedPgns.deletedCount || 0 });
}
