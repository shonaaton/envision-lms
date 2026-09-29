import { ACADEMY_TIME_ZONE, zonedDateTime } from "@/lib/academyTime";

/**
 * The reporting window a payroll screen is looking at.
 *
 * Payroll is argued about in whole months and financial years, not in
 * timestamps, so the preset is carried alongside the resolved bounds - the UI
 * needs to know that "last month" was asked for, not just the two dates it
 * happened to resolve to today.
 */

export const PAY_PERIOD_PRESETS = ["this_month", "last_month", "month", "range", "fy", "all"] as const;
export type PayPeriodPreset = (typeof PAY_PERIOD_PRESETS)[number];

export type PayPeriod = {
  preset: PayPeriodPreset;
  from: Date;
  to: Date;
  label: string;
  /** Echoed back into filter inputs so the form keeps showing what was asked. */
  month: string;
  fromInput: string;
  toInput: string;
  fyStart: number;
};

const MIN_DATE = new Date(-8640000000000000);
const MAX_DATE = new Date(8640000000000000);

function param(params: Record<string, string | string[] | undefined>, key: string, fallback = "") {
  const raw = params[key];
  return (typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "") || fallback;
}

/** Academy-local Y/M/D for an instant, so "this month" means this month in Kolkata. */
function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ACADEMY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * Midnight in Kolkata on a calendar day, whatever zone the server runs in.
 *
 * `new Date(y, m, d)` is midnight in the server's own zone, and the production
 * container runs UTC - so every payroll month used to open at 05:30 IST on the
 * 1st, and a class at 01:00 IST on the 1st was billed to the month before.
 * Month overflow (month 13, day 0) is normalised the same way `Date` does it.
 */
function academyMidnight(year: number, month: number, day: number) {
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return zonedDateTime(
    `${normalized.getUTCFullYear()}-${pad(normalized.getUTCMonth() + 1)}-${pad(normalized.getUTCDate())}`,
    "00:00"
  );
}

function startOfMonth(year: number, month: number) {
  return academyMidnight(year, month, 1);
}

function endOfMonth(year: number, month: number) {
  return new Date(academyMidnight(year, month + 1, 1).getTime() - 1);
}

function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** A "YYYY-MM-DD" typed into a date box, as the first or last instant of that day in Kolkata. */
function academyDayEdge(value: string, edge: "start" | "end") {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return edge === "start" ? academyMidnight(year, month, day) : new Date(academyMidnight(year, month, day + 1).getTime() - 1);
}

/**
 * The financial year a date belongs to, named by its opening calendar year.
 * India's runs 1 April - 31 March, so 15 Feb 2026 is FY 2025-26.
 */
export function financialYearOf(date: Date) {
  const { year, month } = localParts(date);
  return month >= 4 ? year : year - 1;
}

export function financialYearLabel(startYear: number) {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** The financial years worth offering in a dropdown, newest first. */
export function financialYearOptions(now = new Date(), back = 6) {
  const current = financialYearOf(now);
  return Array.from({ length: back }, (_, index) => current - index);
}

export function resolvePayPeriod(
  params: Record<string, string | string[] | undefined>,
  now = new Date()
): PayPeriod {
  const today = localParts(now);
  const requested = param(params, "period") as PayPeriodPreset;
  const preset: PayPeriodPreset = (PAY_PERIOD_PRESETS as readonly string[]).includes(requested)
    ? requested
    : "this_month";

  if (preset === "all") {
    return {
      preset,
      from: MIN_DATE,
      to: MAX_DATE,
      label: "All time",
      month: "",
      fromInput: "",
      toInput: "",
      fyStart: financialYearOf(now),
    };
  }

  if (preset === "range") {
    const fromRaw = param(params, "from");
    const toRaw = param(params, "to");
    const from = (fromRaw && academyDayEdge(fromRaw, "start")) || MIN_DATE;
    const to = (toRaw && academyDayEdge(toRaw, "end")) || MAX_DATE;
    // An inverted range is a typo, not a request for zero rows - swapping the
    // ends shows what they meant instead of an empty table.
    const ordered = from > to ? { from: to, to: from } : { from, to };
    return {
      preset,
      ...ordered,
      label: `${fromRaw || "Start"} to ${toRaw || "Today"}`,
      month: "",
      fromInput: fromRaw,
      toInput: toRaw,
      fyStart: financialYearOf(now),
    };
  }

  if (preset === "fy") {
    const raw = Number(param(params, "fy"));
    const startYear = Number.isFinite(raw) && raw > 1990 && raw < 2200 ? raw : financialYearOf(now);
    return {
      preset,
      from: startOfMonth(startYear, 4),
      to: endOfMonth(startYear + 1, 3),
      label: financialYearLabel(startYear),
      month: "",
      fromInput: "",
      toInput: "",
      fyStart: startYear,
    };
  }

  if (preset === "month") {
    const raw = param(params, "month");
    const match = raw.match(/^(\d{4})-(\d{2})$/);
    const year = match ? Number(match[1]) : today.year;
    const month = match ? Number(match[2]) : today.month;
    const safeMonth = month >= 1 && month <= 12 ? month : today.month;
    return {
      preset,
      from: startOfMonth(year, safeMonth),
      to: endOfMonth(year, safeMonth),
      label: monthLabel(year, safeMonth),
      month: monthKey(year, safeMonth),
      fromInput: "",
      toInput: "",
      fyStart: financialYearOf(now),
    };
  }

  const offset = preset === "last_month" ? -1 : 0;
  const anchor = new Date(today.year, today.month - 1 + offset, 1);
  const year = anchor.getFullYear();
  const month = anchor.getMonth() + 1;
  return {
    preset,
    from: startOfMonth(year, month),
    to: endOfMonth(year, month),
    label: `${preset === "last_month" ? "Last month - " : "This month - "}${monthLabel(year, month)}`,
    month: monthKey(year, month),
    fromInput: "",
    toInput: "",
    fyStart: financialYearOf(now),
  };
}

