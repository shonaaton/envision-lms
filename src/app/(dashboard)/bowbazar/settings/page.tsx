import SettingsClient from "@/components/bowbazar/SettingsClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarSettingsPage() {
  const { can } = await requireBranchPage("fees");
  return <SettingsClient can={can} />;
}
