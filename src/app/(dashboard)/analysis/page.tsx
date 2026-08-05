import AnalysisBoard from "@/components/quiz/AnalysisBoard";
import { auth } from "@/lib/auth";

export default async function AnalysisPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return <AnalysisBoard canUseLibrary={role === "instructor" || role === "admin"} />;
}
