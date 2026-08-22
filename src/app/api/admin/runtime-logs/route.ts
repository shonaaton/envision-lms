import { NextResponse } from "next/server";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { readRecentRuntimeLogs, runtimeLogFilePath } from "@/lib/runtimeLogger";

export async function GET(request: Request) {
  const session = await requireAdminApiAccess(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 100);

  return NextResponse.json({
    ok: true,
    file: runtimeLogFilePath(),
    logs: readRecentRuntimeLogs(limit),
  });
}
