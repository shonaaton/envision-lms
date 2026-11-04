import { NextResponse } from "next/server";

import { requireFeedbackViewer } from "@/lib/feedback/feedbackAccess";
import { feedbackErrorResponse } from "@/lib/feedback/feedbackHttp";
import { isReviewer, reassignSchema } from "@/lib/feedback/feedbackRules";
import { reassignFeedback, reassignableCoaches } from "@/lib/feedback/feedbackService";

export const dynamic = "force-dynamic";

/** Coaches a report can be moved to. `?ids=a,b` flags the ones teaching those reports' students. */
export async function GET(req: Request) {
  const viewer = await requireFeedbackViewer();
  if (!viewer || !isReviewer(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const ids = (new URL(req.url).searchParams.get("ids") || "")
      .split(",")
      .filter((id) => /^[a-f0-9]{24}$/i.test(id))
      .slice(0, 200);
    return NextResponse.json({ coaches: await reassignableCoaches(viewer, ids) });
  } catch (error) {
    return feedbackErrorResponse(error);
  }
}

/** Moves not-yet-submitted reports to another coach. */
export async function POST(req: Request) {
  const viewer = await requireFeedbackViewer();
  if (!viewer || !isReviewer(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const input = reassignSchema.parse(await req.json().catch(() => ({})));
    return NextResponse.json(await reassignFeedback(input, viewer));
  } catch (error) {
    return feedbackErrorResponse(error);
  }
}
