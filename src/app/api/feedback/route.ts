import { NextResponse } from "next/server";

import { requireFeedbackViewer } from "@/lib/feedback/feedbackAccess";
import { feedbackErrorResponse } from "@/lib/feedback/feedbackHttp";
import { FEEDBACK_STATUSES } from "@/models/MonthlyFeedback";
import { listFeedback } from "@/lib/feedback/feedbackService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const viewer = await requireFeedbackViewer();
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "";
  try {
    return NextResponse.json(
      await listFeedback(viewer, {
        month: url.searchParams.get("month") || undefined,
        status: (FEEDBACK_STATUSES as readonly string[]).includes(status) ? status : undefined,
        coach: url.searchParams.get("coach") || undefined,
        q: (url.searchParams.get("q") || "").trim().slice(0, 60) || undefined,
      })
    );
  } catch (error) {
    return feedbackErrorResponse(error);
  }
}
