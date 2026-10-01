import { NextResponse } from "next/server";
import { requirePtmViewer } from "@/lib/ptm/ptmAccess";
import { ptmErrorResponse } from "@/lib/ptm/ptmHttp";
import { getJoinPtm } from "@/lib/ptm/ptmService";
import { isJoinWindowOpen, PTM_JOIN_OPENS_MIN } from "@/lib/ptm/ptmRules";
import { normalizeGoogleMeetUrl } from "@/lib/meetingUrl";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const viewer = await requirePtmViewer();
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const p = await getJoinPtm(params.id, viewer);
    const now = new Date();
    const url = normalizeGoogleMeetUrl(p.meetingUrl);
    const early = ["scheduled", "completed"].includes(p.status) && now.getTime() < new Date(p.scheduledAt).getTime() - PTM_JOIN_OPENS_MIN * 60_000;
    const response = NextResponse.redirect(isJoinWindowOpen(p, now) && url ? url : new URL(`/ptm?join=${early ? "early" : "ended"}`, req.url), 302);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) { return ptmErrorResponse(error); }
}
