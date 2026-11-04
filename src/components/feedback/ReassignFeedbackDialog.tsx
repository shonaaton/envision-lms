"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Avatar } from "@/components/feedback/feedbackUi";

type CoachOption = { id: string; name: string; role: string; teachesStudent: boolean; isCurrent: boolean };

/**
 * Picks a coach for one or more reports the coach has not submitted yet.
 * Coaches who teach the student today are listed first.
 */
export default function ReassignFeedbackDialog({
  ids,
  summary,
  onClose,
  onDone,
}: {
  ids: string[];
  /** e.g. "Aarav's report" or "4 reports" */
  summary: string;
  onClose: () => void;
  onDone: (moved: number) => void;
}) {
  const [coaches, setCoaches] = useState<CoachOption[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [coachId, setCoachId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const idsKey = ids.join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/feedback/reassign?ids=${idsKey}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Could not load coaches.");
        if (!cancelled) setCoaches(payload.coaches || []);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load coaches.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = (coaches || []).filter((row) => !row.isCurrent && (!needle || row.name.toLowerCase().includes(needle)));
    return [
      { label: ids.length === 1 ? "Teaches this student" : "Teaches one of these students", rows: rows.filter((row) => row.teachesStudent) },
      { label: "Other coaches", rows: rows.filter((row) => !row.teachesStudent) },
    ].filter((group) => group.rows.length);
  }, [coaches, query, ids.length]);

  const chosen = coaches?.find((row) => row.id === coachId);

  async function submit() {
    if (!coachId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/feedback/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, coachId, note }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not reassign.");
      const failed = (payload.results || []).filter((row: any) => !row.ok);
      if (payload.moved) toast.success(`${payload.moved === 1 ? "Report" : `${payload.moved} reports`} moved to ${chosen?.name || "the coach"} - they have been notified`);
      if (failed.length) toast.error(failed.length === 1 ? failed[0].error : `${failed.length} could not be moved: ${failed[0].error}`);
      onDone(Number(payload.moved || 0));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reassign.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label="Reassign feedback">
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className="rounded-xl bg-brand-50 p-2 text-brand">
            <ArrowRightLeft size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black text-slate-950">Reassign {summary}</h2>
            <p className="mt-0.5 text-xs text-slate-500">The new coach gets the task and anything already drafted. It stays with them even if the class changes coach.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close" disabled={busy}>
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-slate-100 px-5 py-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input !pl-9" placeholder="Search coach" value={query} autoFocus onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>

        <div className="min-h-[160px] flex-1 overflow-y-auto px-3 py-2">
          {loadError && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{loadError}</p>}
          {!coaches && !loadError && <p className="py-8 text-center text-sm text-slate-500">Loading coaches…</p>}
          {coaches && !groups.length && <p className="py-8 text-center text-sm text-slate-500">No coach matches.</p>}
          {groups.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="px-2 pb-1 pt-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{group.label}</div>
              {group.rows.map((row) => (
                <label
                  key={row.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 ${coachId === row.id ? "bg-brand-50 ring-1 ring-brand/30" : "hover:bg-slate-50"}`}
                >
                  <input type="radio" name="reassign-coach" className="h-4 w-4 accent-[#5a1372]" checked={coachId === row.id} onChange={() => setCoachId(row.id)} />
                  <Avatar name={row.name} size={30} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{row.name}</span>
                  {row.role !== "instructor" && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">{row.role}</span>}
                </label>
              ))}
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-slate-100 px-5 py-4">
          <textarea
            className="input min-h-[60px] text-sm"
            maxLength={300}
            placeholder="Note for the new coach (optional) - e.g. why it moved"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary flex-1 justify-center" disabled={!coachId || busy} onClick={() => void submit()}>
              <ArrowRightLeft size={15} />
              {busy ? "Moving…" : chosen ? `Move to ${chosen.name}` : "Pick a coach"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
