/**
 * The monthly feedback calendar, in academy time.
 *
 * A month's cycle opens on the 25th, so the coach writes about a month that is
 * nearly finished, and is due at 23:59 on the 5th of the following month. So
 * between the 1st and the 5th two things are true at once: last month's cycle
 * is still open, and this month's has not opened yet. `openCycleMonth()`
 * answers "which month is being written right now" for exactly that reason.
 *
 * Pure: no database, so the date edges (December into January, midnight IST)
 * are unit-testable.
 */

import { academyDateKey, zonedDateTime } from "@/lib/academyTime";

export const FEEDBACK_OPEN_DAY = 25;
export const FEEDBACK_DUE_DAY = 5;

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isFeedbackMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

function parts(month: string) {
  const match = month.match(MONTH_PATTERN);
  if (!match) throw new Error(`Invalid feedback month: ${month}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** The academy calendar month an instant falls in, "YYYY-MM". */
export function academyMonthOf(now: Date) {
  return academyDateKey(now).slice(0, 7);
}

export function shiftMonth(month: string, delta: number) {
  const { year, month: m } = parts(month);
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function cycleOpensAt(month: string) {
  const { year, month: m } = parts(month);
  return zonedDateTime(`${year}-${pad(m)}-${pad(FEEDBACK_OPEN_DAY)}`, "00:00");
}

export function cycleDueAt(month: string) {
  const next = parts(shiftMonth(month, 1));
  const due = zonedDateTime(`${next.year}-${pad(next.month)}-${pad(FEEDBACK_DUE_DAY)}`, "23:59");
  due.setSeconds(59, 999);
  return due;
}

/** First and last instant of the academy month, for attendance counts. */
export function monthBounds(month: string) {
  const { year, month: m } = parts(month);
  const next = parts(shiftMonth(month, 1));
  const start = zonedDateTime(`${year}-${pad(m)}-01`, "00:00");
  const end = new Date(zonedDateTime(`${next.year}-${pad(next.month)}-01`, "00:00").getTime() - 1);
  return { start, end };
}

/**
 * The month whose cycle is open at `now`, or null between the 6th and the 24th.
 * The current month once the 25th arrives; the previous month until its due date.
 */
export function openCycleMonth(now: Date) {
  const current = academyMonthOf(now);
  if (now >= cycleOpensAt(current)) return current;
  const previous = shiftMonth(current, -1);
  if (now <= cycleDueAt(previous)) return previous;
  return null;
}

export function monthLabel(month: string) {
  const { year, month: m } = parts(month);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, m - 1, 15)));
}
