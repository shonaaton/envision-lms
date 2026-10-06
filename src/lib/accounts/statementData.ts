import "server-only";

import { isValidObjectId } from "mongoose";

import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { academyDateKey } from "@/lib/academyTime";
import { academyMonthOf } from "@/lib/feedback/feedbackCycleDates";
import { accountCategory, isPayrollCategory } from "@/lib/accounts/categories";
import { AccountsError, saveEntry, voidEntry } from "@/lib/accounts/ledger";
import { suggestFor, type MatchContext, type Suggestion } from "@/lib/accounts/match";
import { parseStatementRows, StatementFormatError } from "@/lib/accounts/statement";
import { readSpreadsheet, SpreadsheetFormatError } from "@/lib/sheetReader";
import { AccountEntry, AccountRule, BankStatementImport, BankTransaction } from "@/models/Accounts";
import { Invoice } from "@/models/Fee";
import { Payment } from "@/models/Payment";
import { StaffInvoice, StaffPayoutProfile } from "@/models/StaffInvoice";
import { User } from "@/models/User";

const DAY = 86_400_000;

function idOf(value: any) {
  return String(value?._id || value || "");
}

/**
 * Everything the matcher compares bank rows with, for the dates the rows
 * cover (padded, since a payment recorded on the 30th clears on the 2nd).
 */
export async function loadMatchContext(from: Date, to: Date): Promise<MatchContext> {
  const start = new Date(from.getTime() - 10 * DAY);
  const end = new Date(to.getTime() + 10 * DAY);
  const [invoices, payments, rules, staffUsers, profiles, staffInvoices, ledger, linkedEntries]: any[][] = await Promise.all([
    Invoice.find({ status: "paid", paidAt: { $gte: start, $lte: end } }).select("invoiceNumber paidAt totalAmount paymentTransactions referenceNumber payment").lean(),
    Payment.find({ status: "paid", paidAt: { $gte: start, $lte: end }, referenceNumber: { $nin: [null, ""] } }).select("referenceNumber invoiceNumber amount").lean(),
    AccountRule.find({}).lean(),
    User.find({ role: { $in: ["instructor", "admin", "sub-admin"] } }).select("name").lean(),
    StaffPayoutProfile.find({}).select("user fullName").lean(),
    StaffInvoice.find({}).select("staff month total").lean(),
    AccountEntry.find({ voidedAt: null, source: { $ne: "bank_statement" }, date: { $gte: start, $lte: end } }).select("category amount date description counterparty").lean(),
    BankTransaction.find({ entry: { $ne: null } }).select("entry").lean(),
  ]);

  const portalRefs: MatchContext["portalRefs"] = new Map();
  const addRef = (ref: unknown, invoice: string | null, payment: string | null, label: string) => {
    const key = String(ref || "").trim().toLowerCase();
    if (key.length < 6) return;
    const row = portalRefs.get(key) || { invoices: [], payments: [], label };
    if (invoice && !row.invoices.includes(invoice)) row.invoices.push(invoice);
    if (payment && !row.payments.includes(payment)) row.payments.push(payment);
    portalRefs.set(key, row);
  };
  const manualPayments: MatchContext["manualPayments"] = [];
  for (const invoice of invoices) {
    const label = invoice.invoiceNumber || "invoice";
    for (const transaction of invoice.paymentTransactions || []) {
      addRef(transaction.referenceNumber, idOf(invoice._id), null, label);
      if (transaction.mode !== "cash") {
        manualPayments.push({ invoiceId: idOf(invoice._id), amount: Number(transaction.amount || 0), date: new Date(transaction.paidAt), label });
      }
    }
    addRef(invoice.referenceNumber, idOf(invoice._id), null, label);
  }
  for (const payment of payments) addRef(payment.referenceNumber, null, idOf(payment._id), payment.invoiceNumber || "payment");

  const profileName = new Map(profiles.map((profile: any) => [idOf(profile.user), profile.fullName]));
  const invoicesByStaff = new Map<string, { id: string; month: string; total: number }[]>();
  for (const invoice of staffInvoices) {
    const list = invoicesByStaff.get(idOf(invoice.staff)) || [];
    list.push({ id: idOf(invoice._id), month: invoice.month, total: Number(invoice.total || 0) });
    invoicesByStaff.set(idOf(invoice.staff), list);
  }
  const coaches = staffUsers
    .map((user: any) => {
      const staffId = idOf(user._id);
      const names = [profileName.get(staffId), user.name].filter((name): name is string => Boolean(name && String(name).trim()));
      return { staffId, name: names[0] || "Coach", names, invoices: invoicesByStaff.get(staffId) || [] };
    })
    .filter((coach: any) => coach.names.length);

  const linked = new Set(linkedEntries.map((row: any) => idOf(row.entry)));
  return {
    portalRefs,
    manualPayments,
    rules: rules.map((rule: any) => ({ pattern: rule.pattern, direction: rule.direction, category: rule.category })),
    coaches,
    ledger: ledger
      .filter((entry: any) => !linked.has(idOf(entry._id)) && accountCategory(entry.category)?.kind !== "income")
      .map((entry: any) => ({
        id: idOf(entry._id),
        category: entry.category,
        amount: Number(entry.amount || 0),
        date: new Date(entry.date),
        label: entry.description || entry.counterparty || entry.category,
      })),
  };
}

