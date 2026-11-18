import "server-only";

import { dbConnect } from "@/lib/db";
import { academyMonthOf, monthBounds } from "@/lib/feedback/feedbackCycleDates";
import { categoryLabel } from "@/lib/accounts/categories";
import { PORTAL_FEE_FIELDS, portalFeeKind } from "@/lib/accounts/portalFees";
import { AccountEntry, BankTransaction } from "@/models/Accounts";
import { Invoice } from "@/models/Fee";

/**
 * The HDFC account month by month, for the statement download.
 *
 * Up to the last day an uploaded statement reaches, the rows are the
 * statement's own, with the bank's balance and what each was booked as. After
 * it, the bank money the portal and the ledger know about (bills paid into
 * the bank, bank costs typed by hand) is listed as "not on a statement yet",
 * so the current month can be managed before its statement is uploaded.
 */

export type BankStatementLine = {
  date: Date;
  month: string;
  details: string;
  reference: string;
  label: string;
  bookedAs: string;
  debit: number;
  credit: number;
  /** The bank's balance after the row; for lines not on a statement, worked on from the last one. */
  balance: number | null;
  onStatement: boolean;
};

export type BankStatementMonth = {
  month: string;
  opening: number | null;
  credits: number;
  debits: number;
  closing: number | null;
  rows: number;
  pendingCredits: number;
  pendingDebits: number;
};

function bookedAs(tx: any) {
  if (tx.status === "ignored") return `Ignored${tx.note ? `: ${tx.note}` : ""}`;
  if (tx.feeReceipt) return "Student fee";
  if (tx.status === "classified" && tx.entry && !tx.entry.voidedAt) return categoryLabel(tx.entry.category);
  if (tx.status === "matched_portal") return tx.suggestion?.label || "Matched in the portal";
  return `Not reviewed${tx.suggestion?.label ? `: ${tx.suggestion.label}` : ""}`;
}

export async function loadBankStatement(months: string[]) {
  await dbConnect();
  const start = monthBounds(months[0]).start;
  const end = monthBounds(months[months.length - 1]).end;
  const [transactions, lastRow]: any[] = await Promise.all([
    BankTransaction.find({ date: { $gte: start, $lte: end } })
      .select("date month narration reference label debit credit balance status feeReceipt suggestion.type suggestion.label entry note")
      .populate("entry", "category voidedAt")
      .sort({ date: 1, _id: 1 })
      .lean(),
    BankTransaction.findOne({}).sort({ date: -1, _id: -1 }).select("date balance").lean(),
  ]);

  const lines: BankStatementLine[] = (transactions as any[]).map((tx) => ({
    date: new Date(tx.date),
    month: tx.month,
    details: tx.narration || "",
    reference: tx.reference || "",
    label: tx.label || "",
    bookedAs: bookedAs(tx),
    debit: Number(tx.debit || 0),
    credit: Number(tx.credit || 0),
    balance: typeof tx.balance === "number" ? tx.balance : null,
    onStatement: true,
  }));

  // After the last statement row: what should have moved through the bank.
  const after = lastRow?.date ? new Date(lastRow.date) : start;
  if (end > after) {
    const from = after > start ? after : start;
    const [bills, entries, cashFees]: any[] = await Promise.all([
      Invoice.find({ status: "paid", paidAt: { $gt: from, $lte: end } })
        .select(`invoiceNumber title student paidAt totalAmount paymentTransactions.mode ${PORTAL_FEE_FIELDS}`)
        .populate("student", "name")
        .lean(),
      AccountEntry.find({ voidedAt: null, account: "bank", source: { $ne: "bank_statement" }, date: { $gt: from, $lte: end } })
        .select("category amount flow date description counterparty studentName")
        .lean(),
      AccountEntry.find({ voidedAt: null, category: "portal_cash_fee" }).select("invoices").lean(),
    ]);
    const paidInCash = new Set((cashFees as any[]).flatMap((entry) => (entry.invoices || []).map((id: any) => String(id))));
    const pending: BankStatementLine[] = [];
    for (const bill of bills as any[]) {
      // Non-GST bills are cash with Sayantan; a GST bill paid in cash is too.
      const kind = portalFeeKind(bill);
      if (kind === "non_gst" || paidInCash.has(String(bill._id)) || (bill.paymentTransactions || []).some((transaction: any) => transaction.mode === "cash")) continue;
      const date = new Date(bill.paidAt);
      pending.push({
        date,
        month: academyMonthOf(date),
        details: `${bill.student?.name || "Student"} - portal bill ${bill.invoiceNumber || ""}${kind === "export" ? " (export, LUT)" : ""}`,
        reference: "",
        label: "",
        bookedAs: "Student fee (portal)",
        debit: 0,
        credit: Number(bill.totalAmount || 0),
        balance: null,
        onStatement: false,
      });
    }
    for (const entry of entries as any[]) {
      const date = new Date(entry.date);
      const amount = Math.abs(Number(entry.amount || 0));
      const flow = entry.flow || (Number(entry.amount) < 0 ? "in" : "out");
      pending.push({
        date,
        month: academyMonthOf(date),
        details: [entry.description, entry.counterparty, entry.studentName].filter(Boolean).join(" - ") || categoryLabel(entry.category),
        reference: "",
        label: "",
        bookedAs: categoryLabel(entry.category),
        debit: flow === "out" ? amount : 0,
        credit: flow === "in" ? amount : 0,
        balance: null,
        onStatement: false,
      });
    }
    pending.sort((a, b) => a.date.getTime() - b.date.getTime());
    let running = typeof lastRow?.balance === "number" ? Number(lastRow.balance) : null;
    for (const line of pending) {
      if (running !== null) running += line.credit - line.debit;
      line.balance = running;
      lines.push(line);
    }
  }

  const summary: BankStatementMonth[] = months.map((month) => {
    const own = lines.filter((line) => line.month === month);
    const statement = own.filter((line) => line.onStatement);
    const first = statement.find((line) => line.balance !== null);
    const last = [...statement].reverse().find((line) => line.balance !== null);
    return {
      month,
      opening: first && first.balance !== null ? first.balance - first.credit + first.debit : null,
      credits: statement.reduce((sum, line) => sum + line.credit, 0),
      debits: statement.reduce((sum, line) => sum + line.debit, 0),
      closing: last ? last.balance : null,
      rows: statement.length,
      pendingCredits: own.filter((line) => !line.onStatement).reduce((sum, line) => sum + line.credit, 0),
      pendingDebits: own.filter((line) => !line.onStatement).reduce((sum, line) => sum + line.debit, 0),
    };
  });

  return { lines, summary, lastStatementDate: lastRow?.date ? new Date(lastRow.date) : null };
}
