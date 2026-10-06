import "server-only";

import { isValidObjectId } from "mongoose";

import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { academyMonthOf, monthBounds } from "@/lib/feedback/feedbackCycleDates";
import { defaultFlow } from "@/lib/accounts/categories";
import { buildCashBook, type CashMovement } from "@/lib/accounts/cashbook";
import { AccountsError } from "@/lib/accounts/ledger";
import { ACCOUNTS_START_MONTH, monthsBetween } from "@/lib/accounts/metrics";
import { bucketFor, classifyStudent, summarizeReceivables, type ReceivableStudent } from "@/lib/accounts/receivables";
import { AccountEntry, AccountsSettings } from "@/models/Accounts";
import { Invoice } from "@/models/Fee";
import { Payment } from "@/models/Payment";

function idOf(value: any) {
  return String(value?._id || value || "");
}

export async function getAccountsSettings() {
  await dbConnect();
  const settings: any = await AccountsSettings.findOne({ key: "default" }).lean();
  return { openingCash: Number(settings?.openingCash || 0), cashHolder: String(settings?.cashHolder || "Sayantan") };
}

export async function saveAccountsSettings(input: { openingCash: number; cashHolder: string }, actorId: string) {
  await dbConnect();
  await AccountsSettings.updateOne(
    { key: "default" },
    { $set: { openingCash: Math.round(input.openingCash), cashHolder: input.cashHolder.trim().slice(0, 60) || "Sayantan", updatedBy: actorId } },
    { upsert: true }
  );
}

/**
 * Every cash movement since the books started: portal bills marked paid in
 * "Cash", and cash entries in the ledger. "Others" is not cash: the bills
 * back-filled in Aug-Sep 2026 used it for UPI and bank payments. A cash fee on
 * a bill already paid in the portal is a "Cash fee already paid in the portal"
 * entry, so that bill is not counted a second time here.
 */
async function cashMovements(until: Date): Promise<CashMovement[]> {
  const start = monthBounds(ACCOUNTS_START_MONTH).start;
  const [invoices, payments, entries]: any[][] = await Promise.all([
    Invoice.find({ status: "paid", "paymentTransactions.mode": "cash", paidAt: { $gte: start, $lte: until } })
      .select("paymentTransactions")
      .lean(),
    Payment.find({ status: "paid", purpose: { $ne: "invoice" }, method: "cash", paidAt: { $gte: start, $lte: until } }).select("amount paidAt").lean(),
    AccountEntry.find({ voidedAt: null, account: "cash", date: { $gte: start, $lte: until } }).select("category kind amount flow date invoices").lean(),
  ]);
  const coveredByEntry = new Set(entries.flatMap((entry) => (entry.invoices || []).map(idOf)));
  const moves: CashMovement[] = [];
  for (const invoice of invoices) {
    if (coveredByEntry.has(idOf(invoice._id))) continue;
    for (const transaction of invoice.paymentTransactions || []) {
      if (transaction.mode !== "cash") continue;
      const paidAt = new Date(transaction.paidAt);
      if (paidAt < start || paidAt > until) continue;
      moves.push({ month: academyMonthOf(paidAt), flow: "in", amount: Number(transaction.amount || 0), group: "fees" });
    }
  }
  for (const payment of payments) moves.push({ month: academyMonthOf(new Date(payment.paidAt)), flow: "in", amount: Number(payment.amount || 0), group: "fees" });
  for (const entry of entries) {
    const flow = entry.flow || defaultFlow(entry.category, Number(entry.amount) < 0);
    const group = flow === "in" ? (entry.category === "offline_fees" || entry.category === "portal_cash_fee" ? "fees" : "other_in") : entry.category;
    moves.push({ month: academyMonthOf(new Date(entry.date)), flow, amount: Number(entry.amount || 0), group });
  }
  return moves;
}

export async function loadCashBook(months: string[], now = new Date()) {
  const settings = await getAccountsSettings();
  const until = monthBounds(months[months.length - 1]).end;
  const moves = await cashMovements(until < now ? until : now);
  // The balance has to start where the books start, even when a later year is shown.
  const allMonths = monthsBetween(ACCOUNTS_START_MONTH, months[months.length - 1]);
  const book = buildCashBook(settings.openingCash, moves, allMonths);
  return { ...book, rows: book.rows.filter((row) => months.includes(row.month)), holder: settings.cashHolder, openingCash: settings.openingCash };
}

