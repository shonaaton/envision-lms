import HomeworkTemplatesClient from "@/components/bowbazar/HomeworkTemplatesClient";
import { requireBranchPage } from "@/lib/branch/page";
import { getBranchSettings } from "@/lib/branch/settings";

export const dynamic = "force-dynamic";

export default async function BowbazarHomeworkPage() {
  const { can, branch } = await requireBranchPage("attendance");
  const settings = await getBranchSettings(branch);
  return <HomeworkTemplatesClient can={can} autoHomework={settings.autoHomework} />;
}
