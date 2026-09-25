import { NextResponse } from "next/server";

import { requireFeedbackViewer } from "@/lib/feedback/feedbackAccess";
import { feedbackErrorResponse } from "@/lib/feedback/feedbackHttp";
import { feedbackActionSchema } from "@/lib/feedback/feedbackRules";
import { applyFeedbackAction } from "@/lib/feedback/feedbackService";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const viewer = await requireFeedbackViewer();
  if (!viewer || viewer.role === "student") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const input = feedbackActionSchema.parse(await req.json().catch(() => ({})));
    return NextResponse.json({ feedback: await applyFeedbackAction(params.id, input, viewer) });
  } catch (error) {
    return feedbackErrorResponse(error);
  }
}
