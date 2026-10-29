import ExamsClient from "@/components/bowbazar/ExamsClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarExamsPage() {
  const { can } = await requireBranchPage("exams");
  return <ExamsClient can={can} />;
}
