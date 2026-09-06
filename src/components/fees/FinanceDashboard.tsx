"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CalendarRange,
  ChevronRight,
  Download,
  FileText,
  FileX2,
  Gift,
  GraduationCap,
  Layers,
  LineChart,
  Loader2,
  Percent,
  PieChart,
  Receipt,
  RefreshCw,
  Repeat,
  Search,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { formatINR } from "@/lib/utils";
import type { DetailTable, FeesAnalytics, GstFilter } from "@/lib/feesAnalyticsTypes";

type Tone = "brand" | "emerald" | "rose" | "amber" | "sky" | "violet" | "slate";

type CardDef = {
  key: string;
  label: string;
  value: string;
  note: string;
  icon: any;
  tone?: Tone;
  tables: string[];
  progress?: number;
  delta?: { value: string; positive: boolean };
};

const TONES: Record<Tone, { chip: string; ring: string; bar: string }> = {
  brand: { chip: "bg-brand-50 text-brand", ring: "hover:border-brand/40", bar: "bg-brand" },
  emerald: { chip: "bg-emerald-50 text-emerald-700", ring: "hover:border-emerald-300", bar: "bg-emerald-500" },
  rose: { chip: "bg-rose-50 text-rose-700", ring: "hover:border-rose-300", bar: "bg-rose-500" },
  amber: { chip: "bg-amber-50 text-amber-700", ring: "hover:border-amber-300", bar: "bg-amber-500" },
  sky: { chip: "bg-sky-50 text-sky-700", ring: "hover:border-sky-300", bar: "bg-sky-500" },
  violet: { chip: "bg-violet-50 text-violet-700", ring: "hover:border-violet-300", bar: "bg-violet-500" },
  slate: { chip: "bg-slate-100 text-slate-700", ring: "hover:border-slate-300", bar: "bg-slate-500" },
};

/* ---------------------------------------------------------------- helpers */

function dateKey(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

type PresetId = "this_month" | "last_month" | "last_3_months" | "this_fy" | "last_fy" | "all_time" | "custom";

const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_3_months", label: "Last 3 months" },
  { id: "this_fy", label: "This FY" },
  { id: "last_fy", label: "Last FY" },
  { id: "all_time", label: "All time" },
  { id: "custom", label: "Custom" },
];

function presetRange(preset: PresetId): { from: string; to: string } | null {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const fyStartYear = month >= 3 ? year : year - 1;
  if (preset === "this_month") return { from: dateKey(new Date(year, month, 1)), to: dateKey(new Date(year, month + 1, 0)) };
  if (preset === "last_month") return { from: dateKey(new Date(year, month - 1, 1)), to: dateKey(new Date(year, month, 0)) };
  if (preset === "last_3_months") return { from: dateKey(new Date(year, month - 2, 1)), to: dateKey(new Date(year, month + 1, 0)) };
  if (preset === "this_fy") return { from: dateKey(new Date(fyStartYear, 3, 1)), to: dateKey(new Date(fyStartYear + 1, 2, 31)) };
  if (preset === "last_fy") return { from: dateKey(new Date(fyStartYear - 1, 3, 1)), to: dateKey(new Date(fyStartYear, 2, 31)) };
  if (preset === "all_time") return { from: "2015-01-01", to: dateKey(new Date(year, month + 1, 0)) };
  return null;
}

const GST_OPTIONS: Array<{ id: GstFilter; label: string }> = [
  { id: "all", label: "All fees" },
  { id: "gst", label: "GST fees" },
  { id: "non_gst", label: "Non-GST fees" },
];

function money(value: number) {
  return formatINR(Number(value || 0));
}

function cellValue(value: unknown, type?: string) {
  if (value === null || value === undefined || value === "") return "-";
  if (type === "money") return money(Number(value));
  if (type === "percent") return `${Number(value)}%`;
  if (type === "number") return new Intl.NumberFormat("en-IN").format(Number(value));
  if (type === "date") return new Date(value as string).toLocaleDateString("en-IN");
  if (type === "datetime") return new Date(value as string).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  return String(value);
}

