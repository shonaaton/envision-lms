import StudentsClient from "@/components/bowbazar/StudentsClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarStudentsPage() {
  const { can } = await requireBranchPage("view");
  return <StudentsClient can={can} />;
}
