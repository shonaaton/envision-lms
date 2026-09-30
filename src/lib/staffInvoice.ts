import { z } from "zod";

import { ACADEMY_DEFAULTS } from "@/lib/branding";
import type { PayEvent } from "@/lib/coachPay";
import { formatHours } from "@/lib/hours";
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

export type InvoiceLineGroup = "class" | "demo" | "bonus" | "monthly" | "manual";
export type InvoiceRateSource = "academy" | "manual";
export type InvoiceLineKind = PayEvent["kind"] | "manual";
/** How a line's rate reads: per class, per hour, or a month's fixed amount. */
export type InvoiceRateUnit = "per_class" | "per_hour" | "per_month";

export type DraftSession = { classroomId: string; sessionId: string; date: string };

/** One row of the invoice, calculated from the academy's rates. */
export type DraftGroup = {
  key: string;
  group: Exclude<InvoiceLineGroup, "manual">;
  kind: PayEvent["kind"];
  classroomId: string;
  title: string;
  batchName: string;
  level: string;
  quantity: number;
  minutes: number;
  unit: InvoiceRateUnit;
  rate: number;
  amount: number;
  /** Extra line under the title, e.g. what a monthly amount covers. */
  note: string;
  sessions: DraftSession[];
};

/** Classes the academy has not priced yet. The invoice waits for them. */
export type MissingRate = { key: string; title: string; kind: PayEvent["kind"]; count: number; dates: string[] };

export type InvoiceDraftGroups = {
  groups: DraftGroup[];
  /** Classes waiting on an admin's no-show ruling: not billable yet. */
  pending: { count: number; amount: number };
  missing: MissingRate[];
};

export const KIND_LABELS: Record<PayEvent["kind"], string> = {
  regular: "Regular classes",
  substitute: "Substitution classes",
  demo: "Demo classes",
  demoConversionBonus: "Demo conversion incentive",
  monthly: "Fixed monthly pay",
};

export const RATE_UNIT_SUFFIX: Record<InvoiceRateUnit, string> = {
  per_class: "/class",
  per_hour: "/hour",
  per_month: "/month",
};

function sessionOf(event: PayEvent): DraftSession[] {
  return event.sessionId ? [{ classroomId: event.classroomId, sessionId: event.sessionId, date: new Date(event.date).toISOString() }] : [];
}

function groupOf(event: PayEvent): DraftGroup["group"] {
  // Every class in a demo classroom is a demo line, even one a substitute taught -
  // a demo classroom never gets an invoice row of its own.
  if (event.kind === "demoConversionBonus") return "bonus";
  if (event.kind === "demo" || event.isDemoClass) return "demo";
  return event.kind === "monthly" ? "monthly" : "class";
}

const DEMO_LINE = {
  open: { base: "demo", title: "Demo classes", note: "Trial classes taken this month" },
  converted: { base: "demo:converted", title: "Converted demo classes", note: "Trial classes whose student has enrolled" },
};

function demoLine(event: PayEvent) {
  return event.demoConverted ? DEMO_LINE.converted : DEMO_LINE.open;
}


/**
 * Turns a month of pay events into invoice rows, all priced by the academy:
 *
 * - per-class and per-hour coaches: one row per batch and type of class at one
 *   rate ("5 classes x INR 600", or "3.8 hours x INR 400/hour"); demos across
 *   all demo classrooms are one row, conversion incentives another;
 * - monthly coaches: one row for the month, noting the classes it covers.
 *
 * Classes the academy has not priced are listed in `missing` and are never
 * billed at a guessed number - the invoice waits for an admin to set them.
 * Pending no-shows are counted but not billed; declined ones are left out.
 */
