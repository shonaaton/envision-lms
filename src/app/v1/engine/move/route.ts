import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ENGINE_LEVELS } from "@/lib/engine/config";
import { buildCacheKey, buildDedupeKey, buildPositionHash, createEngineJob } from "@/lib/engine/service";
import { engineMoveRequestSchema, validateFen } from "@/lib/engine/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = engineMoveRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.source === "TOURNAMENT_TEST") {
    const role = (session.user as any).role;
    if (role !== "admin" && role !== "sub-admin") {
      return NextResponse.json({ error: "Tournament engine jobs require an admin session." }, { status: 403 });
    }
  }

  const fenValidation = validateFen(parsed.data.fen);
  if (!fenValidation.ok) return NextResponse.json({ error: fenValidation.error }, { status: 400 });

  const level = ENGINE_LEVELS[parsed.data.level] || ENGINE_LEVELS[5];
  const engine = {
    moveTime: level.moveTime,
    depth: level.depth,
    skillLevel: level.skillLevel,
  };
  const positionHash = buildPositionHash(fenValidation.normalizedFen);
  const cacheKey = buildCacheKey({ fen: fenValidation.normalizedFen, engine, workType: "move" });
  const dedupeKey = buildDedupeKey({
    type: parsed.data.source === "TOURNAMENT_TEST" ? "TOURNAMENT_BOT_MOVE" : "COMPUTER_MOVE",
    source: parsed.data.source,
    gameId: parsed.data.gameId,
    tournamentId: parsed.data.tournamentId,
    fen: fenValidation.normalizedFen,
    engine,
  });

  const created = await createEngineJob({
    type: parsed.data.source === "TOURNAMENT_TEST" ? "TOURNAMENT_BOT_MOVE" : "COMPUTER_MOVE",
    priority: parsed.data.source === "TOURNAMENT_TEST" ? 3 : 0,
    workType: "move",
    userId: (session.user as any).id,
    payload: {
      source: parsed.data.source,
      fen: fenValidation.normalizedFen,
      gameId: parsed.data.gameId,
      tournamentId: parsed.data.tournamentId,
      positionHash,
      dedupeKey,
      cacheKey,
      clock: parsed.data.clock,
      level: parsed.data.level,
    },
    engine,
  });

  if ("fromCache" in created) {
    return NextResponse.json({ cached: true, result: created.result, positionHash });
  }
  const job = "job" in created ? created.job : null;
  return NextResponse.json({ jobId: job?.jobId, positionHash, deduped: "deduped" in created });
}
