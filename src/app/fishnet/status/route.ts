import { NextResponse } from "next/server";
import { getEngineStatus } from "@/lib/engine/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getEngineStatus();
  return NextResponse.json(status);
}
