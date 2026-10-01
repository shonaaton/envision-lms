import { NextResponse } from "next/server";
import { requirePtmViewer } from "@/lib/ptm/ptmAccess";
import { ptmErrorResponse } from "@/lib/ptm/ptmHttp";
import { applyPtmAction } from "@/lib/ptm/ptmService";
export const dynamic = "force-dynamic";
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const viewer = await requirePtmViewer();
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { return NextResponse.json({ ptm: await applyPtmAction(params.id, await req.json(), viewer) }); }
  catch (error) { return ptmErrorResponse(error); }
}
