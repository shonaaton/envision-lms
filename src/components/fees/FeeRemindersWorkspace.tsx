"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Mail, MessageCircle, RefreshCcw, Send, ShieldAlert, Users, WalletCards, X } from "lucide-react";
import { formatINR } from "@/lib/utils";
import { feeReminderRetryTargets, reminderTypeMatches, summarizeReminderDeliveryResults, type FeeReminderType } from "@/lib/feeReminderRules";
import type { FeeReminderRecipient } from "@/lib/feeReminders";

type WorkspaceData = {
  generatedAt: string;
  timeZone: string;
  lowCreditThreshold: number;
  counts: Record<"invoice_upcoming" | "invoice_overdue" | "credit_low" | "credit_zero" | "credit_blocked", number>;
  recipients: FeeReminderRecipient[];
  history: Array<{ id: string; occurredAt: string; studentName: string; reminderType: string; channel: string; status: string; invoiceNumber: string }>;
};

type SendResult = {
  processed: number;
  summary: Record<"email" | "whatsapp", Record<"sent" | "failed" | "unavailable" | "not_configured", number>>;
  results: Array<{ recipientId: string; studentName: string; channel: "email" | "whatsapp"; status: "sent" | "failed" | "unavailable" | "not_configured" }>;
};

type RetryTargets = { email: string[]; whatsapp: string[] };

const reminderOptions: Array<{ value: FeeReminderType; label: string }> = [
  { value: "credit_low", label: "Credit — Low Balance" },
  { value: "credit_zero", label: "Credit — Zero Balance" },
  { value: "credit_blocked", label: "Credit — Blocked" },
  { value: "invoice_upcoming", label: "Invoice — Due Within 7 Days" },
  { value: "invoice_overdue", label: "Invoice — Overdue" },
  { value: "all_credit", label: "All Credit Reminders" },
  { value: "all_invoice", label: "All Invoice Reminders" },
];

function relativeReminder(value?: string) {
  if (!value) return "No reminder sent";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "Last reminder sent today";
  if (days === 1) return "Last reminder sent yesterday";
  return `Last reminder sent ${days} days ago`;
}

