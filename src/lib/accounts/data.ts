import "server-only";

import { dbConnect } from "@/lib/db";
import { academyMonthOf, monthBounds } from "@/lib/feedback/feedbackCycleDates";
import { isGstInvoice, joinedAt, leftAt } from "@/lib/feesMetrics";
import { financialYearOf, resolvePayPeriod } from "@/lib/payPeriods";
import { loadCoachPay } from "@/lib/coachPayData";
import { PAYROLL_CATEGORIES, accountCategory } from "@/lib/accounts/categories";
import {
  ACCOUNTS_START_MONTH,
  PORTAL_TEACHER_COST_FROM,
  computeAccounts,
  emptyMonthInputs,
  monthsBetween,
  runningSurplus,
  type AccountsReport,
  type MonthInputs,
} from "@/lib/accounts/metrics";
import { AccountEntry, BankTransaction } from "@/models/Accounts";
// Registered for the staff invoice populate (a staff member's named role).
import "@/models/AccessRole";
import { Invoice } from "@/models/Fee";
import { Payment } from "@/models/Payment";
import { StaffInvoice } from "@/models/StaffInvoice";
import { StudentPause } from "@/models/StudentPause";
import { User } from "@/models/User";

/**
 * Everything the Accounts dashboard reads, gathered per academy month and
 * handed to the pure `computeAccounts`. Portal records (invoices, payments,
 * staff invoices) are read where they live and never copied into the ledger,
 * so the books can never drift from Fees or Coach Pay.
 */

function idOf(value: any) {
  return String(value?._id || value || "");
}

export type AccountsRange = { from: string; to: string; label: string; fyStart: number | null };

/** The months a financial year covers, clipped to when the books start and to this month. */
export function accountsRangeForFy(fyStart: number, now = new Date()): AccountsRange {
  const current = academyMonthOf(now);
  const from = `${fyStart}-04` < ACCOUNTS_START_MONTH ? ACCOUNTS_START_MONTH : `${fyStart}-04`;
  const fyEnd = `${fyStart + 1}-03`;
  const to = fyEnd < current ? fyEnd : current;
  return { from, to: to < from ? from : to, label: `FY ${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`, fyStart };
}

export function accountsFyOptions(now = new Date()) {
  const first = Number(ACCOUNTS_START_MONTH.slice(0, 4));
  const current = financialYearOf(now);
  const out: number[] = [];
  for (let year = current; year >= first; year -= 1) out.push(year);
  return out;
}

function rangeBounds(range: AccountsRange) {
  return { start: monthBounds(range.from).start, end: monthBounds(range.to).end };
}

function bump(record: Record<string, number>, key: string, amount: number) {
  record[key] = (record[key] || 0) + amount;
}

export type TeacherGap = { month: string; coachId: string; coachName: string; amount: number; unpriced: number };

/**
 * Coach pay the portal knows about, per month: staff invoices raised, and pay
 * Coach Pay says was earned by people who have not invoiced yet. One Coach Pay
 * run covers the whole window rather than one per month - it is the heaviest
 * read in the portal.
 */
