import { redirect } from "next/navigation";
import ExamRunner from "@/components/exams/ExamRunner";
import { auth } from "@/lib/auth";
import { redirectToLogin } from "@/lib/redirectToLogin";

export const dynamic = "force-dynamic";

export default async function ExamPage({ params }: { params: { id: string } }) {
  const session = await auth();
  // Signed out (a link opened from WhatsApp or email): sign in, then back to this exam.
  if (!session?.user) redirectToLogin();
  const role = String((session.user as any).role || "");
  // Only the student sits the exam; everyone else reads results on /exams.
  if (role !== "student") redirect("/exams");
  return <ExamRunner id={params.id} />;
}
