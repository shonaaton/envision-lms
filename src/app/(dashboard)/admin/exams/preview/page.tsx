import ExamPreviewClient from "@/components/exams/ExamPreviewClient";

export const dynamic = "force-dynamic";

export default function AdminExamPreviewPage({ searchParams }: { searchParams: { tier?: string; level?: string } }) {
  return <ExamPreviewClient tier={String(searchParams.tier || "")} level={Number(searchParams.level) || 0} />;
}