function StatusBadge({ status }: { status?: string }) {
  const tone = status === "sent" ? "bg-emerald-50 text-emerald-700" : status === "failed" ? "bg-rose-50 text-rose-700" : status ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${tone}`}>{status ? status.replaceAll("_", " ") : "not sent"}</span>;
}

function SummaryCard({ label, value, note, icon, tone }: { label: string; value: number; note: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-brand-900/5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p></div>
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}>{icon}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">{note}</p>
    </div>
  );
}

export default function FeeRemindersWorkspace({ initialData }: { initialData: WorkspaceData }) {
  const [data, setData] = useState(initialData);
  const [reminderType, setReminderType] = useState<FeeReminderType>("credit_low");
  const [email, setEmail] = useState(true);
  const [whatsapp, setWhatsApp] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SendResult | null>(null);
  const [retryTargets, setRetryTargets] = useState<RetryTargets | null>(null);
  const visible = useMemo(() => data.recipients.filter((recipient) => reminderTypeMatches(reminderType, recipient.category)), [data.recipients, reminderType]);

  useEffect(() => {
    setSelected(new Set(visible.map((recipient) => recipient.id)));
  }, [reminderType, data.generatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setResult(null);
    setRetryTargets(null);
  }, [reminderType]);

  const selectedRecipients = visible.filter((recipient) => selected.has(recipient.id));
  const emailTargets = retryTargets ? selectedRecipients.filter((recipient) => retryTargets.email.includes(recipient.id)) : selectedRecipients;
  const whatsappTargets = retryTargets ? selectedRecipients.filter((recipient) => retryTargets.whatsapp.includes(recipient.id)) : selectedRecipients;
  const availableEmail = emailTargets.filter((recipient) => recipient.emailAvailable).length;
  const availableWhatsApp = whatsappTargets.filter((recipient) => recipient.whatsappAvailable).length;

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/fees/reminders", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not refresh fee reminders");
      setData(payload);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh fee reminders");
    } finally {
      setLoading(false);
    }
  }

  async function sendReminders() {
    setSending(true);
    setError("");
    try {
      const requests = retryTargets
        ? [
            ...(retryTargets.email.length ? [{ channels: ["email"], recipientIds: retryTargets.email }] : []),
            ...(retryTargets.whatsapp.length ? [{ channels: ["whatsapp"], recipientIds: retryTargets.whatsapp }] : []),
          ]
        : [{ channels: [email && "email", whatsapp && "whatsapp"].filter(Boolean), recipientIds: selectedRecipients.map((recipient) => recipient.id) }];
      const payloads = await Promise.all(requests.map(async (request) => {
        const response = await fetch("/api/fees/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reminderType, ...request }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Fee reminders could not be sent");
        return payload as SendResult;
      }));
      const results = payloads.flatMap((payload) => payload.results);
      setResult({
        processed: new Set(results.map((item) => item.recipientId)).size,
        results,
        summary: summarizeReminderDeliveryResults(results),
      });
      setRetryTargets(null);
      setConfirming(false);
      await refresh();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Fee reminders could not be sent");
    } finally {
      setSending(false);
    }
  }

  function retryFailed() {
    if (!result) return;
    const targets = feeReminderRetryTargets(result.results);
    const retryIds = new Set([...targets.email, ...targets.whatsapp]);
    setSelected(retryIds);
    setEmail(targets.email.length > 0);
    setWhatsApp(targets.whatsapp.length > 0);
    setRetryTargets(targets);
    setResult(null);
    if (retryIds.size) setConfirming(true);
  }

  return (
    <div className="min-h-screen space-y-4 bg-slate-50 px-4 py-4 text-slate-950 sm:px-6 lg:px-8">
      <section className="rounded-xl border border-brand/10 bg-white p-4 shadow-sm shadow-brand-900/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand/10 text-brand"><Send size={19} /></span>
            <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand/70">Fees Management</p><h1 className="text-2xl font-semibold">Fee Reminders</h1><p className="mt-1 text-sm text-slate-500">Review recipients, choose channels, and track each delivery independently.</p></div>
          </div>
          <button type="button" onClick={refresh} disabled={loading} className="btn-outline h-10"><RefreshCcw size={15} className={loading ? "animate-spin" : ""} /> Refresh</button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Upcoming Due" value={data.counts.invoice_upcoming} note="Invoices due within 7 days" icon={<CalendarClock size={17} />} tone="bg-blue-50 text-blue-700" />
        <SummaryCard label="Overdue" value={data.counts.invoice_overdue} note="Unpaid invoices" icon={<Clock3 size={17} />} tone="bg-rose-50 text-rose-700" />
        <SummaryCard label="Low Credits" value={data.counts.credit_low} note={`Positive balances up to ${data.lowCreditThreshold}`} icon={<WalletCards size={17} />} tone="bg-amber-50 text-amber-700" />
        <SummaryCard label="Zero Credits" value={data.counts.credit_zero} note="Students on final-class allowance" icon={<AlertTriangle size={17} />} tone="bg-orange-50 text-orange-700" />
        <SummaryCard label="Blocked" value={data.counts.credit_blocked} note="Classroom access paused" icon={<ShieldAlert size={17} />} tone="bg-rose-50 text-rose-700" />
      </section>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}
      {result && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><h2 className="font-bold text-emerald-950">{result.processed} recipients processed</h2><p className="mt-1 text-sm text-emerald-800">Email: {result.summary.email.sent} sent, {result.summary.email.failed} failed, {result.summary.email.unavailable} unavailable, {result.summary.email.not_configured} not configured</p><p className="text-sm text-emerald-800">WhatsApp: {result.summary.whatsapp.sent} sent, {result.summary.whatsapp.failed} failed, {result.summary.whatsapp.unavailable} unavailable, {result.summary.whatsapp.not_configured} not configured</p></div>
            {result.results.some((item) => item.status === "failed" || item.status === "not_configured") && <button type="button" onClick={retryFailed} className="btn-outline h-9 bg-white">Retry failed only</button>}
          </div>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div><h2 className="font-bold">Reminder composer</h2><p className="mt-1 text-xs text-slate-500">One recipient list powers both channels.</p></div>
          <label className="block space-y-1"><span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Reminder type</span><select value={reminderType} onChange={(event) => setReminderType(event.target.value as FeeReminderType)} className="input h-10 w-full">{reminderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <div className="space-y-2"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Channels</p>
            <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${email ? "border-brand/30 bg-brand/5" : "border-slate-200"}`}><input type="checkbox" checked={email} onChange={(event) => { setRetryTargets(null); setEmail(event.target.checked); }} className="h-4 w-4 accent-brand" /><Mail size={16} className="text-brand" /><span className="text-sm font-semibold">Email</span></label>
            <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${whatsapp ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}><input type="checkbox" checked={whatsapp} onChange={(event) => { setRetryTargets(null); setWhatsApp(event.target.checked); }} className="h-4 w-4 accent-emerald-600" /><MessageCircle size={16} className="text-emerald-700" /><span className="text-sm font-semibold">WhatsApp</span></label>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex justify-between"><span>Selected</span><b>{selectedRecipients.length}</b></div><div className="mt-1 flex justify-between text-xs text-slate-500"><span>Email available</span><b>{availableEmail}</b></div><div className="mt-1 flex justify-between text-xs text-slate-500"><span>WhatsApp available</span><b>{availableWhatsApp}</b></div></div>
          <button type="button" onClick={() => setConfirming(true)} disabled={!selectedRecipients.length || (!email && !whatsapp)} className="btn-primary h-11 w-full disabled:cursor-not-allowed disabled:opacity-50"><Send size={15} /> Review & Send</button>
          <p className="text-[11px] leading-5 text-slate-500">Manual sends may be repeated intentionally. Prior delivery context is shown beside each recipient.</p>
        </aside>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">Recipient preview</h2><p className="text-xs text-slate-500">{visible.length} matching recipient{visible.length === 1 ? "" : "s"}</p></div><button type="button" onClick={() => { setRetryTargets(null); setSelected(selected.size === visible.length ? new Set() : new Set(visible.map((recipient) => recipient.id))); }} className="text-xs font-bold text-brand">{selected.size === visible.length ? "Uncheck all" : "Select all"}</button></div>
          {visible.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-4 py-3">Select</th><th className="px-4 py-3">Student / payer</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Contacts</th><th className="px-4 py-3">History</th></tr></thead><tbody>{visible.map((recipient) => <tr key={recipient.id} className="border-t border-slate-100 align-top"><td className="px-4 py-3"><input type="checkbox" checked={selected.has(recipient.id)} onChange={() => { setRetryTargets(null); setSelected((current) => { const next = new Set(current); next.has(recipient.id) ? next.delete(recipient.id) : next.add(recipient.id); return next; }); }} className="h-4 w-4 accent-brand" /></td><td className="px-4 py-3"><div className="font-bold">{recipient.studentName}</div><div className="text-xs text-slate-500">{recipient.parentName ? `Parent: ${recipient.parentName}` : "Student contact"}</div><div className="mt-1 text-xs text-slate-500">{recipient.planName}</div></td><td className="px-4 py-3">{recipient.feeModel === "credits" ? <><div className="font-bold">Balance: {recipient.creditBalance}</div><div className="text-xs capitalize text-slate-500">{recipient.category.replaceAll("_", " ")}</div></> : <><div className="font-bold">{recipient.invoiceNumber} · {formatINR(recipient.invoiceAmount || 0)}</div><div className={`text-xs font-semibold ${recipient.category === "invoice_overdue" ? "text-rose-700" : "text-blue-700"}`}>{recipient.timingLabel}</div><div className="text-xs text-slate-500">Due {new Date(recipient.dueDate!).toLocaleDateString("en-IN", { timeZone: data.timeZone })}</div></>}</td><td className="px-4 py-3"><div className={recipient.emailAvailable ? "text-slate-700" : "text-rose-600"}>{recipient.emailAvailable ? recipient.email : "Email unavailable"}</div><div className={recipient.whatsappAvailable ? "mt-1 text-slate-700" : "mt-1 text-rose-600"}>{recipient.whatsappAvailable ? recipient.normalizedPhone : "WhatsApp unavailable"}</div></td><td className="px-4 py-3"><div className="text-xs text-slate-500">{relativeReminder(recipient.lastReminderAt)}</div><div className="mt-2 flex gap-1"><StatusBadge status={recipient.lastEmailStatus} /><StatusBadge status={recipient.lastWhatsAppStatus} /></div></td></tr>)}</tbody></table></div> : <div className="grid place-items-center p-10 text-center"><Users className="text-slate-300" size={30} /><p className="mt-2 font-semibold">No recipients need this reminder</p><p className="text-xs text-slate-500">Try another reminder category or refresh the workspace.</p></div>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="font-bold">Recent reminder history</h2><p className="mt-1 text-xs text-slate-500">Email and WhatsApp outcomes are recorded separately.</p><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{data.history.slice(0, 12).map((entry) => <div key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><b className="text-sm">{entry.studentName}</b><StatusBadge status={entry.status} /></div><div className="mt-1 text-xs capitalize text-slate-500">{entry.reminderType.replaceAll("_", " ")} · {entry.channel}{entry.invoiceNumber ? ` · ${entry.invoiceNumber}` : ""}</div><div className="mt-1 text-[11px] text-slate-400">{new Date(entry.occurredAt).toLocaleString("en-IN", { timeZone: data.timeZone })}</div></div>)}{!data.history.length && <p className="text-sm text-slate-500">No fee reminders have been sent from this workspace yet.</p>}</div></section>

      {confirming && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold">{retryTargets ? "Retry Failed Fee Reminders?" : "Send Fee Reminders?"}</h2><p className="mt-1 text-sm text-slate-500">{selectedRecipients.length} recipient{selectedRecipients.length === 1 ? "" : "s"} will be processed.</p></div><button type="button" onClick={() => setConfirming(false)} className="grid h-8 w-8 place-items-center rounded-full bg-slate-100"><X size={15} /></button></div><div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 text-sm">{email && <div className="flex justify-between"><span>Email</span><b>{availableEmail} available · {emailTargets.length - availableEmail} unavailable</b></div>}{whatsapp && <div className="flex justify-between"><span>WhatsApp</span><b>{availableWhatsApp} available · {whatsappTargets.length - availableWhatsApp} unavailable</b></div>}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setConfirming(false)} className="btn-outline h-10">Cancel</button><button type="button" onClick={sendReminders} disabled={sending} className="btn-primary h-10"><CheckCircle2 size={15} /> {sending ? "Sending…" : retryTargets ? "Retry Failed Only" : "Send Reminders"}</button></div></div></div>}
    </div>
  );
}