export function groupInvoiceLines(events: PayEvent[]): InvoiceDraftGroups {
  const pending = { count: 0, amount: 0 };
  const covered = { count: 0, minutes: 0 };
  const rows = new Map<string, DraftGroup>();
  const missing = new Map<string, MissingRate>();

  for (const event of events) {
    if (event.status === "pending_review") {
      pending.count += 1;
      pending.amount += event.exposure;
      continue;
    }
    if (event.status === "declined") continue;
    const group = groupOf(event);
    const base = group === "class" ? `${event.kind}:${event.classroomId}` : group === "demo" ? demoLine(event).base : group;

    if (event.status === "unpriced") {
      const key = base;
      const entry = missing.get(key) || {
        key,
        title: group === "class" ? event.classroomTitle : group === "monthly" ? "Fixed monthly pay" : group === "demo" ? demoLine(event).title : KIND_LABELS[event.kind],
        kind: group === "demo" ? "demo" : event.kind,
        count: 0,
        dates: [],
      };
      entry.count += 1;
      entry.dates.push(new Date(event.date).toISOString());
      missing.set(key, entry);
      continue;
    }
    if (event.status !== "payable") continue;

    if (event.coveredByMonthly) {
      covered.count += 1;
      covered.minutes += event.minutes;
      continue;
    }

    const unit: InvoiceRateUnit = group === "monthly" ? "per_month" : event.unit === "per_hour" ? "per_hour" : "per_class";
    const rate = unit === "per_hour" ? event.rateAmount : event.amount;
    const key = `${base}:${unit}:${rate}`;
    const row = rows.get(key) || {
      key,
      group,
      kind: group === "demo" ? "demo" : event.kind,
      classroomId: group === "class" ? event.classroomId : "",
      title: group === "class" || group === "monthly" ? event.classroomTitle : group === "demo" ? demoLine(event).title : KIND_LABELS[event.kind],
      batchName: group === "class" ? event.batchName : "",
      level: group === "class" ? event.level || "" : "",
      quantity: 0,
      minutes: 0,
      unit,
      rate,
      amount: 0,
      note: group === "demo" ? demoLine(event).note : "",
      sessions: [],
    };
    row.quantity += 1;
    row.minutes += event.minutes;
    row.amount += event.amount;
    row.sessions.push(...sessionOf(event));
    rows.set(key, row);
  }

  const groups = Array.from(rows.values());
  for (const row of groups) {
    if (row.unit === "per_hour") {
      row.note = `${row.quantity} class${row.quantity === 1 ? "" : "es"} - ${formatHours(row.minutes)} hours at the hourly rate`;
    }
  }
  const monthly = groups.find((row) => row.group === "monthly");
  if (monthly) {
    monthly.note = covered.count
      ? `Covers ${covered.count} class${covered.count === 1 ? "" : "es"} (${formatHours(covered.minutes)} hours) taken this month`
      : "Fixed amount for the month";
    monthly.minutes = covered.minutes;
  }

  const order: Record<DraftGroup["group"], number> = { monthly: 0, class: 1, demo: 2, bonus: 3 };
  groups.sort(
    (a, b) =>
      order[a.group] - order[b.group] ||
      Number(a.key.startsWith(DEMO_LINE.converted.base)) - Number(b.key.startsWith(DEMO_LINE.converted.base)) ||
      a.title.localeCompare(b.title) || a.kind.localeCompare(b.kind) || a.rate - b.rate
  );
  return { groups, pending, missing: Array.from(missing.values()).sort((a, b) => a.title.localeCompare(b.title)) };
}

export type ManualLineInput = { description: string; quantity: number; rate: number };

export type InvoiceLine = {
  group: InvoiceLineGroup;
  kind: InvoiceLineKind;
  classroomId: string;
  title: string;
  batchName: string;
  level: string;
  quantity: number;
  minutes: number;
  unit: InvoiceRateUnit;
  rate: number;
  amount: number;
  note: string;
  rateSource: InvoiceRateSource;
  sessions: DraftSession[];
};

/** The finished lines: the academy-priced rows, then the person's other items. */
export function buildInvoiceLines(groups: DraftGroup[], manual: ManualLineInput[]) {
  const lines: InvoiceLine[] = groups.map((group) => ({
    group: group.group,
    kind: group.kind,
    classroomId: group.classroomId,
    title: group.title,
    batchName: group.batchName,
    level: group.level,
    quantity: group.quantity,
    minutes: group.minutes,
    unit: group.unit,
    rate: group.rate,
    amount: group.amount,
    note: group.note,
    rateSource: "academy",
    sessions: group.sessions,
  }));
  for (const item of manual) {
    lines.push({
      group: "manual",
      kind: "manual",
      classroomId: "",
      title: item.description.trim(),
      batchName: "",
      level: "",
      quantity: item.quantity,
      minutes: 0,
      unit: "per_class",
      rate: Math.round(item.rate),
      amount: Math.round(item.quantity * item.rate),
      note: "",
      rateSource: "manual",
      sessions: [],
    });
  }
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return { lines, total };
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
  return formatHours(minutes);
}
