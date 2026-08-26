import { NextResponse } from "next/server";
import { authenticateEngineWorker } from "@/lib/engine/auth";
import { acquireEngineJob } from "@/lib/engine/service";
import { dbConnect } from "@/lib/db";
import { EngineWorker } from "@/models/EngineWorker";

export const dynamic = "force-dynamic";

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

  const job = await acquireEngineJob(worker);
  if (!job) return new NextResponse(null, { status: 204 });
  return NextResponse.json(job);
}
