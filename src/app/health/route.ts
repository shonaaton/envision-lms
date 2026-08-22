import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { getEngineStatus } from "@/lib/engine/service";

export const dynamic = "force-dynamic";

export async function GET() {
  let mongo = "unhealthy";
  try {
    await dbConnect();
    mongo = mongoose.connection.readyState === 1 ? "healthy" : "degraded";
  } catch {
    mongo = "unhealthy";
  }

  const engine = await getEngineStatus().catch(() => null);
  return NextResponse.json({
    status: mongo === "healthy" ? "healthy" : "degraded",
    mongodb: mongo,
    workers: engine?.workers || { available: 0, busy: 0, offline: 0, items: [] },
    queue: engine?.queue || {},
  });
}
