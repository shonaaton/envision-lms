import { z } from "zod";

import { ACADEMY_DEFAULTS } from "@/lib/branding";
import type { PayEvent } from "@/lib/coachPay";
import { academyDateKey } from "@/lib/academyTime";
import { academyMonthOf, monthBounds, monthLabel, shiftMonth } from "@/lib/feedback/feedbackCycleDates";

/**
 * The monthly invoice a coach or staff member raises to the academy.
 *
 * Pure and client-safe: the invoice builder uses the same totals and wording as
 * the server that saves the invoice and the PDF that prints it, so the number a
 * coach sees before pressing Generate is the number on the file.
 *
 * Every amount is paise, like the rest of the billing code.
 */

/** Where finished invoices are emailed. */
export const STAFF_INVOICE_EMAIL = "envisionchessacademy@gmail.com";

export const ACADEMY_BILL_TO = {
  name: ACADEMY_DEFAULTS.academyName,
  registeredName: ACADEMY_DEFAULTS.legalName,
  addressLines: ACADEMY_DEFAULTS.registeredAddress.split("\n"),
  affiliation: ACADEMY_DEFAULTS.affiliationLine,
  pan: "AALFE6840P",
  gstin: ACADEMY_DEFAULTS.gstNumber,
  phone: ACADEMY_DEFAULTS.phone,
  email: ACADEMY_DEFAULTS.email,
  website: ACADEMY_DEFAULTS.website,
};
export type AcademyBillTo = typeof ACADEMY_BILL_TO;

export type InvoiceLineGroup = "class" | "demo" | "bonus" | "manual";
export type InvoiceRateSource = "academy" | "coach_entered" | "manual";
export type InvoiceLineKind = PayEvent["kind"] | "manual";

export type DraftSession = { classroomId: string; sessionId: string; date: string };

/**
 * One row of the invoice before the coach has filled anything in. `rate` is
 * null when the academy has no price for these classes yet - the builder then
 * asks the coach for one.
 */
export type DraftGroup = {
  key: string;
  group: Exclude<InvoiceLineGroup, "manual">;
  kind: PayEvent["kind"];
  classroomId: string;
  title: string;
  batchName: string;
  quantity: number;
  minutes: number;
  rate: number | null;
  amount: number;
  needsRate: boolean;
  sessions: DraftSession[];
  /**
   * Classes in this row that had no rate on record and were billed at the rate
   * the batch's other classes carry. Filed for approval so payroll pays them too.
   */
  inferredSessions: DraftSession[];
};

export type InvoiceDraftGroups = {
  groups: DraftGroup[];
  /** Classes waiting on an admin's no-show ruling: not billable yet. */
  pending: { count: number; amount: number };
};

export const KIND_LABELS: Record<PayEvent["kind"], string> = {
  regular: "Regular classes",
  substitute: "Substitution classes",
  demo: "Demo classes",
  demoConversionBonus: "Demo conversion bonus",
};

function sessionOf(event: PayEvent): DraftSession[] {
  return event.sessionId ? [{ classroomId: event.classroomId, sessionId: event.sessionId, date: new Date(event.date).toISOString() }] : [];
}

/**
 * Turns a month of pay events into invoice rows: one per batch (classroom) and
 * type of class, so a row reads "5 classes x INR 600 = INR 3,000". Demos are one
 * row across all demo classrooms (each demo is its own classroom), and
 * conversion bonuses another.
 *
 * A class with no rate on record joins its batch's row at the rate the batch's
 * other classes carry - a one-off class the office never priced, say, is still
 * the same batch at the same rate. Only when nothing in the batch has a rate
 * does the row ask the coach for one. A batch whose classes genuinely carry two
 * rates in the month (a raise mid-month) keeps one row per rate.
 *
 * Pending no-shows are counted but never billed; declined ones are left out.
 */
