import OverviewClient from "@/components/bowbazar/OverviewClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarOverviewPage() {
  const { can } = await requireBranchPage("view");
  return <OverviewClient can={can} />;
}
