"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarX, CheckCircle2, ChevronDown, Eye, Loader2, Send, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { academyDateKey, formatAcademyDateTime } from "@/lib/academyTime";
import { cn } from "@/lib/utils";

type Delivery = { status?: string; sentCount?: number; failedCount?: number };
type Skipped = { classroomId: string; title: string; batch?: string; kind: string; detail: string; when?: string };
type Unrestored = { title?: string; batch?: string; topicName?: string; at?: string };

type Holiday = {
  id: string;
  startKey: string;
  endKey: string;
  rangeLabel: string;
  reason: string;
  message: string;
  status: "active" | "cancelled";
  phase: "upcoming" | "ongoing" | "past" | "cancelled";
  canCancel: boolean;
  classesMoved: number;
  classroomCount: number;
  skipped: Skipped[];
  unrestored: Unrestored[];
  restoredCount: number;
  createdBy: string;
  createdAt: string;
  cancelledBy: string;
  cancelledAt?: string;
  cancelMessage: string;
  announcement: Delivery;
  cancelAnnouncement: Delivery;
};

type Preview = {
  classrooms: number;
  classesOnHoliday: number;
  classesMoved: number;
  classesAdded: number;
  details: Array<{
    classroomId: string;
    title: string;
    batch: string;
    coach: string;
    inHoliday: number;
    newEndDate?: string;
    moves: Array<{ sessionId: string; topicName: string; from: string; to: string }>;
  }>;
  skipped: Skipped[];
};

const WHATSAPP_LIMIT = 300;

const phaseStyle: Record<Holiday["phase"], string> = {
  upcoming: "bg-brand/10 text-brand",
  ongoing: "bg-amber-50 text-amber-700",
  past: "bg-slate-100 text-slate-600",
  cancelled: "bg-red-50 text-red-700",
};

function when(value?: string) {
  if (!value) return "-";
  return formatAcademyDateTime(value, { weekday: "short", year: undefined });
}

/**
 * The dates, the reason and the "classes move to the next class" line are added
 * to every copy by the server, so the suggestion is only the personal note.
 */
function suggestedMessage(reason: string) {
  return reason.trim()
    ? `Wishing all our students, parents and coaches a very happy ${reason.trim()}! We look forward to seeing you back at the board.`
    : "Enjoy the break! We look forward to seeing you back at the board.";
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Something went wrong.");
  return data;
}

function DeliveryLine({ label, delivery }: { label: string; delivery: Delivery }) {
  if (!delivery?.status || delivery.status === "none") return null;
  const sending = delivery.status === "pending" || delivery.status === "sending";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
      {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
      {label}: {sending ? "sending" : "sent"} to {delivery.sentCount || 0}
      {delivery.failedCount ? <span className="text-red-600">, {delivery.failedCount} failed</span> : null}
    </span>
  );
}

