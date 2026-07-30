import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { PGN } from "@/models/PGN";
import { recordActivity } from "@/lib/activity";
import { buildPgnLibraryFilter, normalizeFolderPath, requestedPgnVisibility } from "@/lib/pgnAccess";
import { invalidPgnIndexes, splitPgnGames, summarizePgn } from "@/lib/pgnLibrary";

export const dynamic = "force-dynamic";

function hasPgnAccess(session: any) {
  const role = (session?.user as any)?.role;
  return role === "instructor" || role === "admin";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sortFor(value: string | null): Record<string, 1 | -1> {
  if (value === "oldest") return { createdAt: 1 };
  if (value === "title") return { title: 1 };
  if (value === "players") return { white: 1, black: 1 };
  if (value === "event") return { event: 1 };
  if (value === "date") return { date: -1 };
  if (value === "opening") return { opening: 1, eco: 1 };
  if (value === "result") return { result: 1 };
  if (value === "moves") return { moveCount: -1 };
  if (value === "most-viewed") return { viewedCount: -1, createdAt: -1 };
  if (value === "recently-opened") return { lastOpenedAt: -1, createdAt: -1 };
  return { createdAt: -1 };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPgnAccess(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const folder = normalizeFolderPath(url.searchParams.get("folder"));
  const scope = url.searchParams.get("scope");
  const result = url.searchParams.get("result");
  const opening = url.searchParams.get("opening");
  const year = url.searchParams.get("year");
  const annotated = url.searchParams.get("annotated");
  const variations = url.searchParams.get("variations");
  const limit = Math.max(1, Math.min(5000, Number(url.searchParams.get("limit") || 5000)));
  const extra: Record<string, any> = {};
  if (folder) extra.folder = folder;
  if (scope === "shared") extra.visibility = "shared";
  if (scope === "personal") extra.visibility = { $ne: "shared" };
  if (result) extra.result = result;
  if (opening) extra.$or = [{ opening: new RegExp(escapeRegex(opening), "i") }, { eco: new RegExp(escapeRegex(opening), "i") }];
  if (year) extra.date = new RegExp(`^${escapeRegex(year)}`);
  if (annotated === "1") extra.hasAnnotations = true;
  if (variations === "1") extra.hasVariations = true;
  let filter: any = buildPgnLibraryFilter(session, extra);
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter = {
      $and: [
        filter,
        {
          $or: [
            { title: regex },
            { white: regex },
            { black: regex },
            { event: regex },
            { opening: regex },
            { eco: regex },
            { sourceFileName: regex },
            { commentsText: regex },
            { tags: regex },
          ],
        },
      ],
    };
  }
  const list = await PGN.find(filter).sort(sortFor(url.searchParams.get("sort"))).limit(limit).lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPgnAccess(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const { pgn, title, visibility = "private", classroom, folder, sourceFileName, description, tags = [] } = await req.json();
  if (!pgn) return NextResponse.json({ error: "pgn required" }, { status: 400 });
  const games = splitPgnGames(pgn);
  const invalidChapters = invalidPgnIndexes(games);
  if (!games.length || invalidChapters.length) {
    return NextResponse.json({
      error: invalidChapters.length
        ? `Invalid PGN chapter${invalidChapters.length === 1 ? "" : "s"}: ${invalidChapters.slice(0, 5).join(", ")}${invalidChapters.length > 5 ? "..." : ""}`
        : "Invalid PGN",
      invalidChapters,
    }, { status: 400 });
  }

  const normalizedFolder = normalizeFolderPath(folder);
  const savedVisibility = requestedPgnVisibility(session, visibility);

  const docs = await PGN.insertMany(games.map((game, index) => {
    const summary = summarizePgn(game, title || "PGN Game");
    return {
      ...summary,
      title: games.length > 1 ? summary.event || summary.title || `${title || "PGN Game"} ${index + 1}` : title || summary.title || "Untitled game",
      pgn: game,
      folder: normalizedFolder || undefined,
      sourceFileName,
      description,
      tags: Array.isArray(tags) ? tags.map(String).filter(Boolean) : [],
      visibility: savedVisibility,
      classroom,
      uploadedBy: (session.user as any).id,
    };
  }));
  await recordActivity({
    actor: (session.user as any).id,
    targetUser: (session.user as any).id,
    type: "pgn.uploaded",
    label: `Uploaded ${docs.length} PGN ${docs.length === 1 ? "game" : "games"}`,
    entityType: "PGN",
    entityId: docs[0]?._id?.toString(),
    metadata: { count: docs.length, folder: normalizedFolder, visibility: savedVisibility },
  });

  return NextResponse.json(games.length === 1 ? docs[0] : docs);
}
