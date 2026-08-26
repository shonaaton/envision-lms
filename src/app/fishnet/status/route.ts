import { NextResponse } from "next/server";
import { getEngineStatus } from "@/lib/engine/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getEngineStatus();
  const queued = Object.values(status.queue).reduce((total, count) => total + Number(count || 0), 0);
  return NextResponse.json({
    analysis: {
      user: {
        acquired: status.workers.busy,
        queued,
        oldest: 0,
      },
      system: {
        acquired: 0,
        queued: 0,
        oldest: 0,
      },
    },
  });
}