function suggestionDoc(suggestion: Suggestion) {
  return {
    type: suggestion.type,
    category: suggestion.category,
    label: suggestion.label,
    invoices: suggestion.invoices || [],
    payments: suggestion.payments || [],
    staffInvoice: suggestion.staffInvoice,
    entry: suggestion.entry,
    staffId: suggestion.staffId,
    month: suggestion.month,
    refund: suggestion.refund,
  };
}

/** Re-runs the matcher over rows nobody has classified yet - after a new rule, ledger entry or portal payment. */
export async function refreshSuggestions(filter: { importId?: string } = {}) {
  await dbConnect();
  const query: Record<string, any> = { status: "unclassified" };
  if (filter.importId) query.import = filter.importId;
  const rows: any[] = await BankTransaction.find(query).select("date month narration reference debit credit label").lean();
  if (!rows.length) return 0;
  const dates = rows.map((row) => new Date(row.date).getTime());
  const context = await loadMatchContext(new Date(Math.min(...dates)), new Date(Math.max(...dates)));
  const operations = rows.map((row) => ({
    updateOne: {
      filter: { _id: row._id, status: "unclassified" },
      update: { $set: { suggestion: suggestionDoc(suggestFor({ ...row, date: new Date(row.date) }, context)) } },
    },
  }));
  await BankTransaction.bulkWrite(operations, { ordered: false });
  return rows.length;
}

export async function importStatement(input: { buffer: Buffer; fileName: string; accountLabel: string; actorId: string }) {
  let parsed;
  try {
    parsed = parseStatementRows(readSpreadsheet(input.buffer, input.fileName));
  } catch (error) {
    if (error instanceof StatementFormatError || error instanceof SpreadsheetFormatError) throw new AccountsError(error.message);
    throw new AccountsError("Could not read that file. Upload the statement as .xlsx or .csv from net banking.");
  }
  await dbConnect();
  const { transactions } = parsed;
  const hashes = transactions.map((row) => row.hash);
  const existing = new Set((await BankTransaction.find({ hash: { $in: hashes } }).select("hash").lean()).map((row: any) => row.hash));
  const fresh = transactions.filter((row) => !existing.has(row.hash));
  if (!fresh.length) throw new AccountsError(`All ${transactions.length} rows in this file were uploaded before - nothing new to add.`);
  const dates = transactions.map((row) => row.date.getTime());

  const record: any = await BankStatementImport.create({
    fileName: input.fileName.slice(0, 200),
    accountLabel: input.accountLabel.slice(0, 80),
    periodFrom: new Date(Math.min(...dates)),
    periodTo: new Date(Math.max(...dates)),
    rowCount: transactions.length,
    newRows: fresh.length,
    duplicateRows: transactions.length - fresh.length,
    totalCredit: transactions.reduce((sum, row) => sum + row.credit, 0),
    totalDebit: transactions.reduce((sum, row) => sum + row.debit, 0),
    uploadedBy: input.actorId,
  });

  if (fresh.length) {
    try {
      await BankTransaction.insertMany(
        fresh.map((row) => ({
          import: record._id,
          date: row.date,
          month: academyMonthOf(row.date),
          narration: row.narration,
          reference: row.reference,
          label: row.label,
          debit: row.debit,
          credit: row.credit,
          balance: row.balance ?? undefined,
          hash: row.hash,
        })),
        { ordered: false }
      );
    } catch (error: any) {
      // Two uploads at once can race on the unique hash; the losers are duplicates.
      if (error?.code !== 11000 && !error?.writeErrors) throw error;
    }
    await refreshSuggestions({ importId: idOf(record._id) });
  }

  await recordActivity({
    actor: input.actorId,
    type: "accounts.statement.imported",
    label: `Uploaded bank statement ${input.fileName} (${fresh.length} new rows)`,
    entityType: "BankStatementImport",
    entityId: idOf(record._id),
  });
  return { id: idOf(record._id), newRows: fresh.length, duplicateRows: transactions.length - fresh.length, skipped: parsed.skipped.length };
}

