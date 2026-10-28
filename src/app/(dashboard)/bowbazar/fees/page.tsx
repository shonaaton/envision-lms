import FeesClient from "@/components/bowbazar/FeesClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarFeesPage() {
  const { can } = await requireBranchPage("fees");
  return <FeesClient can={can} />;
}
