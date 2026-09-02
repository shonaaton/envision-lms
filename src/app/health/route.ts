import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect, getDatabaseConfigStatus } from "@/lib/db";
import { getEngineStatus } from "@/lib/engine/service";

export const dynamic = "force-dynamic";

export async function GET() {
  let mongo = "unhealthy";
  let mongodbMessage: string | undefined;
  const configStatus = getDatabaseConfigStatus();
  try {
    if (!configStatus.ok) {
      mongodbMessage = configStatus.message;
    } else {
      await dbConnect();
      mongo = mongoose.connection.readyState === 1 ? "healthy" : "degraded";
    }
  } catch (error) {
    mongo = "unhealthy";
    mongodbMessage = error instanceof Error ? error.message : "MongoDB connection failed";
  }

  const engine = await getEngineStatus().catch(() => null);
  return NextResponse.json({
    status: mongo === "healthy" ? "healthy" : "degraded",
    mongodb: mongo,
    mongodbMessage,
    workers: engine?.workers || { available: 0, busy: 0, offline: 0, items: [] },
    queue: engine?.queue || {},
  });
}
