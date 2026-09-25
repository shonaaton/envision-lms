"use client";

import { useState } from "react";
import { MessageSquareHeart, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { ParentReportCard, useFeedbackList } from "@/components/feedback/feedbackUi";
import { monthLabel } from "@/lib/feedback/feedbackCycleDates";

export default function StudentFeedbackClient({ initialMonth }: { initialMonth?: string }) {
  const [month, setMonth] = useState(initialMonth || "");
  const { data, loading, error } = useFeedbackList({ month });
  const months = data?.months || [];
  const items = data?.items || [];

  return (
    <div className="min-w-0 space-y-4 text-slate-950">
      <PageHeader
        eyebrow="My progress"
        icon={MessageSquareHeart}
        title="Monthly progress reports"
        subtitle="Every month your coach shares how you are doing and what to work on next."
      >
        {months.length > 0 && (
          <div className="flex flex-wrap gap-1.5 xl:justify-end">
            <button type="button" onClick={() => setMonth("")} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!month ? "bg-brand text-white" : "bg-brand-50 text-brand hover:bg-brand/10"}`}>
              All months
            </button>
            {months.map((value) => (
              <button key={value} type="button" onClick={() => setMonth(value)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${month === value ? "bg-brand text-white" : "bg-brand-50 text-brand hover:bg-brand/10"}`}>
                {monthLabel(value)}
              </button>
            ))}
          </div>
        )}
      </PageHeader>

      {loading && !data && <p className="py-10 text-center text-sm text-slate-500">Loading…</p>}
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {data && !items.length && (
        <div className="rounded-2xl border border-brand/10 bg-white px-4 py-14 text-center shadow-sm">
          <Sparkles size={30} className="mx-auto mb-2 text-accent-500" />
          <p className="font-black text-slate-800">No reports yet</p>
          <p className="mt-1 text-sm text-slate-500">Your first monthly report will appear here at the start of next month.</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <ParentReportCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
