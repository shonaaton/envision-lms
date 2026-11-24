import StudentsClient, { type StudentQuickFilter } from "@/components/bowbazar/StudentsClient";
import { requireBranchPage } from "@/lib/branch/page";

export const dynamic = "force-dynamic";

const QUICK_FILTERS: StudentQuickFilter[] = ["owing", "nologin", "nodetails"];

export default async function BowbazarStudentsPage({ searchParams }: { searchParams?: { filter?: string; new?: string } }) {
  const { can } = await requireBranchPage("view");
  // The Overview's "Needs attention" links open the list already filtered, or the add form.
  const filter = QUICK_FILTERS.find((value) => value === searchParams?.filter) || "";
  return <StudentsClient can={can} initialFilter={filter} startNew={searchParams?.new === "1"} />;
}
