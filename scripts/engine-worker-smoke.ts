import { dbConnect } from "@/lib/db";
import { authenticateEngineWorker } from "@/lib/engine/auth";
import { buildCacheKey, buildDedupeKey, buildPositionHash, completeEngineJob, createEngineJob, getEngineJob } from "@/lib/engine/service";
import { EngineJob } from "@/models/EngineJob";

async function main() {
  const fen = "startpos";
  const workerEntry = String(process.env.ENGINE_FISHNET_WORKERS || "").split(",")[0].trim();
  const [workerId, workerKey, rawCores = "2"] = workerEntry.split(":");

  if (!workerId || !workerKey) throw new Error("Set ENGINE_FISHNET_WORKERS before running the engine smoke test.");

  await dbConnect();
  const workerRequest = new Request("http://localhost/fishnet/acquire", { headers: { Authorization: `Bearer ${workerKey}` } });
  const worker = await authenticateEngineWorker(workerRequest);
  if (!worker) throw new Error("Worker authentication failed.");

  const engine = { moveTime: 100, skillLevel: 1 };
  const moves: string[] = [];
  const dedupeKey = buildDedupeKey({ type: "COMPUTER_MOVE", source: "PLAY_VS_COMPUTER", fen, moves, engine });
  const created = await createEngineJob({
  type: "COMPUTER_MOVE",
  priority: 0,
  workType: "move",
  engine,
  payload: { source: "PLAY_VS_COMPUTER", fen, moves, positionHash: buildPositionHash(fen, moves), dedupeKey, cacheKey: buildCacheKey({ fen, moves, engine, workType: "move" }) },
  });

  const job = "job" in created ? created.job : null;
  if (!job?.jobId) throw new Error("Smoke job was not created.");

  const acquired = await (await import("@/lib/engine/service")).acquireEngineJob({ workerId: worker.workerId, workerName: worker.workerName, cores: Number(rawCores) || worker.cores });
  if (!acquired || acquired.work?.id !== job.jobId) throw new Error("Worker did not acquire the smoke job.");

  const completed = await completeEngineJob(job.jobId, worker.workerId, { bestMove: "e2e4", lines: [{ multipv: 1, evaluation: { type: "cp", value: 12 }, depth: 4, nodes: 100, pv: ["e2e4"] }] });
  if (!completed.ok) throw new Error(`Smoke job failed: ${completed.error}`);
  const finalJob = await getEngineJob(job.jobId);
  if (finalJob?.status !== "COMPLETED" || finalJob.result?.bestMove !== "e2e4") throw new Error("Smoke job did not complete with the expected result.");

  await EngineJob.deleteOne({ jobId: job.jobId });
  console.log(`Engine smoke passed: ${job.jobId} acquired by ${worker.workerId} and completed.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
