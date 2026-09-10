"use client";

import { useState } from "react";
import { CalendarDays, Download, Filter } from "lucide-react";

import { financialYearLabel } from "@/lib/payPeriods";

type Option = { id: string; name: string };

/**
 * The window every coach-pay screen is read through.
 *
 * The four presets are kept as one control rather than four independent boxes
 * because they are alternatives, not filters that combine: asking for both
 * "last month" and a date range has no meaning, and showing all the inputs at
 * once invites exactly that. Only the inputs the chosen preset actually uses
 * are rendered.
 */
export function PayPeriodFilter({
  preset,
  month,
  from,
  to,
  fyStart,
  fyOptions,
  coaches,
  batches,
  selectedCoach,
  selectedBatch,
  exportHref,
  canExport,
  showCoachFilter,
}: {
  preset: string;
  month: string;
  from: string;
  to: string;
  fyStart: number;
  fyOptions: number[];
  coaches: Option[];
  batches: Option[];
  selectedCoach: string;
  selectedBatch: string;
  exportHref: (format: "xlsx" | "csv" | "ods") => string;
  canExport: boolean;
  showCoachFilter: boolean;
}) {
  const [activePreset, setActivePreset] = useState(preset || "this_month");

  return (
    <form method="get" className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            <CalendarDays size={13} /> Period
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              name="period"
              value={activePreset}
              onChange={(event) => setActivePreset(event.target.value)}
              className="input h-10"
            >
              <option value="this_month">This month</option>
              <option value="last_month">Last month</option>
              <option value="month">A specific month</option>
              <option value="range">Custom date range</option>
              <option value="fy">Financial year</option>
              <option value="all">All time</option>
            </select>

            {activePreset === "month" && (
              <input name="month" type="month" defaultValue={month} className="input h-10" aria-label="Month" />
            )}

            {activePreset === "fy" && (
              <select name="fy" defaultValue={String(fyStart)} className="input h-10" aria-label="Financial year">
                {fyOptions.map((year) => (
                  <option key={year} value={year}>
                    {financialYearLabel(year)}
                  </option>
                ))}
              </select>
            )}

            {activePreset === "range" && (
              <div className="grid grid-cols-2 gap-2">
                <input name="from" type="date" defaultValue={from} className="input h-10" aria-label="From date" />
                <input name="to" type="date" defaultValue={to} className="input h-10" aria-label="To date" />
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            <Filter size={13} /> Narrow down
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            {showCoachFilter && (
              <select name="coach" defaultValue={selectedCoach} className="input h-10" aria-label="Coach">
                <option value="">All coaches</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name}
                  </option>
                ))}
              </select>
            )}
            <select name="batch" defaultValue={selectedBatch} className="input h-10" aria-label="Batch">
              <option value="">All batches</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn-primary h-10 px-5">
          Apply
        </button>
        {canExport && (
          <>
            <span className="ml-auto text-xs font-semibold text-slate-500">Export</span>
            {(["xlsx", "csv", "ods"] as const).map((format) => (
              <a key={format} href={exportHref(format)} className="btn-outline h-10 px-3 text-xs uppercase">
                <Download size={14} /> {format}
              </a>
            ))}
          </>
        )}
      </div>
    </form>
  );
}
