/**
 * The academy's profit and loss, month by month. Pure: every figure on the
 * Accounts dashboard is computed here from plain numbers, so the rules below
 * are unit-tested rather than trusted.
 *
 * Rulings the user made (2026-10-06):
 * - Revenue is cash received, net of GST. GST collected is owed to the
 *   government and is reported beside revenue, never inside it.
 * - Teacher cost is the gross invoice. 10% of it is withheld as TDS and paid to
 *   the government, so the coach receives 90%; the TDS is a liability until
 *   deposited, not a saving.
 * - Coach pay lives in the portal from September 2026. Before that it is entered
 *   by hand (from the bank statement and the user's own figures).
 * - Per-student figures are shown both per paying and per active student.
 *
 * Amounts are paise.
 */

import { ACCOUNT_CATEGORIES, accountCategory } from "@/lib/accounts/categories";

/** First month whose coach pay comes from portal staff invoices. */
export const PORTAL_TEACHER_COST_FROM = "2026-09";
/** First month the books cover. */
export const ACCOUNTS_START_MONTH = "2026-04";
export const TDS_RATE = 0.1;

export type MonthInputs = {
  month: string;
  /** Paid portal invoices that carried GST: gross received and the GST inside it. */
  portalGstGross: number;
  portalGstTax: number;
  /** Paid portal invoices without GST. */
  portalNonGst: number;
  /** Paid Razorpay payments that never became an invoice (enrolment, booking, tournament). */
  portalOtherPayments: number;
  /** Money refunded to families this month. */
  refunds: number;
  /** Student fees that reached the bank beyond the portal's paid bills (may be negative: a timing give-back). */
  bankFeesNotInPortal: number;
  /** Ledger income, by category key, and the GST inside it. */
  ledgerIncome: Record<string, number>;
  ledgerIncomeGst: number;
  /** Ledger costs, by category key. Pay to people (teachers, staff, sales) is gross. */
  ledgerExpense: Record<string, number>;
  /** TDS withheld from the people paid in the ledger. */
  ledgerTds: number;
  /** Ledger money that is not profit or loss, by category key. */
  ledgerNonPl: Record<string, number>;
  /** Portal staff invoices for the month (gross), and pay earned but not invoiced yet. */
  portalTeacherInvoiced: number;
  /** Portal staff invoices from admin and sales staff, by cost category. */
  portalStaffInvoiced: Record<string, number>;
  portalTeacherNotInvoiced: number;
  activeStudents: number;
  payingStudents: number;
  newStudents: number;
  leftStudents: number;
};

export type PerStudent = { revenue: number | null; cost: number | null; teacherCost: number | null; profit: number | null };

export type MonthAccounts = {
  month: string;
  revenue: {
    gstPortalNet: number;
    nonGstPortal: number;
    otherPortal: number;
    refunds: number;
    offline: number;
    bankNotInPortal: number;
    otherIncome: number;
    total: number;
  };
  gstCollected: number;
  cost: {
    teacher: number;
    teacherPortal: number;
    teacherLedger: number;
    byCategory: Record<string, number>;
    marketing: number;
    fixed: number;
    total: number;
  };
  grossProfit: number;
  grossMargin: number | null;
  netProfit: number;
  netMargin: number | null;
  students: { active: number; paying: number; new: number; left: number };
  perPaying: PerStudent;
  perActive: PerStudent;
  /** Marketing spend per new student that month. */
  cac: number | null;
  /** Paying students needed to cover fixed costs at this month's contribution per student. */
  breakEvenStudents: number | null;
  growth: { revenue: number | null; cost: number | null; profit: number | null; activeStudents: number | null; payingStudents: number | null };
  liabilities: { gstCollected: number; gstPaid: number; tdsWithheld: number; tdsDeposited: number };
  nonPl: Record<string, number>;
  usesPortalTeacherCost: boolean;
};

export type AccountsReport = {
  months: MonthAccounts[];
  total: MonthAccounts;
};

function sum(values: Iterable<number>) {
  let total = 0;
  for (const value of values) total += Number(value) || 0;
  return total;
}

/** One decimal percentage of `part` in `whole`; null when there is no whole to compare to. */
export function percentOf(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/**
 * Month-on-month change. Null when last month was zero, because a percentage
 * of nothing tells the reader nothing. A negative base (last month was a loss)
 * is measured against its size, so a smaller loss reads as an improvement.
 */
export function growthOf(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function perHead(amount: number, students: number): number | null {
  return students > 0 ? Math.round(amount / students) : null;
}

function perStudent(students: number, revenue: number, cost: number, teacherCost: number): PerStudent {
  return {
    revenue: perHead(revenue, students),
    cost: perHead(cost, students),
    teacherCost: perHead(teacherCost, students),
    profit: perHead(revenue - cost, students),
  };
}

export function usesPortalTeacherCost(month: string) {
  return month >= PORTAL_TEACHER_COST_FROM;
}

/** TDS withheld on a gross coach payment. */
export function tdsOn(gross: number) {
  return Math.round(gross * TDS_RATE);
}

/** A coach was paid `net` after 10% TDS: the gross invoice it settles. */
export function grossFromNetPayout(net: number) {
  return Math.round(net / (1 - TDS_RATE));
}

function addInto(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] || 0) + (Number(value) || 0);
}