export type Classification =
  | { kind: "accept" }
  | { kind: "portal" }
  | { kind: "ignore"; note?: string }
  | { kind: "reset" }
  | { kind: "ledger"; entryId: string }
  | {
      kind: "category";
      category: string;
      student?: string;
      /** Pay to people: the bank shows what they received; default is 90% after TDS. */
      basis?: "gross" | "net_paid";
      /** The month the money is for, when not the month it moved ("YYYY-MM"). */
      month?: string;
      tdsDeducted?: boolean;
      description?: string;
      rulePattern?: string;
    };

/** Undo whatever the row was booked as. An entry the row created is voided; one it only linked to is left alone. */
async function release(tx: any, actorId: string) {
  if (tx.entry) {
    const entry: any = await AccountEntry.findById(tx.entry).select("source bankTransaction voidedAt").lean();
    if (entry && !entry.voidedAt && entry.source === "bank_statement" && idOf(entry.bankTransaction) === idOf(tx._id)) {
      await voidEntry(idOf(entry._id), actorId);
    }
  }
  tx.entry = undefined;
  tx.matchedInvoices = [];
  tx.matchedPayments = [];
  tx.matchedStaffInvoice = undefined;
  tx.feeReceipt = false;
  tx.note = "";
}

function rupeesText(paise: number) {
  return (paise / 100).toFixed(2);
}