async function portalTeacherCost(months: string[]) {
  const portalMonths = months.filter((month) => month >= PORTAL_TEACHER_COST_FROM);
  const invoiced: Record<string, number> = {};
  const staffInvoiced: Record<string, Record<string, number>> = {};
  const notInvoiced: Record<string, number> = {};
  const gaps: TeacherGap[] = [];
  if (!portalMonths.length) return { invoiced, staffInvoiced, notInvoiced, gaps };

  // Staff invoices are raised by admin and sales staff too, not only coaches:
  // each lands in the cost line for the person's job.
  const invoices: any[] = await StaffInvoice.find({ month: { $in: portalMonths } })
    .select("staff month total")
    .populate({ path: "staff", select: "role accessRole", populate: { path: "accessRole", select: "name" } })
    .lean();
  const invoicedBy = new Set<string>();
  for (const invoice of invoices) {
    const total = Number(invoice.total || 0);
    const staff = invoice.staff || {};
    if (staff.role === "instructor" || !staff.role) bump(invoiced, invoice.month, total);
    else {
      const category = /sales/i.test(staff.accessRole?.name || "") ? "sales_salaries" : "staff_salaries";
      staffInvoiced[invoice.month] = staffInvoiced[invoice.month] || {};
      bump(staffInvoiced[invoice.month], category, total);
    }
    invoicedBy.add(`${invoice.month}:${idOf(invoice.staff)}`);
  }

  // A month preset stretched over the whole window: one Coach Pay run instead
  // of one per month.
  const period = {
    ...resolvePayPeriod({ period: "month", month: portalMonths[0] }),
    from: monthBounds(portalMonths[0]).start,
    to: monthBounds(portalMonths[portalMonths.length - 1]).end,
  };

  try {
    const pay = await loadCoachPay(period);
    const earned = new Map<string, TeacherGap>();
    // The running month is not invoiced yet by design, and a monthly plan's
    // whole salary is dated at its end - estimating it would book October's
    // full pay on the 7th.
    const running = academyMonthOf(new Date());
    // Someone paid without raising an invoice: the payment booked against them
    // for that month is the cost, and replaces the estimate.
    const paidDirectly = new Set(
      (
        (await AccountEntry.find({ voidedAt: null, staff: { $ne: null }, category: { $in: [...PAYROLL_CATEGORIES, "staff_invoice_paid"] }, month: { $in: portalMonths } })
          .select("staff month")
          .lean()) as any[]
      ).map((entry) => `${entry.month}:${idOf(entry.staff)}`)
    );
    for (const event of pay.events) {
      const month = academyMonthOf(event.date);
      if (!portalMonths.includes(month) || month >= running) continue;
      const key = `${month}:${event.coachId}`;
      if (invoicedBy.has(key) || paidDirectly.has(key)) continue;
      const row = earned.get(key) || { month, coachId: event.coachId, coachName: event.coachName, amount: 0, unpriced: 0 };
      if (event.status === "payable") row.amount += Number(event.amount || 0);
      if (event.status === "unpriced") row.unpriced += 1;
      earned.set(key, row);
    }
    // Each estimate goes to the cost line for the person's job, like their invoice would.
    const people: any[] = await User.find({ _id: { $in: Array.from(new Set(Array.from(earned.values()).map((row) => row.coachId))) } })
      .select("role accessRole")
      .populate("accessRole", "name")
      .lean();
    const jobOf = new Map(people.map((person) => [idOf(person._id), person.role === "instructor" ? "teacher_pay" : /sales/i.test(person.accessRole?.name || "") ? "sales_salaries" : "staff_salaries"]));
    for (const row of earned.values()) {
      if (row.amount <= 0 && row.unpriced <= 0) continue;
      const job = jobOf.get(row.coachId) || "teacher_pay";
      if (job === "teacher_pay") bump(notInvoiced, row.month, row.amount);
      else {
        staffInvoiced[row.month] = staffInvoiced[row.month] || {};
        bump(staffInvoiced[row.month], job, row.amount);
      }
      gaps.push(row);
    }
  } catch (error) {
    // Coach Pay failing must not take the books down with it; the invoiced
    // figure still stands and the gap panel says the estimate is missing.
    console.error("[accounts] coach pay estimate failed", error);
  }
  gaps.sort((a, b) => (a.month === b.month ? b.amount - a.amount : a.month < b.month ? -1 : 1));
  return { invoiced, staffInvoiced, notInvoiced, gaps };
}

async function portalRevenue(range: AccountsRange) {
  const { start, end } = rangeBounds(range);
  const [invoices, payments, refunds]: [any[], any[], any[]] = await Promise.all([
    Invoice.find({ status: "paid", paidAt: { $gte: start, $lte: end } })
      .select("student paidAt totalAmount gstAmount gstPercentage invoiceMode")
      .lean(),
    // Razorpay payments for an enrolment, booking or tournament never become
    // invoices, so the Fees dashboard misses them. Invoice payments are
    // already counted through the invoice itself.
    Payment.find({ status: "paid", purpose: { $ne: "invoice" }, paidAt: { $gte: start, $lte: end } })
      .select("user paidAt amount")
      .lean(),
    // A refund only flips the payment's status; when it flipped is the best
    // date there is.
    Payment.find({ status: "refunded", updatedAt: { $gte: start, $lte: end } })
      .select("user updatedAt amount")
      .lean(),
  ]);
  return { invoices, payments, refunds };
}

/**
 * Student fees that reached the bank beyond what the portal shows as paid
 * into it, per month - fees from students who left without ever being billed
 * in the portal (user, 2026-10-07: all fees go to HDFC or cash).
 *
 * Worked out on a running total from the start of the books, because the
 * portal's payment dates often trail the bank (bills back-filled weeks later):
 * a later month where the portal shows more than the bank gives back an
 * earlier month's surplus instead of being ignored. Only months with a bank
 * statement count. The result can be negative for a month; it never takes the
 * running total below zero.
 */
