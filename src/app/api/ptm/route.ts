import { NextResponse } from "next/server";
import { requirePtmViewer } from "@/lib/ptm/ptmAccess";
import { ptmErrorResponse } from "@/lib/ptm/ptmHttp";
import { getPtmSummary, listPtms, requestPtm } from "@/lib/ptm/ptmService";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const viewer = await requirePtmViewer();
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const params = new URL(req.url).searchParams;
    return NextResponse.json(params.get("summary") === "1" ? await getPtmSummary(viewer) : await listPtms(viewer, { status: params.get("status") || undefined, coach: params.get("coach") || undefined, q: params.get("q") || undefined }));
  } catch (error) { return ptmErrorResponse(error); }
}
export async function POST(req: Request) {
  const viewer = await requirePtmViewer();
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { return NextResponse.json({ ptm: await requestPtm(viewer, await req.json()) }, { status: 201 }); }
  catch (error) { return ptmErrorResponse(error); }
}
