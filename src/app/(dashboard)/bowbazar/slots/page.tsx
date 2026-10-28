import SlotsClient from "@/components/bowbazar/SlotsClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarSlotsPage() {
  const { can } = await requireBranchPage("view");
  return <SlotsClient can={can} />;
}