function SkippedList({ items, title }: { items: Skipped[]; title: string }) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center gap-2 text-sm font-black text-amber-800">
        <AlertTriangle size={15} /> {title} ({items.length})
      </div>
      <ul className="mt-2 space-y-1 text-xs text-amber-900">
        {items.map((item, index) => (
          <li key={`${item.classroomId}-${index}`}>
            <span className="font-bold">{item.batch || item.title}</span>
            {item.when ? ` - ${when(item.when)}` : ""}: {item.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HolidaysClient() {
  const today = useMemo(() => academyDateKey(new Date()), []);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cancelling, setCancelling] = useState<Holiday | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await readJson(await fetch("/api/admin/holidays", { cache: "no-store" }));
      setHolidays(data.holidays || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While an announcement is still going out, keep its counts moving.
  const sending = holidays.some((item) => ["pending", "sending"].includes(String(item.announcement?.status)) || ["pending", "sending"].includes(String(item.cancelAnnouncement?.status)));
  useEffect(() => {
    if (!sending) return;
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [sending, load]);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-brand/10 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand text-accent">
              <CalendarX size={20} />
            </span>
            <div>
              <h1 className="text-xl font-black text-slate-950">Academy Holidays</h1>
              <p className="text-sm text-slate-500">
                Close the whole academy for a few days. Every class on those days moves to its batch&apos;s next class, the topics move with it, and
                students, parents and coaches are told.
              </p>
            </div>
          </div>
          <button type="button" className="btn-primary h-10 shrink-0" onClick={() => setDrawerOpen(true)}>
            <CalendarX size={16} /> Declare holiday
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-brand/10 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-black text-slate-950">Holidays</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {loading && <div className="p-5 text-sm text-slate-500">Loading holidays...</div>}
          {!loading && !holidays.length && <div className="p-8 text-center text-sm text-slate-500">No academy holidays yet.</div>}
          {holidays.map((holiday) => (
            <article key={holiday.id} className="space-y-2 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-black text-slate-950">{holiday.rangeLabel}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold capitalize", phaseStyle[holiday.phase])}>{holiday.phase}</span>
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-brand">{holiday.reason}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {holiday.classesMoved} class{holiday.classesMoved === 1 ? "" : "es"} moved across {holiday.classroomCount} classroom{holiday.classroomCount === 1 ? "" : "s"}
                    {holiday.createdBy ? ` - declared by ${holiday.createdBy}` : ""}
                  </div>
                </div>
                {holiday.canCancel && (
                  <button type="button" onClick={() => setCancelling(holiday)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm font-bold text-red-700 hover:bg-red-50">
                    <Undo2 size={15} /> Cancel holiday
                  </button>
                )}
              </div>
              <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{holiday.message}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <DeliveryLine label="Announcement" delivery={holiday.announcement} />
                <DeliveryLine label="Cancellation notice" delivery={holiday.cancelAnnouncement} />
              </div>
              {holiday.status === "cancelled" && (
                <div className="text-xs text-slate-500">
                  Cancelled{holiday.cancelledBy ? ` by ${holiday.cancelledBy}` : ""} - {holiday.restoredCount} class{holiday.restoredCount === 1 ? "" : "es"} moved back.
                </div>
              )}
              {!!holiday.unrestored.length && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                  <div className="font-black">Needs a manual fix ({holiday.unrestored.length})</div>
                  <p className="mt-0.5">These classes were changed after the holiday moved them, so they were left where they are:</p>
                  <ul className="mt-1 space-y-0.5">
                    {holiday.unrestored.map((item, index) => (
                      <li key={index}>
                        <span className="font-bold">{item.batch || item.title}</span> - {item.topicName || "class"} ({when(item.at)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {holiday.status === "active" && <SkippedList items={holiday.skipped} title="Not moved automatically" />}
            </article>
          ))}
        </div>
      </section>

      {drawerOpen && (
        <DeclareDrawer
          today={today}
          onClose={() => setDrawerOpen(false)}
          onDeclared={() => {
            setDrawerOpen(false);
            load();
          }}
        />
      )}
      {cancelling && (
        <CancelDialog
          holiday={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={() => {
            setCancelling(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function DeclareDrawer({ today, onClose, onDeclared }: { today: string; onClose: () => void; onDeclared: () => void }) {
  const [startKey, setStartKey] = useState(today);
  const [endKey, setEndKey] = useState(today);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState(() => suggestedMessage(""));
  const [messageEdited, setMessageEdited] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "declare">("");
  const [open, setOpen] = useState<string | null>(null);

  // The preview is only valid for the exact inputs it was made from.
  useEffect(() => {
    setPreview(null);
    if (!messageEdited) setMessage(suggestedMessage(reason));
  }, [startKey, endKey, reason, messageEdited]);

  const body = { startKey, endKey, reason: reason.trim(), message: message.trim() };

  async function runPreview() {
    setBusy("preview");
    try {
      const data = await readJson(await fetch("/api/admin/holidays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, dryRun: true }) }));
      setPreview(data.preview);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy("");
    }
  }

  async function declare() {
    setBusy("declare");
    try {
      const data = await readJson(await fetch("/api/admin/holidays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      toast.success(`Holiday declared - ${data.classesMoved} class${data.classesMoved === 1 ? "" : "es"} moved. The announcement is going out now.`);
      onDeclared();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-lg font-black text-slate-950">Declare academy holiday</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">First day closed</span>
              <input
                type="date"
                min={today}
                value={startKey}
                onChange={(event) => {
                  setStartKey(event.target.value);
                  if (!endKey || endKey < event.target.value) setEndKey(event.target.value);
                }}
                className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Last day closed</span>
              <input
                type="date"
                min={startKey || today}
                value={endKey}
                onChange={(event) => setEndKey(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Reason</span>
            <input
              value={reason}
              maxLength={120}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Diwali"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
            />
          </label>
          <label className="block">
            <span className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-500">
              Announcement message
              {messageEdited && (
                <button type="button" className="normal-case text-brand hover:underline" onClick={() => setMessageEdited(false)}>
                  Use suggested message
                </button>
              )}
            </span>
            <textarea
              value={message}
              rows={6}
              maxLength={2000}
              onChange={(event) => {
                setMessage(event.target.value);
                setMessageEdited(true);
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Goes to every student, their parents and every coach - in the portal, by email and on WhatsApp. The dates, the reason and a line saying classes move
              to the next class are added for you.
              {message.trim().length > WHATSAPP_LIMIT && (
                <span className="font-semibold text-amber-700"> WhatsApp only fits {WHATSAPP_LIMIT} characters, so it gets a shortened copy; email and the portal get it in full.</span>
              )}
            </span>
          </label>

          {preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Batches affected" value={preview.classrooms} />
                <Stat label="Classes on holiday" value={preview.classesOnHoliday} />
                <Stat label="Classes moving" value={preview.classesMoved} />
                <Stat label="Courses extended by" value={`${preview.classesAdded} cl.`} />
              </div>
              {!preview.classrooms && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No batch has a class on these days. The announcement still goes out.</div>}
              <SkippedList items={preview.skipped} title="Will not move - handle these by hand" />
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {preview.details.map((item) => (
                  <div key={item.classroomId}>
                    <button
                      type="button"
                      onClick={() => setOpen(open === item.classroomId ? null : item.classroomId)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-950">{item.batch || item.title}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {item.title}
                          {item.coach ? ` - ${item.coach}` : ""} - {item.inHoliday} on holiday, {item.moves.length} moving
                        </span>
                      </span>
                      <ChevronDown size={16} className={cn("shrink-0 text-slate-400 transition", open === item.classroomId && "rotate-180")} />
                    </button>
                    {open === item.classroomId && (
                      <ul className="space-y-1 px-3 pb-3 text-xs text-slate-600">
                        {item.moves.map((move) => (
                          <li key={move.sessionId} className="flex flex-wrap items-center gap-1">
                            <span className="font-semibold text-slate-800">{move.topicName || "Class"}</span>:
                            <span>{when(move.from)}</span>
                            <ArrowRight size={12} />
                            <span className="font-semibold text-brand">{when(move.to)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 p-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={runPreview} disabled={!!busy} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {busy === "preview" ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Preview changes
          </button>
          <button type="button" onClick={declare} disabled={!preview || !!busy} className="btn-primary h-10 disabled:opacity-50" title={preview ? "" : "Preview the changes first"}>
            {busy === "declare" ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Confirm &amp; send announcement
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelDialog({ holiday, onClose, onCancelled }: { holiday: Holiday; onClose: () => void; onCancelled: () => void }) {
  const [message, setMessage] = useState(`The academy holiday on ${holiday.rangeLabel} is cancelled. Classes will run as usual on their original dates.`);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const data = await readJson(await fetch(`/api/admin/holidays/${holiday.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", message }) }));
      const left = data.unrestored?.length || 0;
      toast.success(`Holiday cancelled - ${data.restoredCount} class${data.restoredCount === 1 ? "" : "es"} moved back.${left ? ` ${left} need a manual fix.` : ""}`);
      onCancelled();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-black text-slate-950">Cancel holiday: {holiday.rangeLabel}</h2>
        <p className="mt-1 text-sm text-slate-600">
          Classes the holiday moved go back to their original dates, as long as they haven&apos;t been changed since. Any that were will be listed for you to fix.
          Everyone gets this cancellation notice.
        </p>
        <textarea
          value={message}
          rows={4}
          maxLength={2000}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
            Keep holiday
          </button>
          <button type="button" onClick={confirm} disabled={busy || !message.trim()} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />} Cancel holiday
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="text-lg font-black text-slate-950">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
