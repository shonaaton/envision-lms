import "server-only";

import { dbConnect } from "@/lib/db";
import { academyMonthOf, monthBounds } from "@/lib/feedback/feedbackCycleDates";
import { isGstInvoice } from "@/lib/feesMetrics";
import { bankFeesNotInPortal } from "@/lib/accounts/data";
import { AccountEntry, BankTransaction } from "@/models/Accounts";
import { Invoice } from "@/models/Fee";

/**
 * Revenue checked against the bank and the government, month by month.
 *
 * - Fees: what the portal shows paid (split into cash and money that should
 *   have reached the bank) against the student fee receipts on the statement.
 *   Google Pay settles in batches, so this is compared in totals, not bill by
 *   bill; the surplus is the "bank fees not in the portal" in the P&L.
 * - GST: GST on the portal's GST bills against the GST paid for the month. GST
 *   paid is the least output GST declared, so paying more than the portal's
 *   bills carry means GST-billed fees are missing from the portal.
 * - Offline fees entered for a student, checked against that student's bills.
 */

const DAY = 86_400_000;

function idOf(value: any) {
  return String(value?._id || value || "");
}

export type ReconcileMonth = {
  month: string;
  portal: { total: number; gstGross: number; gstTax: number; nonGstGross: number; cash: number; intoBank: number };
  bank: { credits: number; feeReceipts: number; razorpay: number; offlineFees: number; otherIncome: number; nonPl: number; ignored: number; unclassified: number };
  /** This month's share of the running bank-over-portal surplus. */
  notInPortal: number;
  gstPaid: number;
  hasStatement: boolean;
};

export type OfflineFlag = { entryId: string; date: string; student: string; amount: number; kind: "double" | "maybe_invoice"; invoiceNumber: string; invoiceTotal: number; invoiceStatus: string };

export async function loadReconciliation(months: string[]) {
  await dbConnect();
  const start = monthBounds(months[0]).start;
  const end = monthBounds(months[months.length - 1]).end;

  const [invoices, bankRows, cashLinks, gstPaid, offline, surplus]: any[] = await Promise.all([
    Invoice.find({ status: "paid", paidAt: { $gte: start, $lte: end } }).select("paidAt totalAmount gstAmount gstPercentage invoiceMode paymentTransactions.mode").lean(),
    BankTransaction.find({ date: { $gte: start, $lte: end } })
      .select("month credit status feeReceipt suggestion.type entry")
      .populate("entry", "category kind voidedAt")
      .lean(),
    AccountEntry.find({ voidedAt: null, category: "portal_cash_fee" }).select("invoices").lean(),
    AccountEntry.find({ voidedAt: null, category: "gst_paid", month: { $in: months } }).select("month amount").lean(),
    AccountEntry.find({ voidedAt: null, category: "offline_fees", month: { $in: months } }).select("date student studentName amount").lean(),
    bankFeesNotInPortal(months[months.length - 1]),
  ]);

  const blank = (month: string): ReconcileMonth => ({
    month,
    portal: { total: 0, gstGross: 0, gstTax: 0, nonGstGross: 0, cash: 0, intoBank: 0 },
    bank: { credits: 0, feeReceipts: 0, razorpay: 0, offlineFees: 0, otherIncome: 0, nonPl: 0, ignored: 0, unclassified: 0 },
    notInPortal: surplus[month]?.notInPortal || 0,
    gstPaid: 0,
    hasStatement: Boolean(surplus[month]),
  });
  const byMonth = new Map<string, ReconcileMonth>(months.map((month) => [month, blank(month)]));

  const paidInCash = new Set((cashLinks as any[]).flatMap((entry) => (entry.invoices || []).map(idOf)));
  for (const invoice of invoices as any[]) {
    const row = byMonth.get(academyMonthOf(new Date(invoice.paidAt)));
    if (!row) continue;
    const total = Number(invoice.totalAmount || 0);
    row.portal.total += total;
    if (isGstInvoice(invoice)) {
      row.portal.gstGross += total;
      row.portal.gstTax += Number(invoice.gstAmount || 0);
    } else row.portal.nonGstGross += total;
    const cash = paidInCash.has(idOf(invoice._id)) || (invoice.paymentTransactions || []).some((transaction: any) => transaction.mode === "cash");
    if (cash) row.portal.cash += total;
    else row.portal.intoBank += total;
  }

  for (const tx of bankRows as any[]) {
    const row = byMonth.get(tx.month);
    if (!row || !tx.credit) continue;
    const amount = Number(tx.credit || 0);
    row.bank.credits += amount;
    if (tx.feeReceipt) {
      row.bank.feeReceipts += amount;
      if (tx.suggestion?.type === "razorpay") row.bank.razorpay += amount;
    } else if (tx.status === "classified" && tx.entry && !tx.entry.voidedAt) {
      if (tx.entry.category === "offline_fees") row.bank.offlineFees += amount;
      else if (tx.entry.kind === "income") row.bank.otherIncome += amount;
      else row.bank.nonPl += amount;
    } else if (tx.status === "ignored") row.bank.ignored += amount;
    else row.bank.unclassified += amount;
  }

  for (const entry of gstPaid as any[]) {
    const row = byMonth.get(entry.month);
    if (row) row.gstPaid += Number(entry.amount || 0);
  }

  // Offline fees that may already be in the portal.
  const studentIds = Array.from(new Set((offline as any[]).map((entry) => idOf(entry.student)).filter(Boolean)));
  const studentInvoices: any[] = studentIds.length
    ? await Invoice.find({ student: { $in: studentIds }, status: { $in: ["paid", "unpaid", "overdue"] } })
        .select("student invoiceNumber status totalAmount paidAt")
        .lean()
    : [];
  const invoicesByStudent = new Map<string, any[]>();
  for (const invoice of studentInvoices) {
    const list = invoicesByStudent.get(idOf(invoice.student)) || [];
    list.push(invoice);
    invoicesByStudent.set(idOf(invoice.student), list);
  }
  const offlineFlags: OfflineFlag[] = [];
  const unlinkedOffline = (offline as any[]).filter((entry) => !entry.student).length;
  for (const entry of offline as any[]) {
    if (!entry.student) continue;
    const date = new Date(entry.date).getTime();
    const amount = Number(entry.amount || 0);
    for (const invoice of invoicesByStudent.get(idOf(entry.student)) || []) {
      if (Number(invoice.totalAmount || 0) !== amount) continue;
      const base = {
        entryId: idOf(entry._id),
        date: new Date(entry.date).toISOString(),
        student: entry.studentName || "",
        amount,
        invoiceNumber: invoice.invoiceNumber || "",
        invoiceTotal: Number(invoice.totalAmount || 0),
        invoiceStatus: invoice.status,
      };
      if (invoice.status === "paid" && invoice.paidAt && Math.abs(new Date(invoice.paidAt).getTime() - date) <= 7 * DAY) offlineFlags.push({ ...base, kind: "double" });
      else if (invoice.status !== "paid") offlineFlags.push({ ...base, kind: "maybe_invoice" });
    }
  }

  return { months: Array.from(byMonth.values()), offlineFlags, unlinkedOffline };
}
