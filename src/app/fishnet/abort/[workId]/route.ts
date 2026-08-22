import { NextResponse } from "next/server";
import { authenticateEngineWorker } from "@/lib/engine/auth";
import { failEngineJob } from "@/lib/engine/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { workId: string } }) {
  const worker = await authenticateEngineWorker(req);
  if (!worker) return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });
  const payload = await req.json().catch(() => null);
  const error = String(payload?.error || payload?.message || "Worker aborted the job.").trim();
  await failEngineJob(params.workId, worker.workerId, error);
  return NextResponse.json({ ok: true, jobId: params.workId });
}
