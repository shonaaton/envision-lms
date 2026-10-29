import ChangesClient from "@/components/bowbazar/ChangesClient";
import { requireBranchPage } from "@/lib/branch/page";
import { todayKey } from "@/lib/branch/rules";

export const dynamic = "force-dynamic";

export default async function BowbazarChangesPage() {
  const { can } = await requireBranchPage("students");
  return <ChangesClient can={can} today={todayKey()} />;
}
