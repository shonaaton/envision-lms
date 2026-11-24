import LeadsClient from "@/components/bowbazar/LeadsClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarLeadsPage() {
  const { can } = await requireBranchPage("students");
  return <LeadsClient can={can} />;
}
