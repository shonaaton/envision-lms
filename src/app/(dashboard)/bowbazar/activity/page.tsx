import ActivityClient from "@/components/bowbazar/ActivityClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarActivityPage() {
  const { can } = await requireBranchPage("activity");
  return <ActivityClient can={can} />;
}
