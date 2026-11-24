import ExamPrintClient from "@/components/exams/ExamPrintClient";

export const dynamic = "force-dynamic";

// Outside the (dashboard) group on purpose: the portal shell scrolls an inner panel,
// which would cut a multi-page print to one page. The paper API still checks the admin Exams grant.
export default function AdminExamPrintPage({ searchParams }: { searchParams: { tier?: string; level?: string; answers?: string } }) {
  return <ExamPrintClient tier={String(searchParams.tier || "")} level={Number(searchParams.level) || 0} answers={searchParams.answers === "1"} />;
}
