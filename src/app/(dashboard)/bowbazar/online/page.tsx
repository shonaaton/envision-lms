import OnlineClassesClient from "@/components/bowbazar/OnlineClassesClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarOnlineClassesPage() {
  const { can } = await requireBranchPage("attendance");
  return <OnlineClassesClient can={can} />;
}