export async function loadReceivables(now = new Date()) {
  await dbConnect();
  const open: any[] = await Invoice.find({ status: { $in: ["unpaid", "overdue"] } })
    .select("invoiceNumber title student dueDate totalAmount status")
    .populate("student", "name username isActive isPaused accountStatus")
    .lean();
  const studentIds = Array.from(new Set(open.map((invoice) => idOf(invoice.student)).filter(Boolean)));
  const [lastPaid, lastOffline]: any[][] = await Promise.all([
    Invoice.aggregate([
      { $match: { student: { $in: open.map((invoice) => invoice.student?._id).filter(Boolean) }, status: "paid" } },
      { $group: { _id: "$student", at: { $max: "$paidAt" } } },
    ]),
    AccountEntry.aggregate([
      { $match: { voidedAt: null, category: "offline_fees", student: { $in: open.map((invoice) => invoice.student?._id).filter(Boolean) } } },
      { $group: { _id: "$student", at: { $max: "$date" } } },
    ]),
  ]);
  const paidAt = new Map<string, Date>();
  for (const row of [...lastPaid, ...lastOffline]) {
    const key = idOf(row._id);
    const at = row.at ? new Date(row.at) : null;
    if (at && (!paidAt.has(key) || paidAt.get(key)! < at)) paidAt.set(key, at);
  }

  const byStudent = new Map<string, ReceivableStudent>();
  for (const invoice of open) {
    const student = invoice.student;
    if (!student || student.accountStatus === "demo") continue;
    const key = idOf(student);
    const row =
      byStudent.get(key) ||
      ({
        studentId: key,
        name: student.name || student.username || "Student",
        username: student.username || "",
        group: "active",
        invoices: [],
        total: 0,
        oldestDue: null,
        lastPaidAt: paidAt.get(key) || null,
        buckets: { notDue: 0, upTo30: 0, upTo60: 0, over60: 0 },
      } as ReceivableStudent);
    const due = invoice.dueDate ? new Date(invoice.dueDate) : null;
    const total = Number(invoice.totalAmount || 0);
    row.invoices.push({ id: idOf(invoice._id), invoiceNumber: invoice.invoiceNumber || "", title: invoice.title || "", dueDate: due, total, status: invoice.status });
    row.total += total;
    row.buckets[bucketFor(due, now)] += total;
    if (due && (!row.oldestDue || due < row.oldestDue)) row.oldestDue = due;
    byStudent.set(key, row);
  }
  const students = Array.from(byStudent.values());
  for (const row of students) {
    const source = open.find((invoice) => idOf(invoice.student) === row.studentId)?.student || {};
    row.group = classifyStudent(source, row.oldestDue, row.lastPaidAt, now);
    row.invoices.sort((a, b) => (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0));
  }
  students.sort((a, b) => b.total - a.total);
  return { students, summary: summarizeReceivables(students), studentCount: studentIds.length };
}

/**
 * Cancels unpaid bills - for a student who left without the portal being told.
 * The same change as "Cancel" on the Fees invoices page, with the reason kept.
 */
export async function cancelOpenInvoices(invoiceIds: string[], reason: string, actorId: string) {
  const ids = invoiceIds.filter((id) => isValidObjectId(id));
  if (!ids.length) throw new AccountsError("Pick the bills to cancel.");
  const why = reason.trim().slice(0, 200);
  if (why.length < 3) throw new AccountsError("Say why the bills are being cancelled (e.g. \"student left in July\").");
  await dbConnect();
  const invoices: any[] = await Invoice.find({ _id: { $in: ids }, status: { $in: ["unpaid", "overdue", "draft"] } }).lean();
  for (const invoice of invoices) {
    await Invoice.updateOne(
      { _id: invoice._id, status: invoice.status },
      { $set: { status: "cancelled", cancellationReason: why, cancellationPreviousStatus: invoice.status } }
    );
    await recordActivity({
      actor: actorId,
      targetUser: idOf(invoice.student),
      type: "fees.invoice.cancelled",
      label: `Cancelled invoice ${invoice.invoiceNumber}: ${why}`,
      entityType: "Invoice",
      entityId: idOf(invoice._id),
      metadata: { invoiceNumber: invoice.invoiceNumber, amount: invoice.totalAmount, source: "accounts_receivables", reason: why },
    });
  }
  return invoices.length;
}
