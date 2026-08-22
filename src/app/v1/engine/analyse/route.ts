import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildCacheKey, buildDedupeKey, buildPositionHash, createEngineJob } from "@/lib/engine/service";
import { engineAnalyseRequestSchema, validateFen } from "@/lib/engine/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = engineAnalyseRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const fenValidation = validateFen(parsed.data.fen);
  if (!fenValidation.ok) return NextResponse.json({ error: fenValidation.error }, { status: 400 });

  const engine = {
    multiPv: parsed.data.multiPv ?? 3,
    depth: parsed.data.depth ?? 16,
    nodes: parsed.data.nodes,
  };
  const positionHash = buildPositionHash(fenValidation.normalizedFen, parsed.data.moves);
  const cacheKey = buildCacheKey({ fen: fenValidation.normalizedFen, moves: parsed.data.moves, engine, workType: "analysis" });
  const dedupeKey = buildDedupeKey({
    type: parsed.data.source === "CLASSROOM" ? "CLASSROOM_ANALYSIS" : "POSITION_ANALYSIS",
    source: parsed.data.source,
    classroomId: parsed.data.classroomId,
    gameId: parsed.data.gameId,
    fen: fenValidation.normalizedFen,
    moves: parsed.data.moves,
    engine,
  });

  const created = await createEngineJob({
    type: parsed.data.source === "CLASSROOM" ? "CLASSROOM_ANALYSIS" : "POSITION_ANALYSIS",
    priority: parsed.data.source === "CLASSROOM" ? 1 : 1,
    workType: "analysis",
    userId: (session.user as any).id,
    payload: {
      source: parsed.data.source,
      fen: fenValidation.normalizedFen,
      moves: parsed.data.moves,
      classroomId: parsed.data.classroomId,
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
