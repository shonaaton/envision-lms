import { redirect } from "next/navigation";
import ExamCenterClient from "@/components/exams/ExamCenterClient";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ExamCenterPage() {
  const session = await auth();
  const role = String((session?.user as any)?.role || "");
  if (!role) redirect("/login");
  return <ExamCenterClient role={role} />;
}
