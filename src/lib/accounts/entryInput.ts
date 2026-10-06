/**
 * Reading amounts and dates the way people and banks write them. Pure, shared
 * by the entry form, the CSV import and the bank statement reader.
 */

import { grossFromNetPayout, tdsOn } from "@/lib/accounts/metrics";

/**
 * Rupees as typed - "12,500", "₹ 1,20,000.50", "Rs.450", "(300)" - to paise.
 * Null when there is no number in it. Parentheses or a leading minus give a
 * negative, which callers reject or use as the sign of a bank row.
 */
export function parseEntryAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  let text = String(raw ?? "").trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/(₹|rs\.?|inr)/gi, "").replace(/[,\s]/g, "");
  if (/(cr|dr)$/i.test(text)) text = text.slice(0, -2);
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(text) && !/^\.\d+$/.test(text)) return null;
  const paise = Math.round(Number(text) * 100);
  return negative ? -paise : paise;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Noon in Kolkata on that day, so no zone shift can move it to a neighbouring day or month. */
function istNoon(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2200) return null;
  const date = new Date(`${year}-${pad(month)}-${pad(day)}T12:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return null;
  // 31/02 rolls into March in JavaScript; a bank never means that.
  const check = new Date(date.getTime() + 5.5 * 3600 * 1000);
  if (check.getUTCDate() !== day) return null;
  return date;
}

/**
 * A date as Indian banks and spreadsheets write it. Day first, never month
 * first: "03/04/2026" is 3 April. Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YY,
 * "03 Apr 2026", "03-Apr-26", an ISO timestamp, a Date, or an Excel day serial.
 */
export function parseEntryDate(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number" && raw > 20000 && raw < 80000) {
    // Excel serial: days since 1899-12-30.
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86400000);
    return istNoon(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
  }
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (/^\d{5}(\.\d+)?$/.test(text)) return parseEntryDate(Number(text));

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (match) return istNoon(Number(match[1]), Number(match[2]), Number(match[3]));

  match = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:\s.*)?$/);
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return istNoon(year, Number(match[2]), Number(match[1]));
  }

  match = text.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3,9})[\s\-/,]*(\d{2,4})(?:\s.*)?$/);
  if (match) {
    const month = MONTHS[match[2].slice(0, 4).toLowerCase()] || MONTHS[match[2].slice(0, 3).toLowerCase()];
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return month ? istNoon(year, month, Number(match[1])) : null;
  }
  return null;
}

/**
 * Teacher pay is booked at the gross invoice. When the admin types what the
 * coach actually received (90% after TDS), the gross is worked back from it.
 */
export function teacherPayAmounts(typed: number, basis: "gross" | "net_paid", tdsDeducted: boolean) {
  if (!tdsDeducted) return { amount: typed, tdsAmount: 0 };
  const amount = basis === "net_paid" ? grossFromNetPayout(typed) : typed;
  return { amount, tdsAmount: tdsOn(amount) };
}

/**
 * A month as people write it - "2026-04", "04/2026", "Apr 2026", "April-26" -
 * as "YYYY-MM". Null when it is not a month.
 */
export function parseMonthKey(raw: unknown): string | null {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return null;
  let match = text.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (match) return Number(match[2]) >= 1 && Number(match[2]) <= 12 ? `${match[1]}-${pad(Number(match[2]))}` : null;
  match = text.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (match) return Number(match[1]) >= 1 && Number(match[1]) <= 12 ? `${match[2]}-${pad(Number(match[1]))}` : null;
  match = text.match(/^([a-z]{3,9})[\s\-/,']*(\d{2}|\d{4})$/);
  if (match) {
    const month = MONTHS[match[1].slice(0, 4)] || MONTHS[match[1].slice(0, 3)];
    const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
    return month ? `${year}-${pad(month)}` : null;
  }
  return null;
}
