import { NextResponse } from "next/server";
import { requirePtmViewer } from "@/lib/ptm/ptmAccess";
import { ptmErrorResponse } from "@/lib/ptm/ptmHttp";
import { getPtmCreateOptions } from "@/lib/ptm/ptmService";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const viewer = await requirePtmViewer();
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const params = new URL(req.url).searchParams;
  try { return NextResponse.json(await getPtmCreateOptions(viewer, { q: params.get("q") || "", studentId: params.get("student") || "" })); }
  catch (error) { return ptmErrorResponse(error); }
}
