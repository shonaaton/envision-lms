import AchievementsClient from "@/components/bowbazar/AchievementsClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarAchievementsPage() {
  const { can } = await requireBranchPage("achievements");
  return <AchievementsClient can={can} />;
}
