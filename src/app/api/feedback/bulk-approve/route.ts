import { NextResponse } from "next/server";

import { requireFeedbackViewer } from "@/lib/feedback/feedbackAccess";
import { feedbackErrorResponse } from "@/lib/feedback/feedbackHttp";
import { bulkApproveSchema, isReviewer } from "@/lib/feedback/feedbackRules";
import { bulkApprove } from "@/lib/feedback/feedbackService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const viewer = await requireFeedbackViewer();
  if (!viewer || !isReviewer(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { ids } = bulkApproveSchema.parse(await req.json().catch(() => ({})));
    const results = await bulkApprove(ids, viewer);
    return NextResponse.json({ results, approved: results.filter((row) => row.ok).length });
  } catch (error) {
    return feedbackErrorResponse(error);
  }
}
