import { NextResponse } from "next/server";
import { sha256 } from "@/lib/engine/hash";
import { dbConnect } from "@/lib/db";
import { EngineWorker } from "@/models/EngineWorker";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { key: string } }) {
  await dbConnect();
  const keyHash = sha256(params.key);
  const worker = await EngineWorker.findOne({ keyHash, enabled: true }).select("workerId workerName cores enabled status").lean();
  if (!worker) return NextResponse.json({ ok: false, valid: false }, { status: 404 });
  return NextResponse.json({ ok: true, valid: true, worker });
}
