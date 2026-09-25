import "server-only";

import { NextResponse } from "next/server";
import { FeedbackError } from "@/lib/feedback/feedbackService";

export function feedbackErrorResponse(error: unknown) {
  if (error instanceof FeedbackError) return NextResponse.json({ error: error.message }, { status: error.status });
  const issues = (error as any)?.issues;
  if (Array.isArray(issues) && issues[0]?.message) return NextResponse.json({ error: issues[0].message }, { status: 400 });
  console.error("Feedback request failed", error);
  return NextResponse.json({ error: "Could not process the feedback request." }, { status: 500 });
}
