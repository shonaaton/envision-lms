import AccessClient from "@/components/bowbazar/AccessClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarAccessPage() {
  const { can } = await requireBranchPage("staff");
  return <AccessClient can={can} />;
}