export async function classifyTransaction(id: string, decision: Classification, actorId: string) {
  if (!isValidObjectId(id)) throw new AccountsError("Unknown bank row.");
  await dbConnect();
  const tx: any = await BankTransaction.findById(id);
  if (!tx) throw new AccountsError("Unknown bank row.");

  let resolved: Classification = decision;
  if (decision.kind === "accept") {
    const suggestion = tx.suggestion || {};
    if (["portal", "razorpay", "fee_receipt", "staff_invoice"].includes(suggestion.type)) resolved = { kind: "portal" };
    else if (suggestion.type === "ledger" && suggestion.entry) resolved = { kind: "ledger", entryId: idOf(suggestion.entry) };
    else if (suggestion.type === "category" && suggestion.category) {
      resolved = { kind: "category", category: suggestion.category, month: suggestion.month || undefined, description: tx.narration.slice(0, 120) };
    } else throw new AccountsError("There is no suggestion to accept on this row - pick what it is.");
  }

  if (resolved.kind === "category" && !accountCategory(resolved.category)) throw new AccountsError("Pick a category.");

  await release(tx, actorId);

  if (resolved.kind === "reset") {
    tx.status = "unclassified";
  } else if (resolved.kind === "ignore") {
    tx.status = "ignored";
    tx.note = String(resolved.note || "").slice(0, 200);
  } else if (resolved.kind === "portal") {
    tx.status = "matched_portal";
    tx.matchedInvoices = tx.suggestion?.invoices || [];
    tx.matchedPayments = tx.suggestion?.payments || [];
    tx.matchedStaffInvoice = tx.suggestion?.staffInvoice;
    // Money in that the portal accounts for is a student fee receipt.
    tx.feeReceipt = tx.credit > 0;
  } else if (resolved.kind === "ledger") {
    if (!isValidObjectId(resolved.entryId)) throw new AccountsError("Unknown ledger entry.");
    const entry: any = await AccountEntry.findOne({ _id: resolved.entryId, voidedAt: null }).select("_id").lean();
    if (!entry) throw new AccountsError("That ledger entry no longer exists.");
    tx.status = "classified";
    tx.entry = entry._id;
  } else if (resolved.kind === "category") {
    const kind = accountCategory(resolved.category)?.kind;
    // Money in against a cost is that cost refunded; money out against income
    // is a fee paid back. Both are booked negative in their category.
    const refund = (tx.credit > 0 && kind === "expense") || (tx.debit > 0 && kind === "income");
    const isPayroll = isPayrollCategory(resolved.category) && !refund;
    const entry = await saveEntry(
      {
        category: resolved.category,
        date: academyDateKey(tx.date),
        amount: rupeesText(tx.credit || tx.debit),
        amountBasis: isPayroll ? resolved.basis || "net_paid" : undefined,
        tdsDeducted: isPayroll ? resolved.tdsDeducted !== false : undefined,
        month: resolved.month,
        refund,
        flow: tx.credit > 0 ? "in" : "out",
        description: resolved.description || tx.narration.slice(0, 120),
        counterparty: "",
        paymentMode: "bank",
        student: resolved.student,
        source: "bank_statement",
        bankTransaction: idOf(tx._id),
      },
      actorId
    );
    if (isPayroll && tx.suggestion?.staffId) await AccountEntry.updateOne({ _id: entry._id }, { $set: { staff: tx.suggestion.staffId } });
    tx.status = "classified";
    tx.entry = entry._id;
    if (resolved.rulePattern && resolved.rulePattern.trim().length >= 3) {
      await saveRule(resolved.rulePattern, tx.debit ? "debit" : "credit", resolved.category, actorId);
    }
  }

  tx.classifiedBy = actorId;
  tx.classifiedAt = new Date();
  await tx.save();
  return tx;
}

export async function saveRule(pattern: string, direction: "debit" | "credit", category: string, actorId: string) {
  const clean = pattern.trim().toLowerCase().slice(0, 60);
  if (clean.length < 3 || !accountCategory(category)) return;
  await AccountRule.updateOne(
    { pattern: clean, direction },
    { $set: { category, createdBy: actorId }, $setOnInsert: { hits: 0 } },
    { upsert: true }
  );
  await refreshSuggestions();
}

export async function deleteRule(id: string) {
  if (!isValidObjectId(id)) return;
  await dbConnect();
  await AccountRule.deleteOne({ _id: id });
  await refreshSuggestions();
}

/** Books every row the matcher was sure enough about. Rows it could not place are left for a person. */
export async function acceptAllSuggestions(importId: string, actorId: string) {
  if (!isValidObjectId(importId)) throw new AccountsError("Unknown statement.");
  await dbConnect();
  const rows: any[] = await BankTransaction.find({
    import: importId,
    status: "unclassified",
    "suggestion.type": { $in: ["portal", "razorpay", "fee_receipt", "staff_invoice", "ledger", "category"] },
  })
    .select("_id")
    .lean();
  let done = 0;
  for (const row of rows) {
    try {
      await classifyTransaction(idOf(row._id), { kind: "accept" }, actorId);
      done += 1;
    } catch (error) {
      if (!(error instanceof AccountsError)) throw error;
    }
  }
  return done;
}

export type StatementSummary = {
  id: string;
  fileName: string;
  accountLabel: string;
  periodFrom: string;
  periodTo: string;
  rowCount: number;
  newRows: number;
  duplicateRows: number;
  totalCredit: number;
  totalDebit: number;
  createdAt: string;
  unclassified: number;
};