export function groupInvoiceLines(events: PayEvent[]): InvoiceDraftGroups {
  const pending = { count: 0, amount: 0 };
  const buckets = new Map<string, PayEvent[]>();

  for (const event of events) {
    if (event.status === "pending_review") {
      pending.count += 1;
      pending.amount += event.exposure;
      continue;
    }
    if (event.status !== "payable" && event.status !== "unpriced") continue;
    const group = event.kind === "demo" ? "demo" : event.kind === "demoConversionBonus" ? "bonus" : "class";
    const base = group === "class" ? `${event.kind}:${event.classroomId}` : group;
    buckets.set(base, [...(buckets.get(base) || []), event]);
  }

  const groups: DraftGroup[] = [];
  for (const [base, bucket] of buckets) {
    const first = bucket[0];
    const group: DraftGroup["group"] = first.kind === "demo" ? "demo" : first.kind === "demoConversionBonus" ? "bonus" : "class";
    const row = (key: string, rate: number | null): DraftGroup => ({
      key,
      group,
      kind: first.kind,
      classroomId: group === "class" ? first.classroomId : "",
      title: group === "class" ? first.classroomTitle : KIND_LABELS[first.kind],
      batchName: group === "class" ? first.batchName : "",
      quantity: 0,
      minutes: 0,
      rate,
      amount: 0,
      needsRate: rate === null,
      sessions: [],
      inferredSessions: [],
    });

    const priced = bucket.filter((event) => event.status === "payable");
    const unpriced = bucket.filter((event) => event.status === "unpriced");
    const amounts = Array.from(new Set(priced.map((event) => event.amount)));
    const byAmount = new Map<number, DraftGroup>();
    for (const amount of amounts) byAmount.set(amount, row(`${base}:${amount}`, amount));

    for (const event of priced) {
      const target = byAmount.get(event.amount)!;
      target.quantity += 1;
      target.minutes += event.minutes;
      target.amount += event.amount;
      target.sessions.push(...sessionOf(event));
    }

    if (unpriced.length) {
      // One rate across the batch: the unpriced classes are billed at it.
      // None, or several: the coach says what the unpriced ones pay.
      const target = amounts.length === 1 ? byAmount.get(amounts[0])! : row(`${base}:unpriced`, null);
      for (const event of unpriced) {
        target.quantity += 1;
        target.minutes += event.minutes;
        target.sessions.push(...sessionOf(event));
        if (!target.needsRate) {
          target.amount += target.rate || 0;
          target.inferredSessions.push(...sessionOf(event));
        }
      }
      if (target.needsRate) groups.push(target);
    }
    groups.push(...byAmount.values());
  }

  const order: Record<DraftGroup["group"], number> = { class: 0, demo: 1, bonus: 2 };
  groups.sort(
    (a, b) =>
      order[a.group] - order[b.group] ||
      a.title.localeCompare(b.title) ||
      a.kind.localeCompare(b.kind) ||
      Number(a.needsRate) - Number(b.needsRate) ||
      (a.rate || 0) - (b.rate || 0)
  );
  return { groups, pending };
}

export type ManualLineInput = { description: string; quantity: number; rate: number };

export type InvoiceLine = {
  group: InvoiceLineGroup;
  kind: InvoiceLineKind;
  classroomId: string;
  title: string;
  batchName: string;
  quantity: number;
  minutes: number;
  rate: number;
  amount: number;
  rateSource: InvoiceRateSource;
  sessions: DraftSession[];
};

/**
 * The finished lines: priced groups as they are, unpriced groups at the rate the
 * coach typed, then manual items. `missing` lists the unpriced groups still
 * without a rate - an invoice is not generated while any remain.
 */
export function buildInvoiceLines(groups: DraftGroup[], enteredRates: Record<string, number | null | undefined>, manual: ManualLineInput[]) {
  const missing: string[] = [];
  const lines: InvoiceLine[] = [];
  for (const group of groups) {
    let rate = group.rate;
    let rateSource: InvoiceRateSource = "academy";
    if (group.needsRate) {
      const entered = enteredRates[group.key];
      if (entered === null || entered === undefined || !Number.isFinite(entered) || entered < 0) {
        missing.push(group.key);
        continue;
      }
      rate = Math.round(entered);
      rateSource = "coach_entered";
    }
    const unitRate = rate || 0;
    lines.push({
      group: group.group,
      kind: group.kind,
      classroomId: group.classroomId,
      title: group.title,
      batchName: group.batchName,
      quantity: group.quantity,
      minutes: group.minutes,
      rate: unitRate,
      amount: group.needsRate ? unitRate * group.quantity : group.amount,
      rateSource,
      sessions: group.sessions,
    });
  }
  for (const item of manual) {
    lines.push({
      group: "manual",
      kind: "manual",
      classroomId: "",
      title: item.description.trim(),
      batchName: "",
      quantity: item.quantity,
      minutes: 0,
      rate: Math.round(item.rate),
      amount: Math.round(item.quantity * item.rate),
      rateSource: "manual",
      sessions: [],
    });
  }
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return { lines, missing, total };
}

// ---------------------------------------------------------------------------
// Amount in words, Indian system (lakh, crore).

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(value: number) {
  if (value < 20) return ONES[value];
  return [TENS[Math.floor(value / 10)], ONES[value % 10]].filter(Boolean).join(" ");
}