export async function bankFeesNotInPortal(lastMonth: string) {
  const allMonths = monthsBetween(ACCOUNTS_START_MONTH, lastMonth);
  const start = monthBounds(allMonths[0]).start;
  const end = monthBounds(lastMonth).end;
  const [receipts, statementMonths, invoices, cashFees]: any[][] = await Promise.all([
    BankTransaction.aggregate([{ $match: { feeReceipt: true, date: { $gte: start, $lte: end } } }, { $group: { _id: "$month", total: { $sum: "$credit" } } }]),
    BankTransaction.distinct("month", { date: { $gte: start, $lte: end } }),
    Invoice.find({ status: "paid", paidAt: { $gte: start, $lte: end } }).select("paidAt totalAmount paymentTransactions.mode").lean(),
    AccountEntry.find({ voidedAt: null, category: "portal_cash_fee" }).select("invoices").lean(),
  ]);
  const paidInCash = new Set(cashFees.flatMap((entry: any) => (entry.invoices || []).map(idOf)));
  const portalBank: Record<string, number> = {};
  for (const invoice of invoices) {
    const cash = paidInCash.has(idOf(invoice._id)) || (invoice.paymentTransactions || []).some((transaction: any) => transaction.mode === "cash");
    if (cash) continue;
    bump(portalBank, academyMonthOf(new Date(invoice.paidAt)), Number(invoice.totalAmount || 0));
  }
  const bank = new Map(receipts.map((row: any) => [row._id, Number(row.total || 0)]));
  const covered = new Set(statementMonths);
  const rows = allMonths.filter((month) => covered.has(month)).map((month) => ({ month, bank: Number(bank.get(month) || 0), portal: portalBank[month] || 0 }));
  const surplus = runningSurplus(rows);
  const out: Record<string, { bank: number; portal: number; notInPortal: number }> = {};
  for (const row of rows) out[row.month] = { ...row, notInPortal: surplus[row.month] };
  return out;
}

async function studentCounts(months: string[]) {
  const [students, pauses, firstPaid]: [any[], any[], any[]] = await Promise.all([
    User.find({ role: "student", accountStatus: { $ne: "demo" } })
      .select("createdAt updatedAt isActive deactivatedAt conversionSetup.convertedAt")
      .lean(),
    StudentPause.find({ status: { $ne: "cancelled" } }).select("student pausedFrom pausedUntil resumedAt status").lean(),
    // Students were added to the portal in Aug 2026 with their fee history
    // back-dated, so the account date is not when they joined: the first fee
    // they paid is the better date when it is earlier.
    Invoice.aggregate([{ $match: { status: "paid", paidAt: { $ne: null } } }, { $group: { _id: "$student", at: { $min: "$paidAt" } } }]),
  ]);
  const firstFee = new Map(firstPaid.map((row: any) => [idOf(row._id), new Date(row.at)]));

  const pausesByStudent = new Map<string, { from: Date; to: Date }[]>();
  for (const pause of pauses) {
    const to = pause.status === "resumed" && pause.resumedAt ? new Date(pause.resumedAt) : new Date(pause.pausedUntil);
    const list = pausesByStudent.get(idOf(pause.student)) || [];
    list.push({ from: new Date(pause.pausedFrom), to });
    pausesByStudent.set(idOf(pause.student), list);
  }

  const counts: Record<string, { active: Set<string>; new: number; left: number }> = {};
  for (const month of months) {
    const { start, end } = monthBounds(month);
    const active = new Set<string>();
    let joined = 0;
    let left = 0;
    for (const student of students) {
      const fee = firstFee.get(idOf(student._id));
      const account = joinedAt(student);
      const joinDate = fee && fee < account ? fee : account;
      const leaveDate = student.isActive === false ? leftAt(student) : null;
      if (joinDate >= start && joinDate <= end) joined += 1;
      if (leaveDate && leaveDate >= start && leaveDate <= end) left += 1;
      if (joinDate > end) continue;
      if (leaveDate && leaveDate < start) continue;
      // On a break for the whole month: enrolled, but not someone the month's
      // costs were spent on.
      const pausedAll = (pausesByStudent.get(idOf(student._id)) || []).some((pause) => pause.from <= start && pause.to >= end);
      if (pausedAll) continue;
      active.add(idOf(student._id));
    }
    counts[month] = { active, new: joined, left };
  }
  return counts;
}

export type AccountsData = {
  range: AccountsRange;
  months: string[];
  report: AccountsReport;
  teacherGaps: TeacherGap[];
  gaps: {
    /** Months before portal coach pay with no teacher pay entered. */
    missingTeacherMonths: string[];
    /** Portal months that also have teacher pay typed into the ledger - counted on top of the staff invoices. */
    handTeacherInPortalMonths: { month: string; amount: number }[];
    /** Months with no bank statement rows at all. */
    monthsWithoutStatement: string[];
    unclassifiedBankRows: number;
    unclassifiedByMonth: Record<string, number>;
  };
};