function computeMonth(input: MonthInputs, previous: MonthAccounts | null): MonthAccounts {
  const portal = usesPortalTeacherCost(input.month);
  const gstPortalNet = input.portalGstGross - input.portalGstTax;
  const offline = (input.ledgerIncome.offline_fees || 0) - input.ledgerIncomeGst;
  // Refunds to students are stored as negative income; the P&L shows them as one refunds line.
  const refunds = input.refunds - (input.ledgerIncome.student_refunds || 0);
  const otherIncome = sum(
    Object.entries(input.ledgerIncome)
      .filter(([key]) => key !== "offline_fees" && key !== "student_refunds")
      .map(([, value]) => value)
  );
  // GST paid for the month is the least output GST the academy declared (input
  // credit only lowers it). Paid beyond the portal's GST bills, it is GST on
  // fees the portal never billed - the bank fees not in the portal - so it
  // comes out of them rather than staying inside revenue.
  const gstOnUnbilled = Math.min(
    Math.max(0, (input.ledgerNonPl.gst_paid || 0) - input.portalGstTax - input.ledgerIncomeGst),
    Math.max(0, input.bankFeesNotInPortal)
  );
  const bankNotInPortal = input.bankFeesNotInPortal - gstOnUnbilled;
  const revenueTotal = gstPortalNet + input.portalNonGst + input.portalOtherPayments - refunds + offline + bankNotInPortal + otherIncome;

  // Portal staff invoices only count from September 2026, so a stray early
  // invoice cannot double a month that was already entered by hand.
  const teacherPortal = portal ? input.portalTeacherInvoiced + input.portalTeacherNotInvoiced : 0;
  const teacherLedger = input.ledgerExpense.teacher_pay || 0;
  const teacher = teacherPortal + teacherLedger;

  const byCategory: Record<string, number> = {};
  for (const category of ACCOUNT_CATEGORIES) {
    if (category.kind === "expense") byCategory[category.key] = 0;
  }
  addInto(byCategory, input.ledgerExpense);
  const staffPortal = portal ? sum(Object.values(input.portalStaffInvoiced)) : 0;
  if (portal) addInto(byCategory, input.portalStaffInvoiced);
  byCategory.teacher_pay = teacher;
  const costTotal = sum(Object.values(byCategory));
  const fixed = sum(
    Object.entries(byCategory)
      .filter(([key]) => accountCategory(key)?.fixed)
      .map(([, value]) => value)
  );
  const marketing = byCategory.marketing || 0;

  const grossProfit = revenueTotal - teacher;
  const netProfit = revenueTotal - costTotal;
  const contribution = input.payingStudents > 0 ? (revenueTotal - (costTotal - fixed)) / input.payingStudents : 0;

  const gstCollected = input.portalGstTax + input.ledgerIncomeGst + gstOnUnbilled;
  const tdsWithheld = (portal ? tdsOn(teacherPortal) + tdsOn(staffPortal) : 0) + input.ledgerTds;

  return {
    month: input.month,
    revenue: {
      gstPortalNet,
      nonGstPortal: input.portalNonGst,
      otherPortal: input.portalOtherPayments,
      refunds,
      offline,
      bankNotInPortal,
      otherIncome,
      total: revenueTotal,
    },
    gstCollected,
    cost: { teacher, teacherPortal, teacherLedger, byCategory, marketing, fixed, total: costTotal },
    grossProfit,
    grossMargin: percentOf(grossProfit, revenueTotal),
    netProfit,
    netMargin: percentOf(netProfit, revenueTotal),
    students: { active: input.activeStudents, paying: input.payingStudents, new: input.newStudents, left: input.leftStudents },
    perPaying: perStudent(input.payingStudents, revenueTotal, costTotal, teacher),
    perActive: perStudent(input.activeStudents, revenueTotal, costTotal, teacher),
    cac: input.newStudents > 0 ? Math.round(marketing / input.newStudents) : null,
    breakEvenStudents: contribution > 0 && fixed > 0 ? Math.ceil(fixed / contribution) : null,
    growth: {
      revenue: growthOf(revenueTotal, previous?.revenue.total),
      cost: growthOf(costTotal, previous?.cost.total),
      profit: growthOf(netProfit, previous?.netProfit),
      activeStudents: growthOf(input.activeStudents, previous?.students.active),
      payingStudents: growthOf(input.payingStudents, previous?.students.paying),
    },
    liabilities: {
      gstCollected,
      gstPaid: input.ledgerNonPl.gst_paid || 0,
      tdsWithheld,
      tdsDeposited: input.ledgerNonPl.tds_paid || 0,
    },
    nonPl: { ...input.ledgerNonPl },
    usesPortalTeacherCost: portal,
  };
}

