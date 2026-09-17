import Link from "next/link";
import { ExternalLink, Info, type LucideIcon } from "lucide-react";
import { RANGE_LABELS, type RangeKey } from "@/lib/marketingAnalytics";

/** Shared furniture for the marketing analytics pages. */

const tabs = [
  { href: "/admin/marketing-analytics", label: "Highlights" },
  { href: "/admin/marketing-analytics/realtime", label: "Real-time" },
  { href: "/admin/marketing-analytics/traffic", label: "Traffic" },
  { href: "/admin/marketing-analytics/behaviour", label: "Behaviour" },
];

const rangeKeys: RangeKey[] = ["7d", "30d", "90d"];

export function AnalyticsHeader({
  title,
  subtitle,
  active,
  range,
  showRange = true,
}: {
  title: string;
  subtitle: string;
  active: string;
  range?: RangeKey;
  showRange?: boolean;
}) {
  return (
    <header className="space-y-3">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-xl font-black text-slate-950">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
        {showRange && range ? (
          <nav className="flex gap-1.5" aria-label="Date range">
            {rangeKeys.map((key) => (
              <Link
                key={key}
                href={`${active}?range=${key}`}
                className={`btn ${range === key ? "bg-brand text-white" : "border border-brand/20 bg-white text-brand hover:bg-brand-50"}`}
              >
                {RANGE_LABELS[key]}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      <nav className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2" aria-label="Analytics sections">
        {tabs.map((tab) => {
          const isActive = tab.href === active;
          return (
            <Link
              key={tab.href}
              href={range && tab.href !== "/admin/marketing-analytics/realtime" ? `${tab.href}?range=${range}` : tab.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${
                isActive ? "bg-brand text-white" : "text-slate-600 hover:bg-brand-50 hover:text-brand"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

/**
 * The sampling caveat. Shown on every page, because a consent-limited sample
 * presented as total traffic is the easiest way to mislead someone.
 */
export function ConsentNote() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-brand/15 bg-brand-50 p-3 text-xs leading-5 text-slate-700">
      <Info size={15} className="mt-0.5 shrink-0 text-brand" />
      <span>
        Counts visitors who accepted analytics cookies, so treat these as a floor rather than total traffic. No IP addresses, user agents or full
        referrer URLs are stored, and sessions are anonymous and never linked to a student account.
      </span>
    </div>
  );
}

export function GoogleAnalyticsStatus({ configured }: { configured: boolean }) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm sm:flex-row sm:items-center">
      <div>
        <p className="font-black text-slate-950">Google Analytics 4</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-600">
          {configured
            ? "GA4 is enabled for public pages after analytics-cookie consent. Its reports remain separate from the first-party figures below."
            : "GA4 is not connected yet. Add NEXT_PUBLIC_GA_MEASUREMENT_ID to enable public-site tracking."}
        </p>
      </div>
      {configured ? (
        <a className="btn shrink-0 border border-brand/20 bg-white text-brand hover:bg-brand-50" href="https://analytics.google.com/" target="_blank" rel="noreferrer">
          Open GA4 <ExternalLink size={14} />
        </a>
      ) : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  delta,
}: {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  delta?: number | null;
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">{label}</div>
        <Icon size={16} className="shrink-0 text-brand" />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-black tabular-nums text-brand">{value}</span>
        {typeof delta === "number" ? (
          <span className={`text-xs font-black tabular-nums ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {delta >= 0 ? "+" : ""}
            {delta}%
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-xs font-semibold text-slate-500">{sub}</div>
    </div>
  );
}

/** A compact column chart; `marks` highlights days that had a conversion. */
export function Columns({ points, marks }: { points: { label: string; value: number }[]; marks?: boolean[] }) {
  const peak = Math.max(1, ...points.map((point) => point.value));
  return (
    <>
      <div className="flex h-40 items-end gap-[3px]">
        {points.map((point, index) => (
          <div key={point.label} className="group relative flex-1" title={`${point.label}: ${point.value}`}>
            <div className="flex h-40 flex-col justify-end">
              <div className="w-full rounded-t bg-brand/80 transition group-hover:bg-brand" style={{ height: `${(point.value / peak) * 100}%` }} />
              {marks?.[index] ? <div className="mt-px w-full rounded-b bg-accent-500" style={{ height: 3 }} /> : null}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-semibold text-slate-500">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </>
  );
}

/** A labelled proportion bar, for breakdowns where share matters more than count. */
export function BarList({
  title,
  rows,
  unit = "sessions",
  empty = "No data in this range.",
}: {
  title: string;
  rows: { label: string; value: number; extra?: string }[];
  unit?: string;
  empty?: string;
}) {
  const peak = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="card">
      <h2 className="text-sm font-black text-slate-950">{title}</h2>
      {rows.length ? (
        <ul className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-slate-700">{row.label}</span>
                <span className="shrink-0 font-bold tabular-nums text-slate-950">
                  {row.value.toLocaleString("en-IN")}
                  {row.extra ? <span className="ml-1.5 font-semibold text-slate-500">{row.extra}</span> : null}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(row.value / peak) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      )}
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Measured in {unit}</p>
    </div>
  );
}

export function DataTable({
  title,
  note,
  head,
  rows,
  empty = "No data in this range.",
}: {
  title: string;
  note?: string;
  head: string[];
  rows: (string | number)[][];
  empty?: string;
}) {
  return (
    <div className="card">
      <h2 className="text-sm font-black text-slate-950">{title}</h2>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
      {rows.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                {head.map((cell, index) => (
                  <th key={cell} className={`pb-2 ${index ? "text-right" : ""}`}>
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row[0])} className="border-t border-slate-200/70">
                  {row.map((cell, index) => (
                    <td
                      key={index}
                      className={`py-2 ${index ? "text-right tabular-nums text-slate-700" : "max-w-[260px] truncate pr-3 font-semibold text-slate-950"}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      )}
    </div>
  );
}

/** Country codes are stored, not names; this keeps the dashboard readable. */
export function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}
