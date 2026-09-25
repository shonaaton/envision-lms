import { NextResponse } from "next/server";
import { z } from "zod";

import { requireFeedbackViewer } from "@/lib/feedback/feedbackAccess";
import { feedbackErrorResponse } from "@/lib/feedback/feedbackHttp";
import { isReviewer } from "@/lib/feedback/feedbackRules";
import { generateFeedbackNow } from "@/lib/feedback/feedbackService";

export const dynamic = "force-dynamic";

const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() });

export async function POST(req: Request) {
  const viewer = await requireFeedbackViewer();
  if (!viewer || !isReviewer(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { month } = schema.parse(await req.json().catch(() => ({})));
    return NextResponse.json(await generateFeedbackNow(viewer, month));
  } catch (error) {
    return feedbackErrorResponse(error);
  }
}