export async function listStatements(): Promise<StatementSummary[]> {
  await dbConnect();
  const [imports, open]: [any[], any[]] = await Promise.all([
    BankStatementImport.find({}).sort({ createdAt: -1 }).limit(100).lean(),
    BankTransaction.aggregate([{ $match: { status: "unclassified" } }, { $group: { _id: "$import", count: { $sum: 1 } } }]),
  ]);
  const openBy = new Map(open.map((row) => [idOf(row._id), row.count]));
  return imports.map((item) => ({
    id: idOf(item._id),
    fileName: item.fileName,
    accountLabel: item.accountLabel || "",
    periodFrom: item.periodFrom ? new Date(item.periodFrom).toISOString() : "",
    periodTo: item.periodTo ? new Date(item.periodTo).toISOString() : "",
    rowCount: item.rowCount || 0,
    newRows: item.newRows || 0,
    duplicateRows: item.duplicateRows || 0,
    totalCredit: item.totalCredit || 0,
    totalDebit: item.totalDebit || 0,
    createdAt: new Date(item.createdAt).toISOString(),
    unclassified: openBy.get(idOf(item._id)) || 0,
  }));
}

export type BankRow = {
  id: string;
  date: string;
  month: string;
  narration: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number | null;
  status: string;
  label: string;
  suggestion: { type: string; label: string; category: string; month: string } | null;
  entry: { id: string; category: string; month: string; amount: number; tdsAmount: number; studentName: string } | null;
  note: string;
};

export async function loadStatementRows(importId: string, status = ""): Promise<{ summary: StatementSummary | null; rows: BankRow[] }> {
  if (!isValidObjectId(importId)) return { summary: null, rows: [] };
  await dbConnect();
  const summary = (await listStatements()).find((item) => item.id === importId) || null;
  if (!summary) return { summary: null, rows: [] };
  const query: Record<string, any> = { import: importId };
  if (status) query.status = status;
  const rows: any[] = await BankTransaction.find(query).sort({ date: 1, _id: 1 }).populate("entry", "category month amount tdsAmount studentName voidedAt").lean();
  return {
    summary,
    rows: rows.map((row) => ({
      id: idOf(row._id),
      date: new Date(row.date).toISOString(),
      month: row.month,
      narration: row.narration || "",
      reference: row.reference || "",
      debit: row.debit || 0,
      credit: row.credit || 0,
      balance: typeof row.balance === "number" ? row.balance : null,
      status: row.status,
      label: row.label || "",
      suggestion: row.suggestion?.type
        ? { type: row.suggestion.type, label: row.suggestion.label || "", category: row.suggestion.category || "", month: row.suggestion.month || "" }
        : null,
      entry:
        row.entry && !row.entry.voidedAt
          ? {
              id: idOf(row.entry._id),
              category: row.entry.category,
              month: row.entry.month || "",
              amount: row.entry.amount || 0,
              tdsAmount: row.entry.tdsAmount || 0,
              studentName: row.entry.studentName || "",
            }
          : null,
      note: row.note || "",
    })),
  };
}

export async function listRules() {
  await dbConnect();
  const rules: any[] = await AccountRule.find({}).sort({ pattern: 1 }).lean();
  return rules.map((rule) => ({ id: idOf(rule._id), pattern: rule.pattern, direction: rule.direction as "debit" | "credit", category: rule.category }));
}

/** Removes an upload and its rows. Entries the rows created are voided with them. */
export async function deleteStatement(importId: string, actorId: string) {
  if (!isValidObjectId(importId)) throw new AccountsError("Unknown statement.");
  await dbConnect();
  const rows: any[] = await BankTransaction.find({ import: importId });
  for (const row of rows) await release(row, actorId);
  await BankTransaction.deleteMany({ import: importId });
  await BankStatementImport.deleteOne({ _id: importId });
  await recordActivity({
    actor: actorId,
    type: "accounts.statement.deleted",
    label: `Removed a bank statement upload (${rows.length} rows)`,
    entityType: "BankStatementImport",
    entityId: importId,
  });
}
