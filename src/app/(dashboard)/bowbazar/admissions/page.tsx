import AdmissionsClient from "@/components/bowbazar/AdmissionsClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarAdmissionsPage() {
  const { can } = await requireBranchPage("students");
  return <AdmissionsClient can={can} />;
}
