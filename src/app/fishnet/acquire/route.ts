import { NextResponse } from "next/server";
import { authenticateEngineWorker } from "@/lib/engine/auth";
import { acquireEngineJob, waitForQueuedEngineJob } from "@/lib/engine/service";
import { dbConnect } from "@/lib/db";
import { EngineWorker } from "@/models/EngineWorker";

export const dynamic = "force-dynamic";

const LONG_POLL_MS = 15_000;

export async function POST(req: Request) {
  const worker = await authenticateEngineWorker(req);
  if (!worker) return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });

  await dbConnect();
  await EngineWorker.updateOne(
    { workerId: worker.workerId },
    {
      $setOnInsert: {
        workerId: worker.workerId,
        keyHash: worker.keyHash,
      },
      $set: {
        workerName: worker.workerName,
        cores: worker.cores,
        enabled: true,
        lastSeenAt: new Date(),
      },
    },
    { upsert: true }
  );

  let job = await acquireEngineJob(worker);
  // Long-poll: hold the request (fishnet's client timeout is 30s) until a job is queued,
  // so a waiting worker picks up a computer move at once instead of after its backoff.
  // A worker that loses the race to another keeps waiting until the deadline.
  const deadline = Date.now() + LONG_POLL_MS;
  while (!job && !req.signal.aborted && Date.now() < deadline) {
    await waitForQueuedEngineJob(deadline - Date.now());
    if (req.signal.aborted) break;
    job = await acquireEngineJob(worker);
  }
  if (!job) return new NextResponse(null, { status: 204 });
  return NextResponse.json(job, { status: 202 });
}
