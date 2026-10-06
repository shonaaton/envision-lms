import { academyMonthOf, monthLabel } from "@/lib/feedback/feedbackCycleDates";

const RUPEES = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Whole rupees for the books: "₹1,20,000", losses as "-₹4,500". */
export function rupees(paise: number | null | undefined) {
  if (paise === null || paise === undefined) return "-";
  return RUPEES.format(Math.round(paise / 100));
}

export function percent(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${value > 0 ? "+" : ""}${value}%`;
}

export function margin(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `${value}%`;
}

/** "Apr 26" - column headers in the month-by-month tables. The running month reads "Oct 26 (so far)". */
export function shortMonth(month: string, now = new Date()) {
  const [year, m] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, m - 1, 15))) + ` ${String(year).slice(2)}`;
  return month === academyMonthOf(now) ? `${label} (so far)` : label;
}

export { monthLabel };
