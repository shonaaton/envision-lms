import { NextResponse } from "next/server";
import { authenticateEngineWorker } from "@/lib/engine/auth";
import { completeEngineJob, touchJobLease } from "@/lib/engine/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { workId: string } }) {
  const worker = await authenticateEngineWorker(req);
  if (!worker) return NextResponse.json({ error: "Unauthorized worker" }, { status: 401 });
  const payload = await req.json().catch(() => null);
  await touchJobLease(params.workId, worker.workerId);
  const result = await completeEngineJob(params.workId, worker.workerId, payload);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, jobId: params.workId });
}
