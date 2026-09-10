import { ACADEMY_TIME_ZONE } from "@/lib/academyTime";

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

function startOfMonth(year: number, month: number) {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

function endOfMonth(year: number, month: number) {
  return new Date(year, month, 0, 23, 59, 59, 999);
}


function monthLabel(year: number, month: number) {
  return startOfMonth(year, month).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
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
    const from = fromRaw ? new Date(`${fromRaw}T00:00:00`) : MIN_DATE;
    const to = toRaw ? new Date(`${toRaw}T23:59:59.999`) : MAX_DATE;
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
      from: new Date(startYear, 3, 1, 0, 0, 0, 0),
      to: new Date(startYear + 1, 2, 31, 23, 59, 59, 999),
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

