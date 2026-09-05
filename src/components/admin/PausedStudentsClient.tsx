"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Search,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

export type PauseBatch = { _id: string; name: string; isActive?: boolean };

export type PauseStudent = {
  _id: string;
  name: string;
  email?: string;
  username?: string;
  countryCode?: string;
  phone?: string;
  batches?: PauseBatch[];
};

export type VoidedInvoice = {
  invoice?: string;
  invoiceNumber?: string;
  title?: string;
  dueDate?: string;
  totalAmount?: number;
  previousStatus?: string;
};

export type PauseRecord = {
  _id: string;
  student: PauseStudent | null;
  batch?: PauseBatch | null;
  batchName?: string;
  status: "active" | "resumed" | "cancelled";
  pausedFrom: string;
  pausedUntil: string;
  expectedRestartDate?: string;
  reason?: string;
  pausedByName?: string;
  pausedAt?: string;
  voidedInvoices?: VoidedInvoice[];
  feeSnapshot?: { planName?: string; planType?: "monthly" | "credits" };
  resumedAt?: string;
  resumedByName?: string;
  resumeBatch?: PauseBatch | null;
  resumeBatchName?: string;
  nextInvoiceDate?: string;
  resumeInvoiceNumber?: string;
  resumeNote?: string;
  cancelledAt?: string;
  cancelReason?: string;
};

type StatusTab = "active" | "resumed" | "all";

const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: "active", label: "Currently paused" },
  { key: "resumed", label: "Reinstated" },
  { key: "all", label: "All records" },
];

function dateInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatINR(paise?: number) {
  return `₹${((Number(paise) || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayInputValue() {
  return dateInputValue(new Date().toISOString());
}

/** Days left in the pause window — negative once the pause has run past its date. */
function daysRemaining(pausedUntil?: string) {
  if (!pausedUntil) return null;
  const until = new Date(pausedUntil);
  if (Number.isNaN(until.getTime())) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((until.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function StatusChip({ pause }: { pause: PauseRecord }) {
  if (pause.status === "resumed") {
    return <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Reinstated</span>;
  }
  if (pause.status === "cancelled") {
    return <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Pause cancelled</span>;
  }
  const left = daysRemaining(pause.pausedUntil);
  if (left !== null && left < 0) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700"><AlertTriangle size={12} />Overdue by {Math.abs(left)}d</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
      <PauseCircle size={12} />
      {left === null ? "Paused" : `${left}d left`}
    </span>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand/10 bg-white px-3 py-2 shadow-sm">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/10 text-brand">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
        <span className="block text-lg font-black leading-tight text-slate-950">{value}</span>
      </span>
    </div>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="mt-10 w-full max-w-xl rounded-2xl border border-brand/10 bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">{title}</h2>
            {subtitle && <p className="mt-1 text-xs leading-5 text-slate-600">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-4 text-slate-500">{hint}</span>}
    </label>
  );
}

export default function PausedStudentsClient({ canManage }: { canManage: boolean }) {
  const [tab, setTab] = useState<StatusTab>("active");
  const [q, setQ] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [pauses, setPauses] = useState<PauseRecord[]>([]);
  const [batches, setBatches] = useState<PauseBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [resumeTarget, setResumeTarget] = useState<PauseRecord | null>(null);
  const [editTarget, setEditTarget] = useState<PauseRecord | null>(null);
  const [detail, setDetail] = useState<PauseRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status: tab });
    if (q) params.set("q", q);
    if (batchFilter) params.set("batch", batchFilter);
    const response = await fetch(`/api/admin/student-pauses?${params}`, { cache: "no-store" });
    if (!response.ok) {
      setLoading(false);
      toast.error("Could not load the paused student list.");
      return;
    }
    const data = await response.json();
    setPauses(data.pauses || []);
    setBatches(data.batches || []);
    setLoading(false);
  }, [batchFilter, q, tab]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  const stats = useMemo(() => {
    const active = pauses.filter((pause) => pause.status === "active");
    const overdue = active.filter((pause) => {
      const left = daysRemaining(pause.pausedUntil);
      return left !== null && left < 0;
    });
    const voided = pauses.reduce((total, pause) => total + (pause.voidedInvoices?.length || 0), 0);
    return { shown: pauses.length, active: active.length, overdue: overdue.length, voided };
  }, [pauses]);

  async function cancelPause(pause: PauseRecord) {
    const reason = window.prompt(`Cancel the pause for ${pause.student?.name || "this student"}? Any invoices it voided will be restored.\n\nReason (optional):`);
    if (reason === null) return;
    const response = await fetch(`/api/admin/student-pauses/${pause._id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Could not cancel this pause.");
      return;
    }
    toast.success(`Pause cancelled. ${data.invoicesRestored || 0} invoice(s) restored.`);
    load();
  }

  return (
    <div className="min-h-screen min-w-0 text-slate-950">
      <div className="mb-5 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-brand">
            <PauseCircle size={14} />
            User Management
          </div>
          <h1 className="mt-3 text-3xl font-black text-brand">Paused Students</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Students who have stepped out of a running batch for a fixed period. Their seat is held, upcoming invoices are voided, and billing
            restarts only on the date you choose when reinstating them.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Listed" value={stats.shown} icon={<Users size={15} />} />
          <Stat label="Paused now" value={stats.active} icon={<PauseCircle size={15} />} />
          <Stat label="Past end date" value={stats.overdue} icon={<AlertTriangle size={15} />} />
          <Stat label="Invoices voided" value={stats.voided} icon={<CalendarClock size={15} />} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-brand/10 bg-white p-1 shadow-sm">
          {STATUS_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${tab === item.key ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search student or batch"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <select className="input max-w-[220px]" value={batchFilter} onChange={(event) => setBatchFilter(event.target.value)}>
          <option value="">All batches</option>
          {batches.map((batch) => (
            <option key={batch._id} value={batch._id}>{batch.name}</option>
          ))}
        </select>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => setPauseModalOpen(true)}>
            <PauseCircle size={16} />
            Pause a student
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-brand/10 bg-white shadow-xl shadow-brand/5">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3 font-bold">Student</th>
              <th className="px-4 py-3 font-bold">Batch</th>
              <th className="px-4 py-3 font-bold">Paused from</th>
              <th className="px-4 py-3 font-bold">Paused till</th>
              <th className="px-4 py-3 font-bold">Plans to restart</th>
              <th className="px-4 py-3 font-bold">Invoices voided</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">Loading paused students…</td></tr>
            )}
            {!loading && !pauses.length && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <PauseCircle size={28} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-bold text-slate-700">No records here yet</p>
                  <p className="mt-1 text-xs text-slate-500">Pause a student from this page or from the student list in Users.</p>
                </td>
              </tr>
            )}
            {!loading && pauses.map((pause) => (
              <tr key={pause._id} className="align-top hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <button type="button" className="text-left font-bold text-brand hover:underline" onClick={() => setDetail(pause)}>
                    {pause.student?.name || "Deleted student"}
                  </button>
                  <div className="text-xs text-slate-500">{pause.student?.username || pause.student?.email || ""}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{pause.batch?.name || pause.batchName || "-"}</div>
                  {pause.status === "resumed" && (pause.resumeBatch?.name || pause.resumeBatchName) && (
                    <div className="text-xs text-slate-500">Returned to {pause.resumeBatch?.name || pause.resumeBatchName}</div>
                  )}
                </td>
                <td className="px-4 py-3">{formatDate(pause.pausedFrom)}</td>
                <td className="px-4 py-3 font-semibold">{formatDate(pause.pausedUntil)}</td>
                <td className="px-4 py-3">{formatDate(pause.expectedRestartDate)}</td>
                <td className="px-4 py-3">
                  <span className="font-semibold">{pause.voidedInvoices?.length || 0}</span>
                  {pause.status === "resumed" && pause.nextInvoiceDate && (
                    <div className="text-xs text-emerald-700">Next invoice {formatDate(pause.nextInvoiceDate)}</div>
                  )}
                </td>
                <td className="px-4 py-3"><StatusChip pause={pause} /></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {canManage && pause.status === "active" && (
                      <>
                        <button type="button" className="btn btn-primary px-3 py-1.5 text-xs" onClick={() => setResumeTarget(pause)}>
                          <PlayCircle size={14} />
                          Reactivate
                        </button>
                        <button type="button" className="btn btn-outline px-3 py-1.5 text-xs" onClick={() => setEditTarget(pause)}>
                          <CalendarDays size={14} />
                          Dates
                        </button>
                        <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs text-rose-600" onClick={() => cancelPause(pause)}>
                          <Undo2 size={14} />
                          Cancel
                        </button>
                      </>
                    )}
                    <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => setDetail(pause)}>
                      Details
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pauseModalOpen && (
        <PauseStudentModal
          onClose={() => setPauseModalOpen(false)}
          onDone={() => {
            setPauseModalOpen(false);
            setTab("active");
            load();
          }}
        />
      )}
      {resumeTarget && (
        <ResumeStudentModal
          pause={resumeTarget}
          batches={batches}
          onClose={() => setResumeTarget(null)}
          onDone={() => {
            setResumeTarget(null);
            load();
          }}
        />
      )}
      {editTarget && (
        <EditPauseModal
          pause={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={() => {
            setEditTarget(null);
            load();
          }}
        />
      )}
      {detail && <PauseDetailModal pause={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

export function PauseStudentModal({
  presetStudent,
  onClose,
  onDone,
}: {
  presetStudent?: { _id: string; name: string; batches?: PauseBatch[] };
  onClose: () => void;
  onDone: () => void;
}) {
  const [students, setStudents] = useState<PauseStudent[]>([]);
  const [batches, setBatches] = useState<PauseBatch[]>([]);
  const [studentId, setStudentId] = useState(presetStudent?._id || "");
  const [batchId, setBatchId] = useState(presetStudent?.batches?.[0]?._id || "");
  const [pausedFrom, setPausedFrom] = useState(todayInputValue());
  const [pausedUntil, setPausedUntil] = useState("");
  const [expectedRestartDate, setExpectedRestartDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/student-pauses/candidates", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { students: [], batches: [] }))
      .then((data) => {
        setStudents(data.students || []);
        setBatches(data.batches || []);
      })
      .catch(() => undefined);
  }, []);

  const selectedStudent = useMemo(
    () => students.find((student) => student._id === studentId),
    [studentId, students]
  );

  useEffect(() => {
    if (presetStudent) return;
    const firstBatch = selectedStudent?.batches?.[0]?._id;
    if (firstBatch) setBatchId(firstBatch);
  }, [presetStudent, selectedStudent]);

  async function submit() {
    if (!studentId) return toast.error("Choose the student to pause.");
    if (!pausedUntil) return toast.error("Choose the date the pause runs until.");
    setSaving(true);
    const response = await fetch("/api/admin/student-pauses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student: studentId,
        batch: batchId || undefined,
        pausedFrom,
        pausedUntil,
        expectedRestartDate: expectedRestartDate || undefined,
        reason,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      toast.error(data.error || "Could not pause this student.");
      return;
    }
    toast.success(
      data.voidedInvoices
        ? `Student paused. ${data.voidedInvoices} upcoming invoice(s) voided.`
        : "Student paused. No upcoming invoices needed voiding."
    );
    onDone();
  }

  return (
    <Modal
      title="Pause a student from the batch"
      subtitle="The batch keeps running for everyone else. This student is taken off upcoming classes and every unpaid invoice dated on or after the pause date is voided."
      onClose={onClose}
    >
      <div className="space-y-3">
        <Field label="Student">
          {presetStudent ? (
            <div className="input flex items-center bg-slate-50 font-semibold">{presetStudent.name}</div>
          ) : (
            <select className="input" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">Select a student</option>
              {students.map((student) => (
                <option key={student._id} value={student._id}>
                  {student.name} {student.username ? `(${student.username})` : ""}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Batch" hint="The batch the student is stepping out of. They return to this batch unless you move them at reactivation.">
          <select className="input" value={batchId} onChange={(event) => setBatchId(event.target.value)}>
            <option value="">No batch on record</option>
            {(presetStudent?.batches?.length ? presetStudent.batches : batches).map((batch) => (
              <option key={batch._id} value={batch._id}>{batch.name}</option>
            ))}
          </select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paused from">
            <input type="date" className="input" value={pausedFrom} onChange={(event) => setPausedFrom(event.target.value)} />
          </Field>
          <Field label="Paused till" hint="Classes and billing stay off up to and including this date.">
            <input type="date" className="input" value={pausedUntil} min={pausedFrom} onChange={(event) => setPausedUntil(event.target.value)} />
          </Field>
        </div>

        <Field label="Plans to restart on" hint="Optional — what the family has told you, so you know when to expect them back.">
          <input type="date" className="input" value={expectedRestartDate} onChange={(event) => setExpectedRestartDate(event.target.value)} />
        </Field>

        <Field label="Reason">
          <textarea className="input min-h-[70px]" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Exams, travel, medical…" />
        </Field>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <AlertTriangle size={14} className="mr-1 inline" />
          Unpaid and overdue invoices dated on or after the pause date are cancelled. Dues from before the pause stay payable, and paid invoices are untouched.
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Pausing…" : "Pause student"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ResumeStudentModal({
  pause,
  batches,
  onClose,
  onDone,
}: {
  pause: PauseRecord;
  batches: PauseBatch[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [batchId, setBatchId] = useState(pause.batch?._id || "");
  const [restartDate, setRestartDate] = useState(dateInputValue(pause.expectedRestartDate) || todayInputValue());
  const [nextInvoiceDate, setNextInvoiceDate] = useState(dateInputValue(pause.expectedRestartDate) || todayInputValue());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const planName = pause.feeSnapshot?.planName;
  const planType = pause.feeSnapshot?.planType;

  async function submit() {
    if (!nextInvoiceDate) return toast.error("Choose the date of the first invoice after the restart.");
    setSaving(true);
    const response = await fetch(`/api/admin/student-pauses/${pause._id}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch: batchId || undefined, restartDate, nextInvoiceDate, note }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      toast.error(data.error || "Could not reinstate this student.");
      return;
    }
    toast.success(
      data.invoice
        ? `${pause.student?.name || "Student"} is back in ${data.batch || "the batch"}. Invoice ${data.invoice.invoiceNumber} raised for ${data.invoice.amount}.`
        : `${pause.student?.name || "Student"} is back in ${data.batch || "the batch"}.`
    );
    onDone();
  }

  return (
    <Modal
      title={`Reactivate ${pause.student?.name || "student"}`}
      subtitle="Put the student back into a batch and restart their fee cycle from a date you choose."
      onClose={onClose}
    >
      <div className="space-y-3">
        <Field label="Return to batch" hint="Defaults to the batch they were paused from. Pick another to move them into a different batch.">
          <select className="input" value={batchId} onChange={(event) => setBatchId(event.target.value)}>
            {!pause.batch?._id && <option value="">No batch</option>}
            {batches.map((batch) => (
              <option key={batch._id} value={batch._id}>
                {batch.name}{batch._id === pause.batch?._id ? " (original batch)" : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Back in class from" hint="Sessions on or after this date get the student back on the roster.">
          <input type="date" className="input" value={restartDate} onChange={(event) => setRestartDate(event.target.value)} />
        </Field>

        <Field
          label="Date of the first invoice"
          hint={
            planName
              ? `${planName} (${planType === "credits" ? "credit plan" : "monthly plan"}) restarts from this date, and every later invoice follows this day of the month.`
              : "The fee cycle restarts from this date. Assign a fee plan first if the student does not have one."
          }
        >
          <input type="date" className="input" value={nextInvoiceDate} onChange={(event) => setNextInvoiceDate(event.target.value)} />
        </Field>

        <Field label="Note">
          <textarea className="input min-h-[60px]" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth recording about the return" />
        </Field>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
          <RotateCcw size={14} className="mr-1 inline" />
          The student goes back to normal straight away — portal access, classes, homework, and attendance — and the invoice for the date above is raised now.
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Reinstating…" : "Reactivate student"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditPauseModal({ pause, onClose, onDone }: { pause: PauseRecord; onClose: () => void; onDone: () => void }) {
  const [pausedUntil, setPausedUntil] = useState(dateInputValue(pause.pausedUntil));
  const [expectedRestartDate, setExpectedRestartDate] = useState(dateInputValue(pause.expectedRestartDate));
  const [reason, setReason] = useState(pause.reason || "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const response = await fetch(`/api/admin/student-pauses/${pause._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pausedUntil, expectedRestartDate: expectedRestartDate || null, reason }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      toast.error(data.error || "Could not update this pause.");
      return;
    }
    toast.success("Pause dates updated.");
    onDone();
  }

  return (
    <Modal title="Update pause dates" subtitle={pause.student?.name || ""} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Paused till">
          <input type="date" className="input" value={pausedUntil} onChange={(event) => setPausedUntil(event.target.value)} />
        </Field>
        <Field label="Plans to restart on">
          <input type="date" className="input" value={expectedRestartDate} onChange={(event) => setExpectedRestartDate(event.target.value)} />
        </Field>
        <Field label="Reason">
          <textarea className="input min-h-[70px]" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PauseDetailModal({ pause, onClose }: { pause: PauseRecord; onClose: () => void }) {
  return (
    <Modal title={pause.student?.name || "Pause record"} subtitle={pause.batch?.name || pause.batchName || ""} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Detail label="Paused from" value={formatDate(pause.pausedFrom)} />
          <Detail label="Paused till" value={formatDate(pause.pausedUntil)} />
          <Detail label="Plans to restart" value={formatDate(pause.expectedRestartDate)} />
          <Detail label="Paused by" value={`${pause.pausedByName || "-"}${pause.pausedAt ? ` · ${formatDate(pause.pausedAt)}` : ""}`} />
          <Detail label="Fee plan" value={pause.feeSnapshot?.planName || "No plan on record"} />
          <Detail label="Status" value={pause.status === "active" ? "Currently paused" : pause.status === "resumed" ? "Reinstated" : "Cancelled"} />
        </div>

        {pause.reason && (
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Reason</p>
            <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{pause.reason}</p>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Invoices voided by this pause</p>
          {pause.voidedInvoices?.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {pause.voidedInvoices.map((invoice) => (
                <li key={invoice.invoice || invoice.invoiceNumber} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{invoice.invoiceNumber || "Invoice"}</span>
                    <span className="block truncate text-xs text-slate-500">{invoice.title} · due {formatDate(invoice.dueDate)}</span>
                  </span>
                  <span className="flex-none font-bold">{formatINR(invoice.totalAmount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">No upcoming invoices needed voiding.</p>
          )}
        </div>

        {pause.status === "resumed" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">Reinstatement</p>
            <div className="grid grid-cols-2 gap-3">
              <Detail label="Returned to" value={pause.resumeBatch?.name || pause.resumeBatchName || "-"} />
              <Detail label="Reinstated on" value={formatDate(pause.resumedAt)} />
              <Detail label="First invoice dated" value={formatDate(pause.nextInvoiceDate)} />
              <Detail label="Invoice raised" value={pause.resumeInvoiceNumber || "None"} />
            </div>
            {pause.resumeNote && <p className="mt-2 text-xs leading-5 text-emerald-900">{pause.resumeNote}</p>}
          </div>
        )}

        <div className="flex justify-end">
          <button type="button" className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900">{value}</p>
    </div>
  );
}
