import NewHomeworkForm from "@/components/homework/NewHomeworkForm";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

export default async function BowbazarNewHomeworkPage() {
  await requireBranchPage("attendance");
  return <NewHomeworkForm branch />;
}
