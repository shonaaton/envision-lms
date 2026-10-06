/**
 * What a bank statement row probably is. Pure and suggestion-only: nothing
 * here is booked until an admin accepts it on the statement review page.
 *
 * Order matters, most certain first:
 * credits - a portal payment reference, a Razorpay settlement, a manual invoice
 *   payment of the same amount within 3 days, then rules;
 * debits - a coach payout (a staff invoice from September 2026, teacher pay
 *   before), a cost already typed into the ledger, then rules.
 */

import { accountCategory, categoryLabel, isPayrollCategory } from "@/lib/accounts/categories";
import { readLabel } from "@/lib/accounts/labels";
import { PORTAL_TEACHER_COST_FROM, TDS_RATE } from "@/lib/accounts/metrics";

export type SuggestionType = "portal" | "razorpay" | "fee_receipt" | "staff_invoice" | "coach_unmatched" | "ledger" | "category" | "none";

/** Bank credits that are student fees: revenue comes through the portal plus the month's surplus. */
export const FEE_RECEIPT_TYPES = ["portal", "razorpay", "fee_receipt"];

export type Suggestion = {
  type: SuggestionType;
  label: string;
  category?: string;
  invoices?: string[];
  payments?: string[];
  staffInvoice?: string;
  entry?: string;
  staffId?: string;
  /** The month the money is for, when the admin's label says it is not the month it moved. */
  month?: string;
  /** Money going the other way for its category: a cost refunded, a fee paid back. */
  refund?: boolean;
};

export type MatchTransaction = { date: Date; month: string; narration: string; reference: string; debit: number; credit: number; label?: string };

export type MatchContext = {
  /** Lower-cased payment references recorded on portal invoices and payments. */
  portalRefs: Map<string, { invoices: string[]; payments: string[]; label: string }>;
  /** Invoice payments recorded by hand ("Mark paid"), for amount + date matching. */
  manualPayments: { invoiceId: string; amount: number; date: Date; label: string }[];
  rules: { pattern: string; direction: "debit" | "credit"; category: string }[];
  coaches: { staffId: string; name: string; names: string[]; invoices: { id: string; month: string; total: number }[] }[];
  /** Ledger costs typed by hand that no bank row is linked to yet. */
  ledger: { id: string; category: string; amount: number; date: Date; label: string }[];
};

const DAY = 86_400_000;

/** Narration keywords that mean the same thing at every bank. User rules win over these. */
export const DEFAULT_RULES: { pattern: string; direction: "debit" | "credit"; category: string }[] = [
  { pattern: "facebk", direction: "debit", category: "marketing" },
  { pattern: "facebook", direction: "debit", category: "marketing" },
  { pattern: "meta platforms", direction: "debit", category: "marketing" },
  { pattern: "google ads", direction: "debit", category: "marketing" },
  { pattern: "googleads", direction: "debit", category: "marketing" },
  { pattern: "cesc", direction: "debit", category: "electricity" },
  { pattern: "wbsedcl", direction: "debit", category: "electricity" },
  { pattern: "electricity", direction: "debit", category: "electricity" },
  { pattern: "airtel", direction: "debit", category: "internet_phone" },
  { pattern: "jio", direction: "debit", category: "internet_phone" },
  { pattern: "bsnl", direction: "debit", category: "internet_phone" },
  { pattern: "act fibernet", direction: "debit", category: "internet_phone" },
  { pattern: "hostinger", direction: "debit", category: "software" },
  { pattern: "godaddy", direction: "debit", category: "software" },
  { pattern: "zoom", direction: "debit", category: "software" },
  { pattern: "canva", direction: "debit", category: "software" },
  { pattern: "google workspace", direction: "debit", category: "software" },
  { pattern: "gsuite", direction: "debit", category: "software" },
  { pattern: "anthropic", direction: "debit", category: "software" },
  { pattern: "openai", direction: "debit", category: "software" },
  { pattern: "razorpay", direction: "debit", category: "gateway_fees" },
  { pattern: "gst payment", direction: "debit", category: "gst_paid" },
  { pattern: "gstn", direction: "debit", category: "gst_paid" },
  { pattern: "cbdt", direction: "debit", category: "tds_paid" },
  { pattern: "tds", direction: "debit", category: "tds_paid" },
  { pattern: "sms chg", direction: "debit", category: "bank_charges" },
  { pattern: "sms charges", direction: "debit", category: "bank_charges" },
  { pattern: "chrg", direction: "debit", category: "bank_charges" },
  { pattern: "charges", direction: "debit", category: "bank_charges" },
  { pattern: "salary", direction: "debit", category: "staff_salaries" },
  { pattern: "rent", direction: "debit", category: "rent" },
  { pattern: "interest", direction: "credit", category: "other_income" },
];

