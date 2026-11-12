"use client";

import type { ReactNode } from "react";

export const field = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100";
export const button = "inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50";
export const secondary = "inline-flex items-center justify-center gap-2 rounded-lg border border-brand/20 bg-white px-3 py-2 text-sm font-semibold text-brand hover:bg-purple-50 disabled:opacity-50";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800",
  submitted: "bg-emerald-50 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-600",
};

const statusLabels: Record<string, string> = { pending: "Not filled", submitted: "Filled", cancelled: "Not held" };

export function StatusChip({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[status] || "bg-slate-100 text-slate-600"}`}>{statusLabels[status] || status}</span>;
}

export function DemoChip() {
  return <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">Demo class</span>;
}

export function ConcernChips({ concerns }: { concerns: string[] }) {
  if (!concerns.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {concerns.map((concern) => <span key={concern} className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">{concern}</span>)}
    </span>
  );
}

/** A row of pill buttons acting as one radio group. */
export function Choice<T extends string>({
  label,
  hint,
  name,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: ReactNode;
  name: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-1.5" disabled={disabled}>
      <legend className="text-sm font-semibold text-slate-900">{label}</legend>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${selected ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand/40"} ${disabled ? "cursor-default opacity-80" : ""}`}
            >
              <input type="radio" className="sr-only" name={name} value={option.value} checked={selected} onChange={() => onChange(option.value)} />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Stat({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "good" | "warn" | "bad" }) {
  const tones = { default: "text-brand", good: "text-emerald-700", warn: "text-amber-700", bad: "text-rose-700" };
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className={`text-2xl font-black ${tones[tone]}`}>{value}</p>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
    </div>
  );
}

export async function sendJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result;
}
