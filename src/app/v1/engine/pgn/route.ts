import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildCacheKey, buildDedupeKey, buildPositionHash, createEngineJob, parsePgnToMoves } from "@/lib/engine/service";
import { enginePgnRequestSchema } from "@/lib/engine/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = enginePgnRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  let moves: string[];
  try {
    moves = parsePgnToMoves(parsed.data.pgn);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid PGN" }, { status: 400 });
  }

  const engine = {
    multiPv: parsed.data.multiPv ?? 1,
    depth: parsed.data.depth ?? 18,
  };
  const positionHash = buildPositionHash("start", moves);
  const cacheKey = buildCacheKey({ fen: "start", moves, engine, workType: "analysis" });
  const dedupeKey = buildDedupeKey({
    type: "PGN_ANALYSIS",
    source: "PGN_UPLOAD",
    gameId: parsed.data.gameId,
    fen: "start",
    moves,
    engine,
  });

  const created = await createEngineJob({
    type: "PGN_ANALYSIS",
    priority: 2,
    workType: "analysis",
    userId: (session.user as any).id,
    payload: {
      source: "PGN_UPLOAD",
      fen: "start",
      moves,
      pgn: parsed.data.pgn,
      gameId: parsed.data.gameId,
      positionHash,
      dedupeKey,
      cacheKey,
    },
    engine,
  });

  if ("fromCache" in created) {
    return NextResponse.json({ cached: true, result: created.result, positionHash });
  }
  const job = "job" in created ? created.job : null;
  return NextResponse.json({ jobId: job?.jobId, positionHash, deduped: "deduped" in created });
}
