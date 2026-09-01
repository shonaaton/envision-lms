import { NextResponse } from "next/server";
import { resolveAuthorizedChessStudent } from "@/lib/chess/access";
import { getChessDashboard } from "@/lib/chess/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const access = await resolveAuthorizedChessStudent(url.searchParams.get("studentId"), "view");
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const dashboard = await getChessDashboard(access.studentId, {
    period: url.searchParams.get("period") || "all",
    platform: (url.searchParams.get("platform") as any) || "ALL",
    timeControl: (url.searchParams.get("timeControl") as any) || "all",
    color: (url.searchParams.get("color") as any) || "all",
  });
  return NextResponse.json(dashboard, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
