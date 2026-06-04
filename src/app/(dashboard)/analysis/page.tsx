import AnalysisBoard from "@/components/quiz/AnalysisBoard";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AnalysisPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role === "student") redirect("/dashboard");
  return <AnalysisBoard />;
}