function belowThousand(value: number) {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

/** A whole number in words, Indian grouping: 1,23,45,678 is "One Crore Twenty Three Lakh ...". */
export function numberInWordsIndian(value: number): string {
  const whole = Math.floor(Math.abs(value));
  if (whole === 0) return "Zero";
  const crore = Math.floor(whole / 10_000_000);
  const lakh = Math.floor((whole % 10_000_000) / 100_000);
  const thousand = Math.floor((whole % 100_000) / 1000);
  const rest = whole % 1000;
  return [
    crore ? `${numberInWordsIndian(crore)} Crore` : "",
    lakh ? `${belowHundred(lakh)} Lakh` : "",
    thousand ? `${belowHundred(thousand)} Thousand` : "",
    rest ? belowThousand(rest) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** "Rupees Twelve Thousand Five Hundred and Fifty Paise Only". */
export function amountInWordsINR(paise: number) {
  const total = Math.round(Math.max(0, Number(paise) || 0));
  const rupees = Math.floor(total / 100);
  const cents = total % 100;
  return `Rupees ${numberInWordsIndian(rupees)}${cents ? ` and ${belowHundred(cents)} Paise` : ""} Only`;
}

// ---------------------------------------------------------------------------
// Numbering, naming and dates.

/**
 * The number after this one: the last run of digits goes up by one, keeping its
 * zero padding ("SC-009" -> "SC-010", "ECA/2026/7" -> "ECA/2026/8"). A number
 * with no digits is treated as the first, so "INV" -> "INV-2".
 */
export function incrementInvoiceNumber(value: string) {
  const current = String(value || "").trim();
  if (!current) return "";
  const match = current.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) return `${current}-2`;
  const [, prefix, digits, suffix] = match;
  const next = String(Number(digits) + 1).padStart(digits.length, "0");
  return `${prefix}${next}${suffix}`;
}

function fileSafeWord(value: string) {
  return value.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "");
}

/** `Firstname_Lastname_September_2026.pdf` - first and last words of the full name. */
export function invoiceFileName(fullName: string, month: string) {
  const words = String(fullName || "").trim().split(/\s+/).map(fileSafeWord).filter(Boolean);
  const nameParts = words.length > 1 ? [words[0], words[words.length - 1]] : words.length ? [words[0]] : ["Invoice"];
  const [monthName, year] = monthLabel(month).split(" ");
  return `${[...nameParts, monthName, year].join("_")}.pdf`;
}

export function invoiceEmailSubject(input: { invoiceNumber: string; fullName: string; month: string }) {
  return `Invoice ${input.invoiceNumber} | ${input.fullName.trim()} | ${monthLabel(input.month)}`;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The invoice date for a month - always its last day - as "30 Sep 2026". */
export function invoiceDateLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${String(lastDay).padStart(2, "0")} ${MONTHS_SHORT[m - 1]} ${year}`;
}

/** The instant stored as the invoice date: the last moment of the month in Kolkata. */
export function invoiceDateFor(month: string) {
  return monthBounds(month).end;
}

/** An invoice for a month can be raised from that month's last day (Kolkata) onwards. */
export function isInvoiceMonthOpen(month: string, now = new Date()) {
  return academyDateKey(now) >= academyDateKey(monthBounds(month).end);
}

/** The months someone can invoice for today, newest first. */
export function eligibleInvoiceMonths(now = new Date(), count = 12) {
  const current = academyMonthOf(now);
  const newest = isInvoiceMonthOpen(current, now) ? current : shiftMonth(current, -1);
  return Array.from({ length: count }, (_, index) => {
    const month = shiftMonth(newest, -index);
    return { month, label: monthLabel(month) };
  });
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// ---------------------------------------------------------------------------
// The person's invoice details.

export const ACCOUNT_TYPES = ["savings", "current"] as const;

const upper = (value: unknown) => String(value ?? "").trim().toUpperCase();

export const payoutProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(100),
  address: z.string().trim().min(5, "Enter your address").max(400),
  pan: z.preprocess(upper, z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Enter a valid PAN, e.g. ABCDE1234F")),
  nextInvoiceNumber: z
    .string()
    .trim()
    .min(1, "Enter an invoice number")
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9/_.\- ]*$/, "Use letters, numbers, / - _ or ."),
  bankName: z.string().trim().min(2, "Enter your bank's name").max(100),
  accountNumber: z.preprocess(
    (value) => String(value ?? "").replace(/\s+/g, ""),
    z.string().regex(/^\d{9,18}$/, "Account number should be 9 to 18 digits")
  ),
  branchName: z.string().trim().min(2, "Enter the branch").max(100),
  ifsc: z.preprocess(upper, z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC, e.g. SBIN0001234")),
  accountType: z.enum(ACCOUNT_TYPES, { errorMap: () => ({ message: "Choose savings or current" }) }),
});
export type PayoutProfileInput = z.infer<typeof payoutProfileSchema>;

export const manualLineSchema = z.object({
  description: z.string().trim().min(2, "Describe each extra item").max(200),
  quantity: z.number().positive("Quantity must be more than zero").max(10_000),
  /** Paise. */
  rate: z.number().min(0).max(100_000_000),
});

export const ACCOUNT_TYPE_LABELS: Record<(typeof ACCOUNT_TYPES)[number], string> = {
  savings: "Savings",
  current: "Current",
};

/** "INR 12,500.00", the way the PDF prints money (its fonts have no rupee sign). */
export function invoiceMoney(paise: number) {
  return `INR ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((Number(paise) || 0) / 100)}`;
}

export function hoursLabel(minutes: number) {
  const hours = (Number(minutes) || 0) / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}
