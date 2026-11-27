import { redirectToLogin } from "@/lib/redirectToLogin";
import ExamCenterClient from "@/components/exams/ExamCenterClient";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ExamCenterPage() {
  const session = await auth();
  const role = String((session?.user as any)?.role || "");
  if (!role) redirectToLogin();
  return <ExamCenterClient role={role} />;
}
