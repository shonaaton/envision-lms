"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, MessageSquareHeart, PartyPopper, Search } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import FeedbackForm from "@/components/feedback/FeedbackForm";
import { Avatar, MonthSwitcher, StatusBadge, TabBar, dueLabel, isOverdue, useFeedbackList, type FeedbackItem } from "@/components/feedback/feedbackUi";
import { questionSetFor } from "@/lib/feedback/feedbackQuestions";

type Tab = "todo" | "returned" | "done";

const TAB_STATUSES: Record<Tab, string[]> = {
  todo: ["pending", "draft"],
  returned: ["changes_requested"],
  done: ["submitted", "approved", "sent", "skipped"],
};

export default function CoachFeedbackClient({ initialMonth = "", initialOpen = null }: { initialMonth?: string; initialOpen?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [month, setMonth] = useState(initialMonth);
  const [tab, setTab] = useState<Tab>("todo");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  const { data, loading, error, setData } = useFeedbackList({ month });

  useEffect(() => {
    if (data?.month && data.month !== month) setMonth(data.month);
  }, [data?.month, month]);

  // A task link opens straight onto its student; land on the tab it lives in.
  useEffect(() => {
    if (!openId || !data) return;
    const target = data.items.find((row) => row.id === openId);
    if (!target) return;
    const home = (Object.keys(TAB_STATUSES) as Tab[]).find((key) => TAB_STATUSES[key].includes(target.status));
    if (home && home !== tab) setTab(home);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, data]);

  const items = useMemo(() => data?.items || [], [data?.items]);
  const total = items.length;
  const done = items.filter((row) => TAB_STATUSES.done.includes(row.status)).length;
  const counts = {
    todo: items.filter((row) => TAB_STATUSES.todo.includes(row.status)).length,
    returned: items.filter((row) => TAB_STATUSES.returned.includes(row.status)).length,
    done,
  };

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((row) => TAB_STATUSES[tab].includes(row.status))
      .filter((row) => !term || row.studentName.toLowerCase().includes(term));
  }, [items, tab, q]);

  // "Submit & next" walks the students still needing work, in list order.
  const queue = useMemo(() => items.filter((row) => [...TAB_STATUSES.todo, ...TAB_STATUSES.returned].includes(row.status)), [items]);
  const openItem = items.find((row) => row.id === openId) || null;
  const queueIndex = openItem ? queue.findIndex((row) => row.id === openItem.id) : -1;

  function changeMonth(value: string) {
    setMonth(value);
    setOpenId(null);
    router.replace(`${pathname}?month=${value}`, { scroll: false });
  }

  function onSaved(saved: FeedbackItem, advance: boolean) {
    setData((current) => (current ? { ...current, items: current.items.map((row) => (row.id === saved.id ? saved : row)) } : current));
    if (!advance) return;
    const remaining = queue.filter((row) => row.id !== saved.id);
    const next = remaining[Math.max(0, Math.min(queueIndex, remaining.length - 1))];
    setOpenId(next ? next.id : null);
  }

  const allDone = total > 0 && counts.todo === 0 && counts.returned === 0;
  const overdue = items.some(isOverdue);
  const percent = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="min-w-0 space-y-4 text-slate-950">
      <PageHeader
        eyebrow="Monthly feedback"
        icon={MessageSquareHeart}
        title={data?.monthLabel ? `${data.monthLabel} feedback` : "Monthly feedback"}
        subtitle="A quick monthly check-in for each student: tap a rating per skill and pick a highlight or two. An admin reviews it before it goes to the family."
      >
        <div className="flex flex-col gap-3 xl:items-end">
          <MonthSwitcher month={month} months={data?.months || []} onChange={changeMonth} />
          {total > 0 && (
            <div className="w-full rounded-xl border border-brand/10 bg-brand-50/40 p-3 xl:w-80">
              <div className="flex items-center justify-between text-sm">
                <span className="font-black text-slate-900">
                  {done} of {total} done
                </span>
                {data?.dueAt && !allDone && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${overdue ? "bg-rose-100 text-rose-700" : "bg-white text-slate-600"}`}>
                    <CalendarClock size={12} />
                    {dueLabel(data.dueAt)}
                  </span>
                )}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand/10">
                <div className="h-full rounded-full bg-gradient-to-r from-brand to-purple-500 transition-all" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}
        </div>
      </PageHeader>

      {allDone && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <PartyPopper size={22} />
          <div>
            <div className="font-black">All done for {data?.monthLabel}!</div>
            <div className="text-sm">Every report is with the admin team. Thank you.</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <TabBar<Tab>
          tabs={[
            { key: "todo", label: "To do", count: counts.todo },
            { key: "returned", label: "Returned", count: counts.returned },
            { key: "done", label: "Submitted", count: counts.done },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9" placeholder="Find a student" value={q} onChange={(event) => setQ(event.target.value)} />
        </div>
      </div>

      {loading && !data && <p className="py-10 text-center text-sm text-slate-500">Loading…</p>}
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {data && !visible.length && (
        <div className="rounded-2xl border border-brand/10 bg-white px-4 py-12 text-center shadow-sm">
          <CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-400" />
          <p className="text-sm font-bold text-slate-700">
            {total === 0 ? "No feedback due for this month. Reports open on the 25th." : tab === "todo" ? "Nothing left to do here." : "Nothing here yet."}
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((row) => {
          const set = questionSetFor(row.tier);
          const rated = Object.keys(row.ratings || {}).length;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setOpenId(row.id)}
              className="group flex items-center gap-3 rounded-2xl border border-brand/10 bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg hover:shadow-brand/10"
            >
              <Avatar name={row.studentName} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-black text-slate-950">{row.studentName}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="rounded-full bg-accent/70 px-1.5 py-0.5 font-bold text-[#3d0c4e]">{set.tierLabel}</span>
                  <span>
                    {row.stats.classesAttended}/{row.stats.classesScheduled} classes
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <StatusBadge status={row.status} overdue={isOverdue(row)} />
                  {row.status === "draft" && <span className="text-[11px] text-slate-400">{rated}/5 rated</span>}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-black text-brand opacity-80 transition group-hover:bg-brand group-hover:text-white">
                {TAB_STATUSES.done.includes(row.status) ? "View" : "Start"}
              </span>
            </button>
          );
        })}
      </div>

      {openItem && (
        <FeedbackForm
          key={openItem.id}
          item={openItem}
          previous={data?.previous?.[openItem.studentId]}
          position={queueIndex >= 0 ? { index: queueIndex, total: queue.length } : undefined}
          onClose={() => setOpenId(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
