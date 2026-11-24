import WaitlistClient from "@/components/bowbazar/WaitlistClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarWaitlistPage() {
  const { can } = await requireBranchPage("view");
  return <WaitlistClient can={can} />;
}
