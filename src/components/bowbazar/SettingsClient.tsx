"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BranchHeader, Field, api } from "./shared";

type Settings = {
  admissionFee: number;
  proRataFirstMonth: boolean;
  planDiscounts: { quarterly: number; half_yearly: number; yearly: number };
  lateFee: number;
  lateFeeAfterDay: number;
  remindersEnabled: boolean;
  reminderDays: number[];
  receiptPrefix: string;
  parentReportEnabled: boolean;
  absenceAlertAfter: number;
};

const rupeesText = (paise: number) => (paise ? String(paise / 100) : "0");

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-brand/10 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-black text-slate-950">{title}</h2>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export default function SettingsClient({ can }: { can: string[] }) {
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState("");
  const set = (patch: Record<string, any>) => setForm((current) => ({ ...current, ...patch }));

  function load(settings: Settings) {
    setForm({
      ...settings,
      admissionFee: rupeesText(settings.admissionFee),
      lateFee: rupeesText(settings.lateFee),
    });
  }

  useEffect(() => {
    api<{ settings: Settings }>("/api/bowbazar/settings")
      .then((data) => load(data.settings))
      .catch((error) => toast.error(error.message));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const data = await api<{ settings: Settings }>("/api/bowbazar/settings", { method: "PUT", json: form });
      load(data.settings);
      toast.success("Settings saved.");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendNow(kind: "reminders" | "reports") {
    const question =
      kind === "reminders"
        ? "Send a fee reminder now to every family that owes? Families already reminded today are skipped."
        : "Send last month's report now to every active family? Families who already got it are skipped.";
    if (!window.confirm(question)) return;
    setSending(kind);
    try {
      const data = await api<{ sent: number; skipped: number }>(`/api/bowbazar/${kind === "reminders" ? "fees/reminders" : "reports"}`, { method: "POST", json: {} });
      toast.success(`${data.sent} sent${data.skipped ? `, ${data.skipped} skipped` : ""}.`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSending("");
    }
  }

  if (!form) {
    return (
      <div className="space-y-4">
        <BranchHeader title="Settings" can={can} />
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading...</div>
      </div>
    );
  }

  const days = Array.from({ length: 28 }, (_, index) => index + 1);

  return (
    <div className="space-y-4">
      <BranchHeader
        title="Settings"
        subtitle="Fees, receipts and messages to families. Everything here starts switched off."
        can={can}
        actions={
          <button type="button" className="btn-primary h-10" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />} Save settings
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="New students" hint="Applied to each student's first bill. Change either one for a single student on the Students page.">
          <Field label="Admission fee (₹)" hint="One time, added to the first month's bill. 0 means none.">
            <input className="input" inputMode="decimal" value={form.admissionFee} onChange={(event) => set({ admissionFee: event.target.value })} />
          </Field>
          <Toggle
            checked={form.proRataFirstMonth}
            onChange={(value) => set({ proRataFirstMonth: value })}
            label="Charge only part of the joining month (from the admission day)"
          />
          <p className="text-xs text-slate-500">Discounts (siblings, scholarships) are set for each student on the Students page and apply to every month&apos;s bill.</p>
        </Section>

        <Section title="Fee plans" hint="Families can pay for several months at once. Pick a plan for each student on the Students page; the whole period is billed at its start, at this discount.">
          <div className="grid gap-3 sm:grid-cols-3">
            {([["quarterly", "Quarterly"], ["half_yearly", "Half-yearly"], ["yearly", "Yearly"]] as const).map(([key, label]) => (
              <Field key={key} label={`${label} (% off)`}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={50}
                  value={form.planDiscounts[key]}
                  onChange={(event) => set({ planDiscounts: { ...form.planDiscounts, [key]: Number(event.target.value) } })}
                />
              </Field>
            ))}
          </div>
        </Section>

        <Section title="Late fee" hint="Added once to a month's unpaid bill after the day you choose. Remove it on any bill from the Fees page.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Late fee (₹)" hint="0 means no late fee">
              <input className="input" inputMode="decimal" value={form.lateFee} onChange={(event) => set({ lateFee: event.target.value })} />
            </Field>
            <Field label="Added after day" hint="of the month">
              <input className="input" type="number" min={1} max={28} value={form.lateFeeAfterDay} onChange={(event) => set({ lateFeeAfterDay: Number(event.target.value) })} />
            </Field>
          </div>
        </Section>

        <Section title="Receipts" hint="Every payment you record gets a numbered receipt, counted from 1 each financial year (April to March).">
          <Field label="Receipt number prefix" hint={`Receipts read ${form.receiptPrefix || "BB"}/26-27/0001`}>
            <input className="input uppercase" maxLength={6} value={form.receiptPrefix} onChange={(event) => set({ receiptPrefix: event.target.value })} />
          </Field>
        </Section>

        <Section title="Fee reminders" hint="Sent at 10am on the chosen days to every family with fees due, by email and WhatsApp.">
          <Toggle checked={form.remindersEnabled} onChange={(value) => set({ remindersEnabled: value })} label="Send fee reminders automatically" />
          <div className="space-y-1">
            <div className="text-xs font-bold text-slate-600">Days of the month</div>
            <div className="flex flex-wrap gap-1">
              {days.map((day) => {
                const on = form.reminderDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => set({ reminderDays: on ? form.reminderDays.filter((value: number) => value !== day) : [...form.reminderDays, day].sort((a, b) => a - b) })}
                    className={cn("h-8 w-8 rounded-md border text-xs font-bold", on ? "border-brand bg-brand text-white" : "border-slate-200 text-slate-600 hover:border-brand/40")}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
          <button type="button" className="btn-outline h-9 px-3 text-sm" disabled={sending !== ""} onClick={() => void sendNow("reminders")}>
            {sending === "reminders" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send reminders now
          </button>
        </Section>

        <Section title="Monthly report to families" hint="On the 1st, each family gets last month's summary: classes attended, topics covered and homework done.">
          <Toggle checked={form.parentReportEnabled} onChange={(value) => set({ parentReportEnabled: value })} label="Send monthly reports automatically" />
          <button type="button" className="btn-outline h-9 px-3 text-sm" disabled={sending !== ""} onClick={() => void sendNow("reports")}>
            {sending === "reports" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send last month&apos;s reports now
          </button>
        </Section>

        <Section title="Absence alerts" hint="You and the manager get a notification when a student misses this many classes in a row.">
          <Field label="Alert after missed classes in a row">
            <input className="input" type="number" min={2} max={10} value={form.absenceAlertAfter} onChange={(event) => set({ absenceAlertAfter: Number(event.target.value) })} />
          </Field>
        </Section>
      </div>

      <p className="text-xs text-slate-500">
        WhatsApp reminders and reports use message templates that Meta must approve first. Until then they go by email, and families without an email see them on their portal page.
      </p>
    </div>
  );
}