export async function loadAccounts(range: AccountsRange): Promise<AccountsData> {
  await dbConnect();
  const months = monthsBetween(range.from, range.to);
  const { start, end } = rangeBounds(range);

  const [revenue, entries, teacher, students, bankByMonth, feeGap] = await Promise.all([
    portalRevenue(range),
    AccountEntry.find({ month: { $in: months }, voidedAt: null }).select("kind category month amount gstAmount tdsAmount student staff").lean() as Promise<any[]>,
    portalTeacherCost(months),
    studentCounts(months),
    BankTransaction.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: { _id: { month: "$month", status: "$status" }, count: { $sum: 1 } } },
    ]) as Promise<any[]>,
    bankFeesNotInPortal(range.to),
  ]);

  const inputs = new Map<string, MonthInputs>(months.map((month) => [month, emptyMonthInputs(month)]));
  const payers = new Map<string, Set<string>>(months.map((month) => [month, new Set<string>()]));

  for (const invoice of revenue.invoices) {
    const month = academyMonthOf(new Date(invoice.paidAt));
    const input = inputs.get(month);
    if (!input) continue;
    const total = Number(invoice.totalAmount || 0);
    if (isGstInvoice(invoice)) {
      input.portalGstGross += total;
      input.portalGstTax += Number(invoice.gstAmount || 0);
    } else {
      input.portalNonGst += total;
    }
    if (invoice.student) payers.get(month)!.add(idOf(invoice.student));
  }
  for (const payment of revenue.payments) {
    const input = inputs.get(academyMonthOf(new Date(payment.paidAt)));
    if (!input) continue;
    input.portalOtherPayments += Number(payment.amount || 0);
  }
  for (const refund of revenue.refunds) {
    const input = inputs.get(academyMonthOf(new Date(refund.updatedAt)));
    if (!input) continue;
    input.refunds += Number(refund.amount || 0);
  }

  for (const entry of entries) {
    const input = inputs.get(entry.month);
    if (!input) continue;
    const amount = Number(entry.amount || 0);
    const kind = accountCategory(entry.category)?.kind || entry.kind;
    if (kind === "income") {
      bump(input.ledgerIncome, entry.category, amount);
      input.ledgerIncomeGst += Number(entry.gstAmount || 0);
      if (entry.category === "offline_fees" && entry.student) payers.get(entry.month)!.add(idOf(entry.student));
    } else if (kind === "expense") {
      bump(input.ledgerExpense, entry.category, amount);
      input.ledgerTds += Number(entry.tdsAmount || 0);
    } else {
      bump(input.ledgerNonPl, entry.category, amount);
    }
  }

  for (const month of months) {
    const input = inputs.get(month)!;
    input.portalTeacherInvoiced = teacher.invoiced[month] || 0;
    input.portalStaffInvoiced = teacher.staffInvoiced[month] || {};
    input.bankFeesNotInPortal = feeGap[month]?.notInPortal || 0;
    input.portalTeacherNotInvoiced = teacher.notInvoiced[month] || 0;
    input.payingStudents = payers.get(month)!.size;
    // Anyone who paid that month was a student that month, whatever the portal's dates say.
    const active = new Set([...(students[month]?.active || []), ...payers.get(month)!]);
    input.activeStudents = active.size;
    input.newStudents = students[month]?.new || 0;
    input.leftStudents = students[month]?.left || 0;
  }

  const report = computeAccounts(months.map((month) => inputs.get(month)!));

  const bankMonths = new Set<string>();
  const unclassifiedByMonth: Record<string, number> = {};
  let unclassifiedBankRows = 0;
  for (const row of bankByMonth) {
    bankMonths.add(row._id.month);
    if (row._id.status === "unclassified") {
      unclassifiedByMonth[row._id.month] = (unclassifiedByMonth[row._id.month] || 0) + row.count;
      unclassifiedBankRows += row.count;
    }
  }

  return {
    range,
    months,
    report,
    teacherGaps: teacher.gaps,
    gaps: {
      missingTeacherMonths: months.filter((month) => month < PORTAL_TEACHER_COST_FROM && !(inputs.get(month)!.ledgerExpense.teacher_pay > 0)),
      // Teacher pay tied to a person replaces their estimate; untied pay in a
      // portal month may double a staff invoice.
      handTeacherInPortalMonths: months
        .filter((month) => month >= PORTAL_TEACHER_COST_FROM)
        .map((month) => ({
          month,
          amount: entries.filter((entry) => entry.month === month && entry.category === "teacher_pay" && !entry.staff).reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
        }))
        .filter((gap) => gap.amount !== 0),
      monthsWithoutStatement: months.filter((month) => !bankMonths.has(month)),
      unclassifiedBankRows,
      unclassifiedByMonth,
    },
  };
}

