import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { PGN } from "@/models/PGN";
import { buildManageablePgnFilter, buildPgnLibraryFilter, normalizeFolderPath } from "@/lib/pgnAccess";
import { isValidPgnOrFenSetup, summarizePgn } from "@/lib/pgnLibrary";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

function hasPgnAccess(session: any) {
  const role = (session?.user as any)?.role;
  return role === "instructor" || role === "admin";
}

function ownerFilter(session: any, id: string) {
  return { _id: id, uploadedBy: (session.user as any).id };
}

function manageableFilter(session: any, id: string) {
  return buildManageablePgnFilter(session, { _id: id });
}

function readableFilter(session: any, id: string) {
  return buildPgnLibraryFilter(session, { _id: id });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPgnAccess(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const doc = await PGN.findOne(readableFilter(session, params.id)).lean();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await PGN.updateOne(
    { _id: (doc as any)._id },
    { $set: { lastOpenedAt: new Date() }, $inc: { viewedCount: 1 } }
  );
  return NextResponse.json(doc);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPgnAccess(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const { title, pgn, folder, description, tags } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!pgn?.trim() || !isValidPgnOrFenSetup(pgn)) return NextResponse.json({ error: "Invalid PGN" }, { status: 400 });
  const summary = summarizePgn(pgn, title.trim());

  const before: any = await PGN.findOne(ownerFilter(session, params.id)).lean();
  const updated: any = await PGN.findOneAndUpdate(
    ownerFilter(session, params.id),
    {
      ...summary,
      title: title.trim(),
      pgn,
      folder: normalizeFolderPath(folder) || undefined,
      description,
      ...(Array.isArray(tags) ? { tags: tags.map(String).filter(Boolean) } : {}),
    },
    { new: true },
  ).lean();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivity({
    actor: (session.user as any).id,
    targetUser: (session.user as any).id,
    type: "pgn.updated",
    label: `Updated PGN ${updated.title}`,
    entityType: "PGN",
    entityId: updated._id.toString(),
    metadata: {
      previousTitle: before?.title || "",
      title: updated.title,
      folder: updated.folder || "",
      visibility: updated.visibility || "",
      source: "manual_coach_admin",
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPgnAccess(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const deleted: any = await PGN.findOneAndDelete(manageableFilter(session, params.id)).lean();
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordActivity({
    actor: (session.user as any).id,
    targetUser: (session.user as any).id,
    type: "pgn.deleted",
    label: `Deleted PGN ${deleted.title || "game"}`,
    entityType: "PGN",
    entityId: deleted._id.toString(),
    metadata: { title: deleted.title || "", folder: deleted.folder || "", visibility: deleted.visibility || "", source: "manual_coach_admin" },
  });
  return NextResponse.json({ ok: true });
}
