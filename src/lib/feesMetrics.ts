/**
 * Pure fee metric rules shared by the finance dashboard and the billing engine.
 *
 * Nothing in here touches the database or the request, so every definition the
 * dashboard reports - what counts as a GST invoice, when a monthly plan bills,
 * whether an invoice was collected or missed - can be unit tested directly.
 */

export type RetentionBucket = "collected" | "missed" | "pending" | "excluded";

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function inRange(value: unknown, from: Date, to: Date) {
  const date = toDate(value);
  return !!date && date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
}

/** Share of `part` in `whole`, as a percentage with one decimal. */
export function rate(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/** An invoice carries GST only when it was raised under a taxed plan. */
export function isGstInvoice(invoice: any) {
  return invoice?.invoiceMode !== "non_gst" && (Number(invoice?.gstAmount || 0) > 0 || Number(invoice?.gstPercentage || 0) > 0);
}

export function matchesGst(invoice: any, filter: "all" | "gst" | "non_gst") {
  if (filter === "all") return true;
  return filter === "gst" ? isGstInvoice(invoice) : !isGstInvoice(invoice);
}

export function planIsGst(plan: any) {
  return !!plan && plan.gstMode !== "non_gst" && Number(plan.gstPercentage || 0) > 0;
}

export function planMatchesGst(plan: any, filter: "all" | "gst" | "non_gst") {
  if (filter === "all") return true;
  return filter === "gst" ? planIsGst(plan) : !planIsGst(plan);
}

/** Still owed: neither settled nor written off. */
export function isOpenInvoice(invoice: any) {
  return invoice?.status !== "paid" && invoice?.status !== "cancelled";
}

export function invoiceIssuedAt(invoice: any) {
  return invoice?.issueDate || invoice?.createdAt;
}

/** Enrolment date - a converted demo counts from the day the sale closed. */
export function joinedAt(student: any): Date {
  return toDate(student?.conversionSetup?.convertedAt) || toDate(student?.createdAt) || new Date(0);
}

/** Deactivation date - `deactivatedAt` when recorded, `updatedAt` for legacy rows. */
export function leftAt(student: any): Date | null {
  return toDate(student?.deactivatedAt) || toDate(student?.updatedAt);
}

/**
 * Where a single invoice lands in the retention split. `now` decides whether an
 * unpaid invoice has actually been missed or is simply not due yet.
 */
export function retentionBucket(invoice: any, now: Date): RetentionBucket {
  if (invoice?.status === "cancelled") return "excluded";
  if (invoice?.status === "paid") return "collected";
  const due = toDate(invoice?.dueDate);
  if (!due) return "excluded";
  return due.getTime() < now.getTime() ? "missed" : "pending";
}

/**
 * Due date of the Nth monthly invoice for a plan anchored at `startDate`.
 * Monthly billing is anchored to the first due date and ends the day, which is
 * exactly how `ensureMonthlyInvoices` generates invoices - keep them in step.
 */
export function monthlyDueDate(startDate: Date, monthOffset = 0) {
  const due = new Date(startDate);
  due.setMonth(due.getMonth() + monthOffset);
  due.setHours(23, 59, 59, 999);
  return due;
}

export function nextMonthlyDueDate(dueDate: Date) {
  return monthlyDueDate(dueDate, 1);
}

/** Every billing date for a monthly plan that falls inside [from, to]. */
export function monthlyCyclesInRange(anchor: Date, from: Date, to: Date): Date[] {
  const months = (to.getFullYear() - anchor.getFullYear()) * 12 + (to.getMonth() - anchor.getMonth());
  const cycles: Date[] = [];
  for (let offset = 0; offset <= Math.max(0, months); offset += 1) {
    const due = monthlyDueDate(anchor, offset);
    if (due.getTime() >= from.getTime() && due.getTime() <= to.getTime()) cycles.push(due);
  }
  return cycles;
}

export type LostInvoice = {
  invoice?: string;
  title?: string;
  due: unknown;
  total: number;
  source: string;
  wasStatus?: string;
};

/**
 * Collapse the invoices a paused student lost into one row each.
 *
 * The same invoice can show up from several sources - the pause voids it, an
 * admin later deletes it, and the cancelled row may still sit in the ledger -
 * so entries are keyed by invoice number, falling back to the due date for
 * archived rows that never carried one. Earlier entries win, so callers should
 * pass the most final state (deleted) first. Anything due outside [from, to] is
 * dropped, because it belongs to a different reporting period.
 */
export function mergeLostInvoices(entries: LostInvoice[], from: Date, to: Date) {
  const merged = new Map<string, LostInvoice & { due: Date }>();
  for (const entry of entries) {
    const due = toDate(entry.due);
    if (!due || !inRange(due, from, to)) continue;
    const key = entry.invoice && entry.invoice !== "-" ? `no:${entry.invoice}` : `due:${due.toDateString()}`;
    if (merged.has(key)) continue;
    merged.set(key, {
      invoice: entry.invoice || "-",
      title: entry.title || "-",
      due,
      total: Number(entry.total || 0),
      source: entry.source,
      wasStatus: entry.wasStatus || "unpaid",
    });
  }
  return [...merged.values()];
}

/**
 * Billing cycles inside a pause window that were never invoiced at all.
 *
 * A pause hits revenue twice: invoices already raised for the window are voided,
 * and monthly billing skips a paused student so later cycles are never raised.
 * Only the second half is returned here - any cycle that already has a voided
 * invoice against its due date is dropped, so the two halves never double count.
 */
export function unbilledPauseCycles(anchor: Date, holdFrom: Date, holdTo: Date, voidedDueDates: unknown[]): Date[] {
  const voidedDays = new Set(
    voidedDueDates
      .map((value) => toDate(value))
      .filter((date): date is Date => !!date)
      .map((date) => date.toDateString())
  );
  return monthlyCyclesInRange(anchor, holdFrom, holdTo).filter((due) => !voidedDays.has(due.toDateString()));
}

/** The part of a pause window that actually falls inside the reporting range. */
export function pauseHoldWindow(pausedFrom: unknown, pausedUntil: unknown, from: Date, to: Date) {
  const start = toDate(pausedFrom);
  const end = toDate(pausedUntil);
  if (!start || !end) return null;
  if (start.getTime() > to.getTime() || end.getTime() < from.getTime()) return null;
  return {
    holdFrom: new Date(Math.max(start.getTime(), from.getTime())),
    holdTo: new Date(Math.min(end.getTime(), to.getTime())),
  };
}

/** Local-time YYYY-MM-DD, so date inputs and the server agree on the day. */
export function dateKey(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function rangeLabel(from: Date, to: Date) {
  const format = (date: Date) => date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return `${format(from)} - ${format(to)}`;
}

function parseDay(value: string | null | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * Defaults to the current calendar month when either end is missing. The two
 * ends are ordered as calendar days *before* the day boundaries are applied, so
 * an inverted range still covers both of its edge days in full.
 */
export function resolveRange(fromParam?: string | null, toParam?: string | null) {
  const now = new Date();
  let startDay = parseDay(fromParam, new Date(now.getFullYear(), now.getMonth(), 1));
  let endDay = parseDay(toParam, new Date(now.getFullYear(), now.getMonth() + 1, 0));
  if (startDay.getTime() > endDay.getTime()) [startDay, endDay] = [endDay, startDay];
  return {
    from: new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate(), 0, 0, 0, 0),
    to: new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate(), 23, 59, 59, 999),
  };
}
