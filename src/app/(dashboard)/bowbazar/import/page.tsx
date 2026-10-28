import ImportClient from "@/components/bowbazar/ImportClient";
import { redirect } from "next/navigation";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarImportPage() {
  const { can } = await requireBranchPage("students");
  if (!can.includes("fees")) redirect("/bowbazar");
  return <ImportClient can={can} />;
}
