import "server-only";

import { dbConnect } from "@/lib/db";
import { monthBounds } from "@/lib/feedback/feedbackCycleDates";
import { isGstInvoice } from "@/lib/feesMetrics";
import { accountCategory } from "@/lib/accounts/categories";
import { bankFeesNotInPortal, loadAccounts } from "@/lib/accounts/data";
import { PORTAL_TEACHER_COST_FROM } from "@/lib/accounts/metrics";
import { AccountEntry, BankTransaction } from "@/models/Accounts";
import "@/models/AccessRole";
import { Invoice } from "@/models/Fee";
import { Payment } from "@/models/Payment";
import { StaffInvoice } from "@/models/StaffInvoice";

/**
 * Everything behind one month's figures on the Accounts overview: each bill,
 * bank row, ledger entry and staff invoice, grouped the way the P&L adds them
 * up, so any number on the overview can be traced to what made it.
 */

function idOf(value: any) {
  return String(value?._id || value || "");
}

export type DetailLine = {
  id: string;
  date: string;
  title: string;
  detail: string;
  amount: number;
  /** GST or TDS inside the amount, when there is any. */
  tax?: number;
  account?: string;
  tag?: string;
};

export async function loadMonthDetail(month: string) {
  await dbConnect();
  const { start, end } = monthBounds(month);
  const [accounts, bills, payments, refunds, entries, staffInvoices, receipts, surplus]: any[] = await Promise.all([
    loadAccounts({ from: month, to: month, label: month, fyStart: null }),
    Invoice.find({ status: "paid", paidAt: { $gte: start, $lte: end } })
      .select("invoiceNumber title student paidAt totalAmount gstAmount gstPercentage invoiceMode paymentTransactions")
      .populate("student", "name")
      .sort({ paidAt: 1 })
      .lean(),
    Payment.find({ status: "paid", purpose: { $ne: "invoice" }, paidAt: { $gte: start, $lte: end } }).select("user purpose amount paidAt").populate("user", "name").lean(),
    Payment.find({ status: "refunded", updatedAt: { $gte: start, $lte: end } }).select("user purpose amount updatedAt").populate("user", "name").lean(),
    AccountEntry.find({ voidedAt: null, month }).sort({ date: 1 }).lean(),
    month >= PORTAL_TEACHER_COST_FROM
      ? StaffInvoice.find({ month })
          .select("staff invoiceNumber total status paidAt")
          .populate({ path: "staff", select: "name role accessRole", populate: { path: "accessRole", select: "name" } })
          .lean()
      : [],
    BankTransaction.find({ feeReceipt: true, month }).select("date narration reference credit label suggestion.type").sort({ date: 1 }).lean(),
    bankFeesNotInPortal(month),
  ]);

  const report = accounts.report.months[0];
  const cashBills = new Set(
    (entries as any[]).filter((entry) => entry.category === "portal_cash_fee").flatMap((entry) => (entry.invoices || []).map(idOf))
  );

  const portalGst: DetailLine[] = [];
  const portalNonGst: DetailLine[] = [];
  for (const bill of bills as any[]) {
    const modes = Array.from(new Set((bill.paymentTransactions || []).map((transaction: any) => transaction.mode)));
    const cash = cashBills.has(idOf(bill._id)) || modes.includes("cash");
    const line: DetailLine = {
      id: idOf(bill._id),
      date: new Date(bill.paidAt).toISOString(),
      title: bill.student?.name || "Student",
      detail: [bill.invoiceNumber, bill.title].filter(Boolean).join(" - "),
      amount: Number(bill.totalAmount || 0),
      tax: Number(bill.gstAmount || 0) || undefined,
      tag: cash ? "cash" : modes.join(", ") || "not recorded",
    };
    (isGstInvoice(bill) ? portalGst : portalNonGst).push(line);
  }

  const otherPortal: DetailLine[] = (payments as any[]).map((payment) => ({
    id: idOf(payment._id),
    date: new Date(payment.paidAt).toISOString(),
    title: payment.user?.name || "Payment",
    detail: `Razorpay ${payment.purpose} payment`,
    amount: Number(payment.amount || 0),
  }));
  const portalRefunds: DetailLine[] = (refunds as any[]).map((payment) => ({
    id: idOf(payment._id),
    date: new Date(payment.updatedAt).toISOString(),
    title: payment.user?.name || "Refund",
    detail: `Refunded ${payment.purpose} payment`,
    amount: -Number(payment.amount || 0),
  }));

  const ledgerByCategory: Record<string, DetailLine[]> = {};
  for (const entry of entries as any[]) {
    const who = [entry.studentName, entry.counterparty].filter(Boolean).join(", ");
    const line: DetailLine = {
      id: idOf(entry._id),
      date: new Date(entry.date).toISOString(),
      title: entry.description || who || accountCategory(entry.category)?.label || entry.category,
      detail: [who && entry.description ? who : "", entry.source === "bank_statement" ? "bank statement" : entry.source === "csv_import" ? "sheet import" : "typed"]
        .filter(Boolean)
        .join(" - "),
      amount: Number(entry.amount || 0),
      tax: Number(entry.tdsAmount || entry.gstAmount || 0) || undefined,
      account: entry.account || "bank",
    };
    (ledgerByCategory[entry.category] = ledgerByCategory[entry.category] || []).push(line);
  }

  // Staff invoices land in the cost line for the person's job, as on the overview.
  const staffByCategory: Record<string, DetailLine[]> = {};
  for (const invoice of staffInvoices as any[]) {
    const staff = invoice.staff || {};
    const category = staff.role === "instructor" || !staff.role ? "teacher_pay" : /sales/i.test(staff.accessRole?.name || "") ? "sales_salaries" : "staff_salaries";
    (staffByCategory[category] = staffByCategory[category] || []).push({
      id: idOf(invoice._id),
      date: invoice.paidAt ? new Date(invoice.paidAt).toISOString() : "",
      title: staff.name || "Staff",
      detail: `Staff invoice ${invoice.invoiceNumber || ""} - ${invoice.status === "paid" ? "paid" : "not paid yet"}`,
      amount: Number(invoice.total || 0),
      tag: "portal invoice",
    });
  }
  const estimatesByCategory: Record<string, DetailLine[]> = {};
  for (const gap of (accounts.teacherGaps as any[]).filter((item) => item.month === month)) {
    (estimatesByCategory[gap.job || "teacher_pay"] = estimatesByCategory[gap.job || "teacher_pay"] || []).push({
      id: `${gap.month}:${gap.coachId}`,
      date: "",
      title: gap.coachName,
      detail: `Earned in Coach Pay, no staff invoice${gap.unpriced ? ` - ${gap.unpriced} classes without a rate` : ""}`,
      amount: Number(gap.amount || 0),
      tag: "estimate",
    });
  }

  const bankReceipts: DetailLine[] = (receipts as any[]).map((row) => ({
    id: idOf(row._id),
    date: new Date(row.date).toISOString(),
    title: row.narration || "Bank credit",
    detail: [row.label, row.reference ? `ref ${row.reference}` : "", row.suggestion?.type === "razorpay" ? "Razorpay settlement" : ""].filter(Boolean).join(" - "),
    amount: Number(row.credit || 0),
  }));

  return {
    month,
    report,
    portalGst,
    portalNonGst,
    otherPortal,
    portalRefunds,
    ledgerByCategory,
    staffByCategory,
    estimatesByCategory,
    bankReceipts,
    bankVsPortal: surplus[month] || null,
  };
}