function normalize(text: string) {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** A rule pattern must appear as whole words: "rent" is not inside "current". */
export function narrationHas(narration: string, pattern: string) {
  const needle = normalize(pattern).trim();
  if (!needle) return false;
  return normalize(narration).includes(` ${needle} `);
}

function close(a: number, b: number, tolerance = 100) {
  return Math.abs(a - b) <= tolerance;
}

function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split("-").map(Number);
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Which coach a payout narration names: full name, or first and last name both present. */
export function coachInNarration(narration: string, coaches: MatchContext["coaches"]) {
  const text = normalize(narration);
  for (const coach of coaches) {
    for (const name of coach.names) {
      const words = normalize(name).trim().split(" ").filter((word) => word.length >= 3);
      if (words.length >= 2 && words.every((word) => text.includes(` ${word} `))) return coach;
      if (words.length === 1 && words[0].length >= 6 && text.includes(` ${words[0]} `)) return coach;
      // Banks split or join names freely: "SAYAN DEB HALDER" is Sayandeb Halder.
      const joined = name.toLowerCase().replace(/[^a-z]/g, "");
      if (joined.length >= 10 && text.replace(/[^a-z]/g, "").includes(joined)) return coach;
    }
  }
  return null;
}

function ruleFor(tx: MatchTransaction, rules: MatchContext["rules"]) {
  const direction = tx.debit ? "debit" : "credit";
  const pool = [...rules, ...DEFAULT_RULES].filter((rule) => rule.direction === direction);
  // Longer patterns are more specific: "razorpay software" beats "razorpay".
  return pool.sort((a, b) => b.pattern.length - a.pattern.length).find((rule) => narrationHas(tx.narration, rule.pattern)) || null;
}

/** A category booking, flagged as a refund when the money runs against the category. */
function booked(tx: MatchTransaction, category: string, month: string | undefined, label?: string): Suggestion {
  const kind = accountCategory(category)?.kind;
  const refund = (tx.credit > 0 && kind === "expense") || (tx.debit > 0 && kind === "income");
  const name = categoryLabel(category);
  return {
    type: "category",
    category,
    label: label || (refund ? `${name} (refund)` : name) + (month ? ` - for ${month}` : ""),
    month,
    refund: refund || undefined,
  };
}

function creditSuggestion(tx: MatchTransaction, context: MatchContext): Suggestion {
  const haystack = `${tx.reference} ${tx.narration}`.toLowerCase();
  for (const [ref, match] of context.portalRefs) {
    if (ref.length >= 6 && haystack.includes(ref)) {
      return { type: "portal", label: `Portal payment ${match.label}`, invoices: match.invoices, payments: match.payments };
    }
  }
  if (narrationHas(tx.narration, "razorpay") || /\brzp\b|razorpay/i.test(tx.narration)) {
    return { type: "razorpay", label: "Razorpay settlement of online fee payments (already counted in the portal)" };
  }
  const nearby = context.manualPayments.filter((payment) => payment.amount === tx.credit && Math.abs(payment.date.getTime() - tx.date.getTime()) <= 3 * DAY);
  const booking = readLabel(tx.label || "", "credit");
  // A student fee is never booked on its own: the portal's paid bills are the
  // revenue, and each month the dashboard adds whatever the bank received
  // beyond them ("bank fees not in the portal"). Google Pay pays out in
  // batches, so fees cannot be matched to bills one by one anyway.
  if (booking?.category === "student_fees" || (!booking && nearby.length)) {
    const label =
      nearby.length === 1
        ? `Student fee - same amount as ${nearby[0].label}`
        : "Student fee - counted through the portal; anything beyond it shows as bank fees not in the portal";
    return { type: "fee_receipt", label, invoices: nearby.length === 1 ? [nearby[0].invoiceId] : undefined };
  }
  if (booking) return booked(tx, booking.category, booking.monthShift ? shiftMonth(tx.month, -1) : undefined);
  const rule = ruleFor(tx, context.rules);
  if (rule) return booked(tx, rule.category, undefined);
  return { type: "none", label: "Not in the portal - a student fee, other income, or owner money?" };
}

function debitSuggestion(tx: MatchTransaction, context: MatchContext): Suggestion {
  const booking = readLabel(tx.label || "", "debit");
  const forMonth = booking?.monthShift ? shiftMonth(tx.month, -1) : undefined;
  const workMonth = forMonth || tx.month;
  const payroll = !booking || isPayrollCategory(booking.category);
  const coach = payroll ? coachInNarration(tx.narration, context.coaches) : null;
  if (coach) {
    // Staff invoices exist from September 2026: a payout for that work settles
    // an invoice already counted, and must not be booked again.
    // A label naming the month ("previous month") pins the invoice to that
    // month: Saptarshi's 8 Sept payment is August's salary and must not settle
    // the September invoice his 3 Oct payment is for.
    const window = forMonth ? [forMonth] : [tx.month, shiftMonth(tx.month, -1), shiftMonth(tx.month, -2)];
    const invoice = coach.invoices.find(
      (item) =>
        item.month >= PORTAL_TEACHER_COST_FROM &&
        window.includes(item.month) &&
        (close(tx.debit, Math.round(item.total * (1 - TDS_RATE))) || close(tx.debit, item.total))
    );
    if (invoice) return { type: "staff_invoice", label: `${coach.name} - staff invoice ${invoice.month}`, staffInvoice: invoice.id, staffId: coach.staffId };
  }
  if (coach && !booking) {
    if (workMonth >= PORTAL_TEACHER_COST_FROM) {
      return { type: "coach_unmatched", label: `Paid to ${coach.name}, but no staff invoice of this amount`, staffId: coach.staffId };
    }
    return { type: "category", category: "teacher_pay", label: `Teacher pay - ${coach.name}`, staffId: coach.staffId };
  }
  // Pay for a portal month with no staff invoice to settle: booked against the
  // person, it replaces Coach Pay's "earned, not invoiced" estimate for them
  // (someone paid without raising an invoice). Without a name to tie it to,
  // it could double the estimate, so it waits for a person to decide.
  if (booking && isPayrollCategory(booking.category) && workMonth >= PORTAL_TEACHER_COST_FROM && !coach) {
    return { type: "coach_unmatched", label: `${categoryLabel(booking.category)} for ${workMonth}: no staff invoice and no portal staff member named in the narration` };
  }

  // A payout to a person leaves the bank at 90%; the ledger holds the gross.
  const amounts = payroll ? [tx.debit, Math.round(tx.debit / (1 - TDS_RATE))] : [tx.debit];
  const typed = context.ledger.filter(
    (entry) =>
      amounts.some((amount) => close(entry.amount, amount, Math.max(100, Math.round(entry.amount * 0.01)))) &&
      Math.abs(entry.date.getTime() - tx.date.getTime()) <= 5 * DAY
  );
  if (typed.length === 1) return { type: "ledger", entry: typed[0].id, category: typed[0].category, label: `Already entered: ${typed[0].label}` };

  if (booking) {
    const suggestion = booked(tx, booking.category, forMonth);
    return coach ? { ...suggestion, staffId: coach.staffId, label: `${suggestion.label} - ${coach.name}` } : suggestion;
  }
  const rule = ruleFor(tx, context.rules);
  if (rule) return booked(tx, rule.category, undefined);
  return { type: "none", label: "Unknown cost - pick a category" };
}

export function suggestFor(tx: MatchTransaction, context: MatchContext): Suggestion {
  return tx.credit ? creditSuggestion(tx, context) : debitSuggestion(tx, context);
}

export function emptyMatchContext(): MatchContext {
  return { portalRefs: new Map(), manualPayments: [], rules: [], coaches: [], ledger: [] };
}
