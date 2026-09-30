"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Save, Trash2 } from "lucide-react";

import { formatINR } from "@/lib/utils";

type PlanType = "per_class" | "per_hour" | "monthly";
type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export type PayPlanFormPlan = {
  id: string;
  type: PlanType;
  /** "YYYY-MM" */
  month: string;
  monthLabel: string;
  hourlyRate: number | null;
  monthlyAmount: number | null;
  demoRate: number | null;
  substituteRate: number | null;
  conversionBonus: number | null;
  note: string;
};

const TYPES: Array<{ id: PlanType; label: string; help: string }> = [
  { id: "per_class", label: "Per class", help: "Each class at its batch's rate (set in the grid below), plus demo, substitution and conversion amounts." },
  { id: "per_hour", label: "Per hour", help: "Regular classes and substitutions at an hourly rate, pro-rated by class length, plus demo and conversion amounts." },
  { id: "monthly", label: "Fixed monthly", help: "One amount for the month that covers every class, demo and substitution. Nothing is added on top." },
];

function rupees(paise: number | null) {
  if (paise === null) return "";
  const value = paise / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function money(paise: number | null) {
  return paise === null ? "-" : formatINR(paise);
}

function Amount({ name, label, value, hint }: { name: string; label: string; value: number | null; hint?: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-slate-700">
      {label}
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-500">Rs.</span>
        <input name={name} type="number" min="0" step="any" defaultValue={rupees(value)} className="input h-9 w-32" />
      </div>
      {hint && <span className="text-[11px] font-normal text-slate-500">{hint}</span>}
    </label>
  );
}

export function PayPlanForm({
  coachId,
  coachName,
  current,
  plans,
  defaultMonth,
  saveAction,
  deleteAction,
  savedMessage = "",
}: {
  coachId: string;
  coachName: string;
  current: PayPlanFormPlan | null;
  plans: PayPlanFormPlan[];
  defaultMonth: string;
  saveAction: (formData: FormData) => Promise<ActionResult>;
  deleteAction: (formData: FormData) => Promise<ActionResult>;
  /** A confirmation carried in the address after saving; shown by the form. */
  savedMessage?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [type, setType] = useState<PlanType>(current?.type || "per_class");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function run(action: (formData: FormData) => Promise<ActionResult>, formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setSaved("");
        setError(result.error);
        toast.error(result.error);
        if (savedMessage) router.replace(`${pathname}?${new URLSearchParams({ coach: coachId }).toString()}`, { scroll: false });
        return;
      }
      setSaved(result.message);
      toast.success(result.message);
      // The confirmation is also carried in the address, so the page shows it
      // even when saving a first plan re-renders the whole form.
      router.replace(`${pathname}?${new URLSearchParams({ coach: coachId, saved: result.message }).toString()}`, { scroll: false });
      router.refresh();
    });
  }
  const help = TYPES.find((item) => item.id === type)?.help;

  return (
    <div className="grid gap-4">
      {(savedMessage || saved) && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900" role="status">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {savedMessage || saved}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900" role="alert">
          {error}
        </div>
      )}
      <form action={(formData) => run(saveAction, formData)} className="grid gap-3" key={`${coachId}:${current?.id || "new"}`}>
        <input type="hidden" name="coach" value={coachId} />
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`How ${coachName} is paid`}>
          {TYPES.map((item) => (
            <label
              key={item.id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                type === item.id ? "border-brand bg-brand/[0.06] text-brand" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <input type="radio" name="type" value={item.id} checked={type === item.id} onChange={() => setType(item.id)} className="accent-brand" />
              {item.label}
            </label>
          ))}
        </div>
        <p className="text-xs leading-5 text-slate-600">{help}</p>

        <div className="flex flex-wrap items-end gap-4">
          {type === "per_hour" && <Amount name="hourlyRate" label="Hourly rate" value={current?.hourlyRate ?? null} hint="Regular classes and substitutions" />}
          {type === "monthly" && <Amount name="monthlyAmount" label="Monthly amount" value={current?.monthlyAmount ?? null} hint="Covers everything in the month" />}
          {type !== "monthly" && <Amount name="demoRate" label="Demo class" value={current?.demoRate ?? null} hint="Per demo taken" />}
          {type === "per_class" && <Amount name="substituteRate" label="Substitution class" value={current?.substituteRate ?? null} hint="Per class covered" />}
          {type !== "monthly" && (
            <Amount name="conversionBonus" label="Demo conversion incentive" value={current?.conversionBonus ?? null} hint="Per demo student who enrolls" />
          )}
          <label className="grid gap-1 text-xs font-semibold text-slate-700">
            Applies from
            <input name="effectiveMonth" type="month" required defaultValue={defaultMonth} className="input h-9 w-40" />
            <span className="text-[11px] font-normal text-slate-500">Earlier months keep their old plan</span>
          </label>
          <label className="grid min-w-[12rem] flex-1 gap-1 text-xs font-semibold text-slate-700">
            Note (optional)
            <input name="note" defaultValue={current?.note || ""} className="input h-9" maxLength={200} />
          </label>
        </div>
        <p className="text-[11px] leading-4 text-slate-500">
          Leave demo or substitution blank to use the rate cards below instead; enter 0 for unpaid.
        </p>
        <div>
          <button type="submit" disabled={pending} className="btn-primary h-9 px-4 text-xs">
            <Save size={14} /> {pending ? "Saving..." : "Save pay plan"}
          </button>
        </div>
      </form>

      {plans.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-2 py-1.5 font-bold">From</th>
                <th className="border-b border-slate-200 px-2 py-1.5 font-bold">Plan</th>
                <th className="border-b border-slate-200 px-2 py-1.5 text-right font-bold">Hourly / monthly</th>
                <th className="border-b border-slate-200 px-2 py-1.5 text-right font-bold">Demo</th>
                <th className="border-b border-slate-200 px-2 py-1.5 text-right font-bold">Substitution</th>
                <th className="border-b border-slate-200 px-2 py-1.5 text-right font-bold">Conversion</th>
                <th className="border-b border-slate-200 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-1.5 font-semibold">
                    {plan.monthLabel}
                    {current?.id === plan.id && <span className="ml-1 rounded-full bg-emerald-50 px-1.5 text-[10px] font-bold text-emerald-700">current</span>}
                  </td>
                  <td className="px-2 py-1.5">{TYPES.find((item) => item.id === plan.type)?.label}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {plan.type === "per_hour" ? `${money(plan.hourlyRate)}/hr` : plan.type === "monthly" ? `${money(plan.monthlyAmount)}/month` : "Batch rates"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{plan.type === "monthly" ? "Included" : money(plan.demoRate)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {plan.type === "monthly" ? "Included" : plan.type === "per_hour" ? "Hourly" : money(plan.substituteRate)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{plan.type === "monthly" ? "Included" : money(plan.conversionBonus)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <form
                      action={(formData) => {
                        if (window.confirm(`Remove the pay plan from ${plan.monthLabel}?`)) run(deleteAction, formData);
                      }}
                    >
                      <input type="hidden" name="id" value={plan.id} />
                      <button type="submit" className="btn-ghost h-7 px-2 text-rose-600" aria-label={`Remove the plan from ${plan.monthLabel}`}>
                        <Trash2 size={13} />
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
