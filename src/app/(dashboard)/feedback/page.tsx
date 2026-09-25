import { redirect } from "next/navigation";

import AdminFeedbackClient from "@/components/feedback/AdminFeedbackClient";
import CoachFeedbackClient from "@/components/feedback/CoachFeedbackClient";
import StudentFeedbackClient from "@/components/feedback/StudentFeedbackClient";
import { requireFeedbackViewer } from "@/lib/feedback/feedbackAccess";
import { isFeedbackMonth } from "@/lib/feedback/feedbackCycleDates";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({ searchParams }: { searchParams: { month?: string; open?: string; tab?: string } }) {
  const viewer = await requireFeedbackViewer();
  if (!viewer) redirect("/dashboard?restricted=1");
  const month = isFeedbackMonth(searchParams.month) ? searchParams.month : "";
  if (viewer.role === "student") return <StudentFeedbackClient initialMonth={month} />;
  if (viewer.role === "instructor") {
    const open = /^[a-f0-9]{24}$/i.test(searchParams.open || "") ? searchParams.open! : null;
    return <CoachFeedbackClient initialMonth={month} initialOpen={open} />;
  }
  return <AdminFeedbackClient canApprove={Boolean(viewer.canApprove)} initialMonth={month} initialTab={searchParams.tab || ""} />;
}
