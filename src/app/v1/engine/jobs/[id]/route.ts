import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelEngineJob, getEngineJob } from "@/lib/engine/service";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await getEngineJob(params.id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await cancelEngineJob(params.id) as any;
  if (!job) return NextResponse.json({ error: "Job not found or already finished" }, { status: 404 });
  return NextResponse.json({ ok: true, jobId: params.id, status: job.status });
}