/**
 * The period's total. Money adds up; student counts do not (the same child is
 * active in every month), so the total row carries the monthly average and
 * per-student figures are per student per month.
 */
function computeTotal(months: MonthAccounts[]): MonthAccounts {
  const count = months.length || 1;
  const add = (pick: (month: MonthAccounts) => number) => sum(months.map(pick));
  const byCategory: Record<string, number> = {};
  const nonPl: Record<string, number> = {};
  for (const month of months) {
    addInto(byCategory, month.cost.byCategory);
    addInto(nonPl, month.nonPl);
  }
  const revenueTotal = add((m) => m.revenue.total);
  const costTotal = add((m) => m.cost.total);
  const teacher = add((m) => m.cost.teacher);
  const grossProfit = revenueTotal - teacher;
  const netProfit = revenueTotal - costTotal;
  const payingMonths = add((m) => m.students.paying);
  const activeMonths = add((m) => m.students.active);
  const newStudents = add((m) => m.students.new);
  const marketing = add((m) => m.cost.marketing);
  const fixed = add((m) => m.cost.fixed);
  const contribution = payingMonths > 0 ? (revenueTotal - (costTotal - fixed)) / payingMonths : 0;
  return {
    month: "total",
    revenue: {
      gstPortalNet: add((m) => m.revenue.gstPortalNet),
      nonGstPortal: add((m) => m.revenue.nonGstPortal),
      otherPortal: add((m) => m.revenue.otherPortal),
      refunds: add((m) => m.revenue.refunds),
      offline: add((m) => m.revenue.offline),
      bankNotInPortal: add((m) => m.revenue.bankNotInPortal),
      otherIncome: add((m) => m.revenue.otherIncome),
      total: revenueTotal,
    },
    gstCollected: add((m) => m.gstCollected),
    cost: {
      teacher,
      teacherPortal: add((m) => m.cost.teacherPortal),
      teacherLedger: add((m) => m.cost.teacherLedger),
      byCategory,
      marketing,
      fixed,
      total: costTotal,
    },
    grossProfit,
    grossMargin: percentOf(grossProfit, revenueTotal),
    netProfit,
    netMargin: percentOf(netProfit, revenueTotal),
    students: {
      active: Math.round(activeMonths / count),
      paying: Math.round(payingMonths / count),
      new: newStudents,
      left: add((m) => m.students.left),
    },
    perPaying: perStudent(payingMonths, revenueTotal, costTotal, teacher),
    perActive: perStudent(activeMonths, revenueTotal, costTotal, teacher),
    cac: newStudents > 0 ? Math.round(marketing / newStudents) : null,
    breakEvenStudents: contribution > 0 && fixed > 0 ? Math.ceil(fixed / count / contribution) : null,
    growth: { revenue: null, cost: null, profit: null, activeStudents: null, payingStudents: null },
    liabilities: {
      gstCollected: add((m) => m.liabilities.gstCollected),
      gstPaid: add((m) => m.liabilities.gstPaid),
      tdsWithheld: add((m) => m.liabilities.tdsWithheld),
      tdsDeposited: add((m) => m.liabilities.tdsDeposited),
    },
    nonPl,
    usesPortalTeacherCost: months.some((m) => m.usesPortalTeacherCost),
  };
}

/** Months must be in calendar order; each is compared with the one before it. */
export function computeAccounts(inputs: MonthInputs[]): AccountsReport {
  const months: MonthAccounts[] = [];
  for (const input of inputs) months.push(computeMonth(input, months[months.length - 1] || null));
  return { months, total: computeTotal(months) };
}

export function emptyMonthInputs(month: string): MonthInputs {
  return {
    month,
    portalGstGross: 0,
    portalGstTax: 0,
    portalNonGst: 0,
    portalOtherPayments: 0,
    refunds: 0,
    bankFeesNotInPortal: 0,
    ledgerIncome: {},
    ledgerIncomeGst: 0,
    ledgerExpense: {},
    ledgerTds: 0,
    ledgerNonPl: {},
    portalTeacherInvoiced: 0,
    portalStaffInvoiced: {},
    portalTeacherNotInvoiced: 0,
    activeStudents: 0,
    payingStudents: 0,
    newStudents: 0,
    leftStudents: 0,
  };
}

/** "YYYY-MM" keys from `from` to `to` inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [year, month] = from.split("-").map(Number);
  const [endYear, endMonth] = to.split("-").map(Number);
  while (out.length < 240 && (year < endYear || (year === endYear && month <= endMonth))) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

/**
 * Bank fee receipts beyond the portal's paid bills, month by month, on a
 * running total that never drops below zero: a later month where the portal
 * shows more than the bank gives back an earlier surplus (the portal's payment
 * dates trail the bank) instead of being ignored or double-counted.
 */
export function runningSurplus(rows: { month: string; bank: number; portal: number }[]) {
  const out: Record<string, number> = {};
  let running = 0;
  for (const row of rows) {
    const before = Math.max(0, running);
    running += row.bank - row.portal;
    out[row.month] = Math.max(0, running) - before;
  }
  return out;
}