function badgeTone(value: string) {
  const key = String(value || "").toLowerCase();
  if (["paid", "converted", "active", "gst", "demo done", "retained"].includes(key)) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (["overdue", "left", "no show", "missed", "cancelled"].includes(key)) return "bg-rose-50 text-rose-700 ring-rose-200";
  if (["unpaid", "paused", "assessment pending", "requested"].includes(key)) return "bg-amber-50 text-amber-700 ring-amber-200";
  if (["scheduled", "demo conversion", "non-gst", "draft"].includes(key)) return "bg-sky-50 text-sky-700 ring-sky-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

/* ------------------------------------------------------------ detail modal */

function DetailModal({
  tables,
  onClose,
  exportBase,
  rangeLabel,
}: {
  tables: DetailTable[];
  onClose: () => void;
  exportBase: string;
  rangeLabel: string;
}) {
  const [activeId, setActiveId] = useState(tables[0]?.id || "");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  const active = tables.find((table) => table.id === activeId) || tables[0];

  useEffect(() => {
    setQuery("");
    setSort(null);
  }, [activeId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const rows = useMemo(() => {
    if (!active) return [];
    const needle = query.trim().toLowerCase();
    let list = active.rows;
    if (needle) {
      list = list.filter((row) =>
        active.columns.some((column) => String(cellValue(row[column.key], column.type)).toLowerCase().includes(needle))
      );
    }
    if (sort) {
      const column = active.columns.find((item) => item.key === sort.key);
      list = [...list].sort((a, b) => {
        const left = a[sort.key];
        const right = b[sort.key];
        let result = 0;
        if (column?.type === "money" || column?.type === "number" || column?.type === "percent") {
          result = Number(left || 0) - Number(right || 0);
        } else if (column?.type === "date" || column?.type === "datetime") {
          result = new Date(left || 0).getTime() - new Date(right || 0).getTime();
        } else {
          result = String(left ?? "").localeCompare(String(right ?? ""));
        }
        return sort.direction === "asc" ? result : -result;
      });
    }
    return list;
  }, [active, query, sort]);

  if (!active) return null;

  const visibleTotals = active.columns.filter((column) => active.totals && active.totals[column.key] !== undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="border-b border-slate-100 bg-gradient-to-r from-brand to-brand-400 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">{rangeLabel}</div>
              <h2 className="truncate text-lg font-bold">{active.title}</h2>
              {active.subtitle ? <p className="mt-0.5 text-xs text-white/80">{active.subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white transition hover:bg-white/25"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {tables.length > 1 ? (
          <div className="flex gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50 px-4 py-2">
            {tables.map((table) => (
              <button
                key={table.id}
                type="button"
                onClick={() => setActiveId(table.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  table.id === activeId ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-brand"
                }`}
              >
                {table.title}
                <span className={`ml-1.5 ${table.id === activeId ? "text-white/70" : "text-slate-400"}`}>{table.rows.length}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <label className="relative flex h-9 min-w-[220px] flex-1 items-center sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search these rows"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-950 placeholder-slate-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
            />
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">
              {rows.length} of {active.rows.length} rows
            </span>
            <a
              href={`${exportBase}&export=${active.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-brand transition hover:border-brand/40 hover:bg-brand-50"
            >
              <Download size={14} /> CSV
            </a>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {rows.length ? (
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  {active.columns.map((column) => (
                    <th
                      key={column.key}
                      className={`cursor-pointer whitespace-nowrap px-4 py-3 font-bold transition hover:text-brand ${
                        column.align === "right" ? "text-right" : "text-left"
                      }`}
                      onClick={() =>
                        setSort((current) =>
                          current?.key === column.key
                            ? { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" }
                            : { key: column.key, direction: column.type === "money" || column.type === "number" ? "desc" : "asc" }
                        )
                      }
                    >
                      {column.label}
                      {sort?.key === column.key ? <span className="ml-1 text-brand">{sort.direction === "asc" ? "^" : "v"}</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-t border-slate-100 transition hover:bg-brand-50/40">
                    {active.columns.map((column) => (
                      <td
                        key={column.key}
                        className={`whitespace-nowrap px-4 py-2.5 ${column.align === "right" ? "text-right tabular-nums" : "text-left"} ${
                          column.type === "money" ? "font-semibold text-slate-950" : "text-slate-700"
                        }`}
                      >
                        {column.type === "badge" ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ring-1 ${badgeTone(row[column.key])}`}>
                            {cellValue(row[column.key], column.type)}
                          </span>
                        ) : (
                          cellValue(row[column.key], column.type)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {visibleTotals.length ? (
                <tfoot className="sticky bottom-0 bg-slate-50 text-sm font-bold text-slate-950">
                  <tr className="border-t-2 border-slate-200">
                    {active.columns.map((column, index) => (
                      <td key={column.key} className={`px-4 py-3 ${column.align === "right" ? "text-right tabular-nums" : "text-left"}`}>
                        {index === 0
                          ? "Total"
                          : active.totals && active.totals[column.key] !== undefined
                            ? cellValue(active.totals[column.key], column.type)
                            : ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-slate-500">
              <Layers size={22} className="text-slate-300" />
              {active.rows.length ? "No rows match your search." : "Nothing recorded for this range yet."}
            </div>
          )}
        </div>

        {active.footnote ? (
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] text-slate-500">{active.footnote}</div>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- KPI cards */

function KpiCard({ card, onOpen }: { card: CardDef; onOpen: (tables: string[]) => void }) {
  const tone = TONES[card.tone || "brand"];
  const Icon = card.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(card.tables)}
      className={`group flex flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-900/5 ${tone.ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{card.label}</div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.chip}`}>
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">{card.value}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
        {card.delta ? (
          <span className={`inline-flex items-center gap-0.5 font-bold ${card.delta.positive ? "text-emerald-600" : "text-rose-600"}`}>
            {card.delta.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {card.delta.value}
          </span>
        ) : null}
        <span className="truncate">{card.note}</span>
      </div>
      {typeof card.progress === "number" ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(0, Math.min(100, card.progress))}%` }} />
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-1 text-[11px] font-bold text-brand opacity-0 transition group-hover:opacity-100">
        View details <ChevronRight size={12} />
      </div>
    </button>
  );
}

function Section({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white shadow-sm">
          <Icon size={16} />
        </span>
        <div>
          <h2 className="text-base font-bold leading-tight text-slate-950">{title}</h2>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- surface */

export function FinanceDashboard({
  initial,
  quickLinks,
}: {
  initial: FeesAnalytics;
  quickLinks: Array<[string, string]>;
}) {
  const [data, setData] = useState<FeesAnalytics>(initial);
  const [preset, setPreset] = useState<PresetId>("this_month");
  const [from, setFrom] = useState(initial.range.from);
  const [to, setTo] = useState(initial.range.to);
  const [gst, setGst] = useState<GstFilter>(initial.gst);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modalTables, setModalTables] = useState<string[] | null>(null);

  const query = useMemo(() => `from=${from}&to=${to}&gst=${gst}`, [from, to, gst]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/fees/analytics?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load the finance data.");
      setData(await response.json());
    } catch (issue: any) {
      setError(issue?.message || "Unable to load the finance data.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const first = `${initial.range.from}|${initial.range.to}|${initial.gst}`;
  useEffect(() => {
    if (`${from}|${to}|${gst}` === first) return;
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [from, to, gst, first, load]);

  const applyPreset = (id: PresetId) => {
    setPreset(id);
    const range = presetRange(id);
    if (range) {
      setFrom(range.from);
      setTo(range.to);
    }
  };

  const k = data.kpis;

  const collectionCards: CardDef[] = [
    {
      key: "collected",
      label: "Fees collected",
      value: money(k.collected),
      note: `${k.collectedCount} invoices paid`,
      icon: Banknote,
      tone: "emerald",
      tables: ["collected", "gst", "lateFees", "discounts"],
    },
    {
      key: "net",
      label: "Fees excluding GST",
      value: money(k.netCollected),
      note: "Net academy earnings",
      icon: PieChart,
      tone: "brand",
      tables: ["collected"],
    },
    {
      key: "gst",
      label: "GST collected",
      value: money(k.gstCollected),
      note: `${k.gstInvoiceCount} GST invoices`,
      icon: Receipt,
      tone: "violet",
      tables: ["gst"],
    },
    {
      key: "outstanding",
      label: "Outstanding fees",
      value: money(k.outstanding),
      note: `${k.outstandingCount} overdue invoices`,
      icon: AlertTriangle,
      tone: "rose",
      tables: ["outstanding", "dueSoon"],
    },
    {
      key: "dueSoon",
      label: "Due in next 7 days",
      value: money(k.dueSoon),
      note: `${k.dueSoonCount} invoices approaching`,
      icon: CalendarClock,
      tone: "amber",
      tables: ["dueSoon", "outstanding"],
    },
    {
      key: "lateFees",
      label: "Late fees",
      value: money(k.lateFeeCollected),
      note: `${k.lateFeeCount} invoices with late fee`,
      icon: FileText,
      tone: "slate",
      tables: ["lateFees"],
    },
    {
      key: "discounts",
      label: "Discounts given",
      value: money(k.discountValue),
      note: `${k.discountCount} students discounted`,
      icon: Gift,
      tone: "sky",
      tables: ["discounts"],
    },
    {
      key: "issued",
      label: "Invoices issued",
      value: String(k.issuedCount),
      note: `${money(k.issuedValue)} billed`,
      icon: Layers,
      tone: "brand",
      tables: ["issued", "deletedInvoices"],
    },
  ];

  const growthCards: CardDef[] = [
    {
      key: "newStudents",
      label: "New students",
      value: String(k.newStudents),
      note: "Joined in this range",
      icon: UserPlus,
      tone: "emerald",
      tables: ["newStudents"],
    },
    {
      key: "newFees",
      label: "New fees won",
      value: money(k.newStudentBilled),
      note: `${money(k.newStudentCollected)} already collected`,
      icon: TrendingUp,
      tone: "emerald",
      tables: ["newStudents"],
    },
    {
      key: "newRecurring",
      label: "Recurring value added",
      value: money(k.newStudentRecurring),
      note: "Plan value of new students",
      icon: Repeat,
      tone: "brand",
      tables: ["newStudents"],
    },
    {
      key: "left",
      label: "Students left",
      value: String(k.leftStudents),
      note: "Deactivated in this range",
      icon: UserMinus,
      tone: "rose",
      tables: ["deactivatedStudents"],
    },
    {
      key: "lost",
      label: "Recurring value lost",
      value: money(k.churnRecurringLost),
      note: `${money(k.churnUnpaid)} unpaid dues left behind`,
      icon: TrendingDown,
      tone: "rose",
      tables: ["deactivatedStudents"],
    },
    {
      key: "netGrowth",
      label: "Net student growth",
      value: `${k.netStudentGrowth > 0 ? "+" : ""}${k.netStudentGrowth}`,
      note: "New students minus students who left",
      icon: LineChart,
      tone: k.netStudentGrowth >= 0 ? "emerald" : "rose",
      tables: ["newStudents", "deactivatedStudents"],
      delta: { value: money(Math.abs(k.netRecurringGrowth)), positive: k.netRecurringGrowth >= 0 },
    },
  ];

  const demoCards: CardDef[] = [
    {
      key: "demosScheduled",
      label: "Demos scheduled",
      value: String(k.demosScheduled),
      note: "Booked inside this range",
      icon: CalendarRange,
      tone: "sky",
      tables: ["demos", "demosDone", "demosConverted", "demosNoShow"],
    },
    {
      key: "demosDone",
      label: "Demos delivered",
      value: String(k.demosDone),
      note: `${k.demosNoShow} missed or no show`,
      icon: GraduationCap,
      tone: "brand",
      tables: ["demosDone", "demosNoShow"],
    },
    {
      key: "demosConverted",
      label: "Demos converted",
      value: String(k.demosConverted),
      note: `${money(k.demoRevenue)} collected from them`,
      icon: Target,
      tone: "emerald",
      tables: ["demosConverted", "coachConversion"],
    },
    {
      key: "conversionRate",
      label: "Academy conversion rate",
      value: `${k.demoConversionRate}%`,
      note: `${k.demosConverted} of ${k.demosDone} delivered demos`,
      icon: Percent,
      tone: "violet",
      tables: ["coachConversion", "demosConverted", "demosDone"],
      progress: k.demoConversionRate,
    },
  ];

  const retentionCards: CardDef[] = [
    {
      key: "retentionValue",
      label: "Retention rate by value",
      value: `${k.retentionRateByValue}%`,
      note: `${money(k.retentionCollectedAmount)} kept of ${money(k.retentionCollectedAmount + k.retentionMissedAmount)}`,
      icon: Percent,
      tone: "emerald",
      tables: ["retentionCollected", "retentionMissed", "retentionPending", "retentionStudents"],
      progress: k.retentionRateByValue,
    },
    {
      key: "retentionCount",
      label: "Retention rate by invoice",
      value: `${k.retentionRateByCount}%`,
      note: `${k.retentionCollectedCount} paid, ${k.retentionMissedCount} missed`,
      icon: Receipt,
      tone: "brand",
      tables: ["retentionCollected", "retentionMissed", "retentionPending"],
      progress: k.retentionRateByCount,
    },
    {
      key: "retained",
      label: "Retained revenue",
      value: money(k.retentionCollectedAmount),
      note: `From ${k.retentionStudents} existing students`,
      icon: WalletCards,
      tone: "emerald",
      tables: ["retentionCollected"],
    },
    {
      key: "missed",
      label: "Missed revenue",
      value: money(k.retentionMissedAmount),
      note: `${k.retentionMissedCount} invoices went unpaid`,
      icon: AlertTriangle,
      tone: "rose",
      tables: ["retentionMissed"],
    },
    {
      key: "studentRetention",
      label: "Student retention",
      value: `${k.studentRetentionRate}%`,
      note: `${k.retainedStudents} stayed, ${k.churnedExisting} left`,
      icon: Users,
      tone: "sky",
      tables: ["retentionStudents"],
      progress: k.studentRetentionRate,
    },
    {
      key: "pending",
      label: "Not yet due",
      value: money(k.retentionPendingAmount),
      note: `${k.retentionPendingCount} invoices still open`,
      icon: CalendarClock,
      tone: "amber",
      tables: ["retentionPending"],
    },
  ];

  const expectedCards: CardDef[] = [
    {
      key: "expectedTotal",
      label: "Total expected revenue",
      value: money(k.expectedTotal),
      note: "If every class runs and every plan is paid",
      icon: Sparkles,
      tone: "violet",
      tables: ["expectedMonthly", "expectedCredits"],
    },
    {
      key: "expectedMonthly",
      label: "Expected from monthly plans",
      value: money(k.expectedMonthly),
      note: `${k.expectedMonthlyCycles} billing cycles across ${k.expectedMonthlyStudents} students`,
      icon: Repeat,
      tone: "brand",
      tables: ["expectedMonthly"],
    },
    {
      key: "expectedCredits",
      label: "Expected from credit plans",
      value: money(k.expectedCredits),
      note: `${k.expectedCreditSessions} scheduled classes for ${k.expectedCreditStudents} students`,
      icon: WalletCards,
      tone: "sky",
      tables: ["expectedCredits"],
    },
    {
      key: "expectedGap",
      label: "Collected vs expected",
      value: `${k.expectedTotal ? Math.round((k.collected / k.expectedTotal) * 100) : 0}%`,
      note: `${money(k.collected)} collected so far`,
      icon: Target,
      tone: "emerald",
      tables: ["collected", "expectedMonthly", "expectedCredits"],
      progress: k.expectedTotal ? (k.collected / k.expectedTotal) * 100 : 0,
    },
  ];

  const operationCards: CardDef[] = [
    { key: "active", label: "Active students", value: String(k.activeStudents), note: "Live enrolled accounts", icon: Users, tone: "brand", tables: ["activeStudents"] },
    { key: "credit", label: "Credit students", value: String(k.creditStudents), note: `${k.lowCreditStudents} running low`, icon: WalletCards, tone: "sky", tables: ["creditStudents", "lowCredit"] },
    { key: "monthly", label: "Monthly students", value: String(k.monthlyStudents), note: "On a recurring plan", icon: Repeat, tone: "violet", tables: ["monthlyStudents"] },
    { key: "lowCredit", label: "Low credit alerts", value: String(k.lowCreditStudents), note: "Need a recharge invoice", icon: AlertTriangle, tone: "amber", tables: ["lowCredit"] },
    { key: "unassigned", label: "Students without a plan", value: String(k.unassignedStudents), note: "Active but not billed", icon: UserPlus, tone: "rose", tables: ["unassignedStudents"] },
    { key: "deleted", label: "Deleted invoices", value: String(k.deletedInvoices), note: "Audit trail with reasons", icon: FileX2, tone: "slate", tables: ["deletedInvoices"] },
  ];

  const openModal = (tables: string[]) => setModalTables(tables);
  const modalDetail = modalTables
    ? (modalTables.map((id) => data.tables[id]).filter(Boolean) as DetailTable[])
    : null;

  const topCoaches = data.coachConversion.filter((row) => row.done > 0).slice(0, 6);

  return (
    <div className="min-h-screen bg-slate-50 px-4 pb-10 pt-4 text-slate-950 sm:px-6 lg:px-8">
      {/* header + filters */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-brand via-brand-400 to-brand p-5 text-white">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">Finance</div>
              <h1 className="text-2xl font-black tracking-tight">Financial Dashboard</h1>
              <p className="mt-1 text-sm text-white/80">
                {data.range.label} - {GST_OPTIONS.find((option) => option.id === gst)?.label}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-white/60">Collected</div>
                <div className="text-xl font-black">{money(k.collected)}</div>
              </div>
              <div className="hidden h-9 w-px bg-white/20 sm:block" />
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-white/60">Expected</div>
                <div className="text-xl font-black">{money(k.expectedTotal)}</div>
              </div>
              <div className="hidden h-9 w-px bg-white/20 sm:block" />
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-white/60">Outstanding</div>
                <div className="text-xl font-black">{money(k.outstanding)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 p-4">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => applyPreset(option.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  preset === option.id ? "bg-brand text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-brand-50 hover:text-brand"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setPreset("custom");
                setFrom(event.target.value);
              }}
              className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
            />
            <span className="text-xs font-bold text-slate-400">to</span>
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setPreset("custom");
                setTo(event.target.value);
              }}
              className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
            />
          </div>

          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {GST_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setGst(option.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                  gst === option.id ? "bg-white text-brand shadow-sm" : "text-slate-600 hover:text-brand"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={load}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-brand/40 hover:text-brand"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">{error}</div>
      ) : null}

      <div className={loading ? "pointer-events-none opacity-60 transition" : "transition"}>
        <Section title="Collections" description="Money actually received, billed and still owed in this window" icon={Banknote}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {collectionCards.map((card) => (
              <KpiCard key={card.key} card={card} onOpen={openModal} />
            ))}
          </div>
        </Section>

        <Section title="Sales growth and churn" description="New students won, students lost, and the fee value that moved with them" icon={TrendingUp}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {growthCards.map((card) => (
              <KpiCard key={card.key} card={card} onOpen={openModal} />
            ))}
          </div>
        </Section>

        <Section title="Demos and conversion" description="Demo pipeline for the academy and for every coach" icon={Target}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {demoCards.map((card) => (
              <KpiCard key={card.key} card={card} onOpen={openModal} />
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-950">Conversion rate by coach</h3>
                <p className="text-xs text-slate-500">Converted demos as a share of the demos each coach delivered.</p>
              </div>
              <button
                type="button"
                onClick={() => openModal(["coachConversion", "demosConverted", "demosDone"])}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-brand transition hover:border-brand/40 hover:bg-brand-50"
              >
                Full table <ChevronRight size={13} />
              </button>
            </div>
            {topCoaches.length ? (
              <div className="space-y-2.5">
                {topCoaches.map((row) => (
                  <div key={row.coachId} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 truncate text-sm font-semibold text-slate-800">{row.coach}</div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, row.rate)}%` }} />
                    </div>
                    <div className="w-32 shrink-0 text-right text-xs font-bold text-slate-600">
                      <span className="text-slate-950">{row.rate}%</span> - {row.converted}/{row.done}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No demos were delivered in this range.</p>
            )}
          </div>
        </Section>

        <Section title="Retention" description="How much of the money owed by existing students actually came in" icon={Repeat}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {retentionCards.map((card) => (
              <KpiCard key={card.key} card={card} onOpen={openModal} />
            ))}
          </div>
        </Section>

        <Section title="Expected revenue" description="What the range should earn if every scheduled class runs and every plan is paid" icon={Sparkles}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {expectedCards.map((card) => (
              <KpiCard key={card.key} card={card} onOpen={openModal} />
            ))}
          </div>
        </Section>

        <Section title="Students and operations" description="Who is on the books, and where billing needs attention" icon={Users}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {operationCards.map((card) => (
              <KpiCard key={card.key} card={card} onOpen={openModal} />
            ))}
          </div>
        </Section>

        {quickLinks.length ? (
          <Section title="Fee management" description="Jump into the day to day billing screens" icon={Layers}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {quickLinks.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/40 hover:text-brand hover:shadow-lg hover:shadow-brand-900/5"
                >
                  {label} <ChevronRight size={15} className="text-slate-400" />
                </Link>
              ))}
            </div>
          </Section>
        ) : null}
      </div>

      <p className="mt-6 text-center text-[11px] text-slate-400">
        Updated {new Date(data.generatedAt).toLocaleString("en-IN")} - every card opens the underlying records.
      </p>

      {modalDetail && modalDetail.length ? (
        <DetailModal
          tables={modalDetail}
          onClose={() => setModalTables(null)}
          exportBase={`/api/fees/analytics?${query}`}
          rangeLabel={data.range.label}
        />
      ) : null}
    </div>
  );
}
