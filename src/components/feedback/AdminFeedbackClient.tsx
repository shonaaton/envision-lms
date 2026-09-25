"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CheckCheck, FilePlus2, CheckCircle2, Clock3, Eye, Lock, Mail, MessageSquareHeart, RotateCcw, Search, Send, SkipForward, Users, X } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, StatCard } from "@/components/common/PageHeader";
import { Avatar, MonthSwitcher, ParentReportCard, StatusBadge, TabBar, dueLabel, isOverdue, patchFeedback, useFeedbackList, type FeedbackItem } from "@/components/feedback/feedbackUi";
import { PARENT_NOTE_MAX, PARENT_NOTE_MIN, questionSetFor } from "@/lib/feedback/feedbackQuestions";
import { isParentNoteComplete } from "@/lib/feedback/feedbackRules";

type Tab = "pending" | "submitted" | "changes_requested" | "sent" | "skipped";

const TAB_STATUSES: Record<Tab, string[]> = {
  pending: ["pending", "draft"],
  submitted: ["submitted"],
  changes_requested: ["changes_requested"],
  sent: ["approved", "sent"],
  skipped: ["skipped"],
};

function ReviewDrawer({ item, canApprove, onClose, onChanged }: { item: FeedbackItem; canApprove: boolean; onClose: () => void; onChanged: (item: FeedbackItem) => void }) {
  const [parentNote, setParentNote] = useState(item.parentNote);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [busy, setBusy] = useState("");

  async function run(action: string, body: Record<string, unknown>, success: string) {
    setBusy(action);
    try {
      const saved = await patchFeedback(item.id, { action, ...body });
      toast.success(success);
      if (saved.emailError) toast.warning(`Released to the portal, but: ${saved.emailError}`);
      onChanged(saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  const preview = { ...item, parentNote };
  const noteReady = isParentNoteComplete(parentNote);
  const waiting = item.status === "submitted";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-4xl flex-col overflow-y-auto bg-[#fbf7ff] shadow-2xl" role="dialog" aria-modal="true" aria-label={`Review ${item.studentName}`}>
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-brand/10 bg-white/95 px-5 py-4 backdrop-blur">
          <Avatar name={item.studentName} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-black">{item.studentName}</h2>
              <StatusBadge status={item.status} overdue={isOverdue(item)} />
            </div>
            <div className="text-xs text-slate-500">
              Coach {item.coachName} · {questionSetFor(item.tier).tierLabel}
              {item.submittedAt && ` · submitted ${new Date(item.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="grid flex-1 gap-5 p-5 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              <Eye size={13} />
              What the family will see
            </div>
            {["pending", "draft"].includes(item.status) && !Object.keys(item.ratings).length ? (
              <div className="rounded-2xl border border-dashed border-brand/20 bg-white p-8 text-center text-sm text-slate-500">The coach has not started this report yet.</div>
            ) : (
              <ParentReportCard item={preview} />
            )}
          </div>

          <aside className="space-y-3">
            <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/70 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-amber-800">
                <Lock size={12} />
                Internal note · not sent
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800">{item.internalNote || <span className="text-slate-400">No internal note.</span>}</p>
            </div>

            {item.status === "skipped" && (
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="font-black text-slate-800">Skipped by coach</div>
                <div className="mt-0.5 text-slate-600">{item.skipReason || "No reason given."}</div>
              </div>
            )}

            {item.reviewNote && item.status === "changes_requested" && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <div className="font-black">Sent back to coach</div>
                <div className="mt-0.5">{item.reviewNote}</div>
              </div>
            )}

            {item.status === "sent" && (
              <div className={`rounded-xl border p-3 text-sm ${item.emailError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
                <div className="flex items-center gap-1.5 font-black">
                  <Mail size={14} />
                  {item.emailError ? "Email not delivered" : "Emailed to family"}
                </div>
                <div className="mt-0.5 break-all">{item.emailError || item.emailTo}</div>
                {item.sentAt && <div className="mt-0.5 text-xs opacity-80">Released {new Date(item.sentAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>}
              </div>
            )}

            {canApprove && waiting && (
              <div className="space-y-2 rounded-xl border border-brand/10 bg-white p-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                    <span>
                      Note for parents <span className="text-rose-500">*</span>
                    </span>
                    <span className="font-semibold">
                      {parentNote.length}/{PARENT_NOTE_MAX}
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    className={`input !h-auto min-h-[140px] resize-y text-sm leading-6 ${noteReady ? "" : "border-rose-300 ring-2 ring-rose-100"}`}
                    maxLength={PARENT_NOTE_MAX}
                    value={parentNote}
                    onChange={(event) => setParentNote(event.target.value)}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    {parentNote.trim() !== item.parentNote.trim() ? (
                      <span className="font-bold text-brand">Edited - the family will get your version.</span>
                    ) : noteReady ? (
                      "Written by the coach. Edit freely before approving."
                    ) : (
                      <span className="font-bold text-rose-600">Required - at least {PARENT_NOTE_MIN} characters.</span>
                    )}
                  </p>
                </div>
                <button type="button" className="btn btn-primary w-full justify-center" disabled={Boolean(busy) || !noteReady} onClick={() => void run("approve", { parentNote }, "Approved and sent to the family")}>
                  <Send size={15} />
                  {busy === "approve" ? "Sending…" : "Approve & send"}
                </button>
                {returnOpen ? (
                  <div className="space-y-2">
                    <textarea className="input min-h-[70px] text-sm" maxLength={500} autoFocus placeholder="What should the coach change?" value={returnNote} onChange={(event) => setReturnNote(event.target.value)} />
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-ghost flex-1 justify-center text-xs" onClick={() => setReturnOpen(false)}>
                        Cancel
                      </button>
                      <button type="button" className="btn btn-outline flex-1 justify-center text-xs" disabled={Boolean(busy) || returnNote.trim().length < 3} onClick={() => void run("request_changes", { note: returnNote }, "Sent back to the coach")}>
                        Send back
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn btn-outline w-full justify-center" disabled={Boolean(busy)} onClick={() => setReturnOpen(true)}>
                    <RotateCcw size={15} />
                    Request changes
                  </button>
                )}
              </div>
            )}

            {canApprove && item.status === "sent" && (
              <button type="button" className="btn btn-outline w-full justify-center" disabled={Boolean(busy)} onClick={() => void run("resend", {}, "Email sent again")}>
                <Mail size={15} />
                {busy === "resend" ? "Sending…" : "Resend email"}
              </button>
            )}
            {canApprove && item.status === "skipped" && (
              <button type="button" className="btn btn-outline w-full justify-center" disabled={Boolean(busy)} onClick={() => void run("reopen", {}, "Reopened - the coach has the task again")}>
                <RotateCcw size={15} />
                Reopen for coach
              </button>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function AdminFeedbackClient({ canApprove, initialMonth = "", initialTab = "" }: { canApprove: boolean; initialMonth?: string; initialTab?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [month, setMonth] = useState(initialMonth);
  const [coach, setCoach] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [tab, setTab] = useState<Tab>(initialTab in TAB_STATUSES ? (initialTab as Tab) : "submitted");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { data, loading, error, reload, setData } = useFeedbackList({ month, coach, q: debouncedQ });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (data?.month && data.month !== month) setMonth(data.month);
  }, [data?.month, month]);

  useEffect(() => setSelected(new Set()), [tab, month, coach]);

  const items = useMemo(() => data?.items || [], [data?.items]);
  const count = (key: Tab) => TAB_STATUSES[key].reduce((sum, status) => sum + (data?.counts?.[status] || 0), 0);
  const visible = useMemo(() => items.filter((row) => TAB_STATUSES[tab].includes(row.status)), [items, tab]);
  const openItem = items.find((row) => row.id === openId) || null;
  const total = Object.values(data?.counts || {}).reduce((sum, value) => sum + value, 0);
  const overdueCount = items.filter(isOverdue).length;

  function changeMonth(value: string) {
    setMonth(value);
    router.replace(`${pathname}?month=${value}`, { scroll: false });
  }

  function replaceItem(saved: FeedbackItem) {
    setData((current) => {
      if (!current) return current;
      const before = current.items.find((row) => row.id === saved.id);
      const counts = { ...current.counts };
      if (before && before.status !== saved.status) {
        counts[before.status] = Math.max(0, (counts[before.status] || 1) - 1);
        counts[saved.status] = (counts[saved.status] || 0) + 1;
      }
      return { ...current, counts, items: current.items.map((row) => (row.id === saved.id ? saved : row)) };
    });
  }

  /** Opens the month now instead of waiting for the 25th sweep; re-running only adds students who are missing. */
  async function generateNow() {
    setGenerating(true);
    try {
      const response = await fetch("/api/feedback/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not generate reports");
      toast.success(payload.created ? `${payload.created} new report${payload.created === 1 ? "" : "s"} created - coaches have been notified` : "Everyone already has a report for this month");
      if (payload.month && payload.month !== month) changeMonth(payload.month);
      else await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate reports");
    } finally {
      setGenerating(false);
    }
  }

  async function bulkApprove() {
    if (!selected.size) return;
    setBulkBusy(true);
    try {
      const response = await fetch("/api/feedback/bulk-approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: Array.from(selected) }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not approve");
      const failed = (payload.results || []).filter((row: any) => !row.ok);
      toast.success(`${payload.approved} report${payload.approved === 1 ? "" : "s"} approved and sent`);
      if (failed.length) toast.error(`${failed.length} could not be approved: ${failed[0].error}`);
      setSelected(new Set());
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve");
    } finally {
      setBulkBusy(false);
    }
  }

  const allSelected = visible.length > 0 && visible.every((row) => selected.has(row.id));

  return (
    <div className="min-w-0 space-y-4 text-slate-950">
      <PageHeader
        eyebrow="Monthly feedback"
        icon={MessageSquareHeart}
        title={data?.monthLabel ? `${data.monthLabel} feedback` : "Monthly feedback"}
        subtitle={
          <>
            Coaches rate each student once a month; nothing reaches a family until it is approved here. Internal notes stay inside the academy.
            {data?.dueAt && <span className="font-semibold text-slate-700"> {dueLabel(data.dueAt)}.</span>}
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard label="Waiting on coaches" value={count("pending") + count("changes_requested")} icon={Clock3} tone="amber" />
          <StatCard label="Awaiting approval" value={count("submitted")} icon={Send} tone="purple" />
          <StatCard label="Sent to families" value={count("sent")} icon={CheckCircle2} tone="green" />
          <StatCard label="Overdue" value={overdueCount} icon={AlertTriangle} tone="rose" />
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <MonthSwitcher month={month} months={data?.months || []} onChange={changeMonth} />
        <select className="input w-auto" value={coach} onChange={(event) => setCoach(event.target.value)} aria-label="Coach">
          <option value="">All coaches</option>
          {(data?.coaches || []).map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9" placeholder="Search student" value={q} onChange={(event) => setQ(event.target.value)} />
        </div>
        {canApprove && (
          <button
            type="button"
            className="btn btn-outline ml-auto"
            disabled={generating}
            onClick={() => void generateNow()}
            title="Create this month's reports now, or add students who joined since the last run"
          >
            <FilePlus2 size={16} />
            {generating ? "Generating…" : "Generate reports"}
          </button>
        )}
      </div>

      {(data?.coaches?.length || 0) > 0 && !coach && (
        <section className="overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
            <Users size={13} />
            Coach progress
          </div>
          <div className="grid gap-2 p-2 sm:grid-cols-2 xl:grid-cols-3">
            {data!.coaches.map((row) => {
              const pct = row.total ? Math.round((row.done / row.total) * 100) : 0;
              return (
                <button key={row.id} type="button" onClick={() => setCoach(row.id)} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-left hover:border-brand/20 hover:bg-brand-50/40">
                  <Avatar name={row.name} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-bold">{row.name}</span>
                      <span className="shrink-0 text-xs font-bold text-slate-500">
                        {row.done}/{row.total}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand/10">
                      <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                    </div>
                    {row.overdue > 0 && <div className="mt-1 text-[11px] font-bold text-rose-600">{row.overdue} overdue</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <TabBar<Tab>
          tabs={[
            { key: "submitted", label: "Awaiting approval", count: count("submitted") },
            { key: "pending", label: "Pending from coach", count: count("pending") },
            { key: "changes_requested", label: "Returned", count: count("changes_requested") },
            { key: "sent", label: "Sent", count: count("sent") },
            { key: "skipped", label: "Skipped", count: count("skipped") },
          ]}
          value={tab}
          onChange={setTab}
        />
        {canApprove && tab === "submitted" && selected.size > 0 && (
          <button type="button" className="btn btn-primary ml-auto" disabled={bulkBusy} onClick={() => void bulkApprove()}>
            <CheckCheck size={16} />
            {bulkBusy ? "Sending…" : `Approve & send ${selected.size}`}
          </button>
        )}
      </div>

      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-xl shadow-brand/5">
        {loading && !data && <p className="px-4 py-10 text-center text-sm text-slate-500">Loading…</p>}
        {data && !visible.length && (
          <div className="px-4 py-12 text-center">
            <CheckCircle2 size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">{total === 0 ? "No feedback for this month yet. Reports open automatically on the 25th." : "Nothing in this list."}</p>
            {total === 0 && canApprove && (
              <button type="button" className="btn btn-primary mt-3" disabled={generating} onClick={() => void generateNow()}>
                <FilePlus2 size={16} />
                {generating ? "Generating…" : "Generate this month's reports now"}
              </button>
            )}
          </div>
        )}
        {visible.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {canApprove && tab === "submitted" && (
              <li className="flex items-center gap-3 bg-slate-50/70 px-4 py-2 text-xs font-bold text-slate-500">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#5a1372]"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((row) => row.id)))}
                  aria-label="Select all"
                />
                Select all {visible.length}
              </li>
            )}
            {visible.map((row) => {
              const rated = Object.values(row.ratings || {});
              const average = rated.length ? rated.reduce((sum, value) => sum + value, 0) / rated.length : 0;
              return (
                <li key={row.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70">
                  {canApprove && tab === "submitted" && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 accent-[#5a1372]"
                      checked={selected.has(row.id)}
                      onChange={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        })
                      }
                      aria-label={`Select ${row.studentName}`}
                    />
                  )}
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpenId(row.id)}>
                    <Avatar name={row.studentName} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-bold text-slate-950">{row.studentName}</span>
                        <StatusBadge status={row.status} overdue={isOverdue(row)} />
                        {row.internalNote && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                            <Lock size={11} />
                            Internal note
                          </span>
                        )}
                        {row.status === "sent" && row.emailError && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                            <Mail size={11} />
                            Email failed
                          </span>
                        )}
                        {row.status === "skipped" && <SkipForward size={13} className="text-slate-400" />}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        <span>Coach {row.coachName}</span>
                        <span>{questionSetFor(row.tier).tierLabel}</span>
                        <span>
                          {row.stats.classesAttended}/{row.stats.classesScheduled} classes
                        </span>
                        {average > 0 && <span>avg {average.toFixed(1)}/5</span>}
                      </div>
                    </div>
                  </button>
                  {canApprove && row.status === "submitted" && (
                    <button
                      type="button"
                      className="btn btn-outline hidden shrink-0 px-3 py-1.5 text-xs sm:inline-flex"
                      onClick={async () => {
                        try {
                          const saved = await patchFeedback(row.id, { action: "approve" });
                          replaceItem(saved);
                          toast.success(`${row.studentName.split(" ")[0]}'s report sent`);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Could not approve");
                        }
                      }}
                    >
                      <Send size={13} />
                      Approve
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {openItem && (
        <ReviewDrawer
          key={openItem.id}
          item={openItem}
          canApprove={canApprove}
          onClose={() => setOpenId(null)}
          onChanged={(saved) => {
            replaceItem(saved);
            if (saved.status !== openItem.status) setOpenId(null);
          }}
        />
      )}
    </div>
  );
}
