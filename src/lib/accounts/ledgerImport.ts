import "server-only";

import { randomUUID } from "node:crypto";

import { dbConnect } from "@/lib/db";
import { academyMonthOf } from "@/lib/feedback/feedbackCycleDates";
import { resolveCategory } from "@/lib/accounts/categories";
import { parseEntryAmount, parseEntryDate, parseMonthKey } from "@/lib/accounts/entryInput";
import { AccountsError, buildEntry, type EntryInput } from "@/lib/accounts/ledger";
import { isPayrollCategory, type AccountCategory } from "@/lib/accounts/categories";
import { readSpreadsheet, SpreadsheetFormatError } from "@/lib/sheetReader";
import { recordActivity } from "@/lib/activity";
import { markInvoicePaid } from "@/lib/fees";
import { AccountEntry } from "@/models/Accounts";
import { Invoice } from "@/models/Fee";

/**
 * Bulk entry of the figures the portal never saw: costs since April 2026 and
 * offline (non-GST) fee income. A preview is always shown first; nothing is
 * saved until the admin confirms, and a row that looks already entered is
 * skipped rather than doubled.
 */

export type LedgerImportKind = "expense" | "income";

export const LEDGER_TEMPLATES: Record<LedgerImportKind, { headers: string[]; example: string[][] }> = {
  expense: {
    headers: ["Date", "Category", "Amount", "Description", "Paid to", "Amount is", "TDS deducted", "For month", "Account"],
    example: [
      ["05/04/2026", "Electricity", "4,250", "CESC bill March", "CESC", "", "", "", "Bank"],
      ["07/04/2026", "Marketing", "15,000", "Facebook ads", "Meta", "", "", "", "Bank"],
      ["07/05/2026", "Teacher pay", "18,000", "April classes", "Coach name", "paid after TDS", "yes", "Apr 2026", "Bank"],
      ["10/05/2026", "Teacher pay", "5,000", "Cash to coach", "Coach name", "", "no", "", "Cash"],
      ["20/05/2026", "Software", "-1,180", "Refund from vendor (negative = money back)", "Vendor", "", "", "", "Bank"],
    ],
  },
  income: {
    headers: ["Date", "Student", "Amount", "GST", "Mode", "Note", "For month", "Account"],
    example: [
      ["12/04/2026", "Riya Sharma or username or phone", "3,000", "", "cash", "April fee", "", "Cash"],
      ["30/04/2026", "", "25,000", "", "cash", "April offline fees - month total", "Apr 2026", "Cash"],
    ],
  },
};

function squash(value: string) {
  return String(value || "").toLowerCase().replace(/[^a-z]/g, "");
}

const FIELDS: Record<string, string[]> = {
  date: ["date", "paidon", "paymentdate", "txndate"],
  category: ["category", "head", "expensehead", "type"],
  amount: ["amount", "amountrs", "amountinr", "rs", "value"],
  description: ["description", "details", "particulars", "note", "notes", "remarks", "narration"],
  counterparty: ["paidto", "vendor", "payee", "counterparty", "party"],
  basis: ["amountis", "basis"],
  tds: ["tdsdeducted", "tds"],
  student: ["student", "studentname", "username", "phone", "name"],
  gst: ["gst", "gstamount"],
  mode: ["mode", "paymentmode", "method"],
  month: ["formonth", "month", "countsin", "countsinmonth", "relatesto"],
  account: ["account", "paidvia", "paidfrom", "via", "cashorbank", "bankorcash"],
  invoice: ["invoice", "invoiceno", "invoicenumber", "bill", "billno", "portalbill"],
};

function headerMap(row: string[]) {
  const squashed = row.map(squash);
  const map: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(FIELDS)) {
    const index = squashed.findIndex((header, position) => aliases.includes(header) && !Object.values(map).includes(position));
    if (index >= 0) map[field] = index;
  }
  return map;
}

export type PreviewRow = {
  line: number;
  date: string;
  category: string;
  amount: number;
  tdsAmount: number;
  description: string;
  counterparty: string;
  student: string;
  studentMatched: string;
  account: string;
  /** "settle": a portal bill of this amount is open - the import marks it paid in Fees instead of adding an offline fee. */
  status: "ok" | "settle" | "in_portal" | "duplicate" | "error";
  invoiceIds?: string[];
  message: string;
};

const DAY = 86_400_000;

/**
 * A fee the portal already knows. Cash-paying students have had non-GST bills
 * in the portal since September 2026: a fee already marked paid there is
 * skipped, and an open bill of the same amount is marked paid rather than
 * counted a second time as an offline fee.
 */
async function portalBillFor(studentId: unknown, amount: number, date: Date, used: Set<string>) {
  if (!studentId) return null;
  const bills: any[] = (
    await Invoice.find({ student: studentId, status: { $in: ["paid", "unpaid", "overdue"] } })
      .select("invoiceNumber status paidAt dueDate issueDate totalAmount")
      .lean()
  ).filter((bill: any) => !used.has(String(bill._id)));
  const near = (value: unknown, days: number) => value && Math.abs(new Date(value as string).getTime() - date.getTime()) <= days * DAY;
  const result = (kind: "paid" | "open", list: any[]) => ({ kind, ids: list.map((bill) => String(bill._id)), number: list.map((bill) => bill.invoiceNumber).join(" + ") });
  const paid = bills.filter((bill) => bill.status === "paid");
  const single = paid.find((bill) => Number(bill.totalAmount) === amount && near(bill.paidAt, 25));
  if (single) return result("paid", [single]);
  // One cash handover can settle two or three months at once (Sharvil paid
  // ₹13,000 for two ₹6,500 bills).
  const close = paid.filter((bill) => near(bill.paidAt, 45)).sort((a, b) => +new Date(a.paidAt) - +new Date(b.paidAt));
  for (let i = 0; i < close.length; i += 1) {
    for (let j = i + 1; j < close.length; j += 1) {
      if (Number(close[i].totalAmount) + Number(close[j].totalAmount) === amount) return result("paid", [close[i], close[j]]);
      for (let k = j + 1; k < close.length; k += 1) {
        if (Number(close[i].totalAmount) + Number(close[j].totalAmount) + Number(close[k].totalAmount) === amount) return result("paid", [close[i], close[j], close[k]]);
      }
    }
  }
  const open = bills
    .filter((bill) => bill.status !== "paid" && Number(bill.totalAmount) === amount && (near(bill.dueDate, 45) || near(bill.issueDate, 45)))
    .sort((a, b) => new Date(a.dueDate || a.issueDate).getTime() - new Date(b.dueDate || b.issueDate).getTime())[0];
  if (open) return result("open", [open]);
  return null;
}

function yes(value: string) {
  return /^(y|yes|true|1|deducted)$/i.test(value.trim());
}

/** One sheet row as an entry. A negative amount is money going the other way: a refund. */
function rowInput(cell: (field: string) => string, category: AccountCategory | null): EntryInput {
  const raw = cell("amount");
  const signed = parseEntryAmount(raw);
  const refund = signed !== null && signed < 0;
  const monthText = cell("month");
  const month = monthText ? parseMonthKey(monthText) : null;
  if (monthText && !month) throw new AccountsError(`Could not read the month "${monthText}" - write it like Apr 2026.`);
  return {
    category: category?.key || "",
    date: cell("date"),
    amount: refund ? (Math.abs(signed) / 100).toFixed(2) : raw,
    refund,
    amountBasis: /after|net|paid/i.test(cell("basis")) ? "net_paid" : "gross",
    tdsDeducted: category && isPayrollCategory(category.key) ? cell("tds") === "" || yes(cell("tds")) : undefined,
    gst: cell("gst"),
    description: cell("description"),
    counterparty: cell("counterparty"),
    paymentMode: cell("mode"),
    student: cell("student"),
    month: month || undefined,
    // No account column: a payment mode of cash still says where the money went.
    account: /cash/i.test(cell("account") || cell("mode")) ? "cash" : "bank",
  };
}

async function readRows(buffer: Buffer, fileName: string, kind: LedgerImportKind) {
  let rows: string[][];
  try {
    rows = readSpreadsheet(buffer, fileName);
  } catch (error) {
    if (error instanceof SpreadsheetFormatError) throw new AccountsError(error.message);
    throw new AccountsError("Could not read that file. Use the template, saved as .xlsx or .csv.");
  }
  const headerIndex = rows.findIndex((row) => {
    const map = headerMap(row);
    return map.date !== undefined && map.amount !== undefined && (kind === "income" || map.category !== undefined);
  });
  if (headerIndex < 0) {
    throw new AccountsError(`Could not find the header row. It needs: ${LEDGER_TEMPLATES[kind].headers.slice(0, 3).join(", ")}.`);
  }
  return { rows, headerIndex, map: headerMap(rows[headerIndex]) };
}

export async function previewLedgerImport(buffer: Buffer, fileName: string, kind: LedgerImportKind) {
  await dbConnect();
  const { rows, headerIndex, map } = await readRows(buffer, fileName, kind);
  const cell = (row: string[], field: string) => (map[field] === undefined ? "" : String(row[map[field]] ?? "").trim());
  const preview: PreviewRow[] = [];
  const inFile = new Set<string>();
  const usedBills = new Set<string>();

  for (let index = headerIndex + 1; index < rows.length && preview.length < 2000; index += 1) {
    const row = rows[index];
    const line = index + 1;
    if (!row.some((value) => String(value || "").trim())) continue;
    const category = kind === "income" ? resolveCategory(cell(row, "category") || "offline_fees") : resolveCategory(cell(row, "category"));
    const base: PreviewRow = {
      line,
      date: cell(row, "date"),
      category: category?.key || cell(row, "category"),
      amount: 0,
      tdsAmount: 0,
      description: cell(row, "description"),
      counterparty: cell(row, "counterparty"),
      student: cell(row, "student"),
      studentMatched: "",
      account: "bank",
      status: "ok",
      message: "",
    };
    try {
      if (!category) {
        throw new AccountsError(
          cell(row, "category") ? `Unknown category "${cell(row, "category")}" - use a name from the template, e.g. Rent, Marketing, Teacher pay.` : "No category."
        );
      }
      if (category.kind === "income" && kind === "expense") throw new AccountsError("Income in the costs file - use the offline income import.");
      const entry = await buildEntry(rowInput((field) => cell(row, field), category));
      base.date = entry.date.toISOString();
      base.amount = entry.amount;
      base.tdsAmount = entry.tdsAmount;
      base.studentMatched = entry.student ? entry.studentName : "";
      base.account = entry.account;
      if (kind === "income" && base.student && !entry.student) base.message = "Student not found - will be saved without a student link";
      const named = cell(row, "invoice");
      if (entry.category === "offline_fees" && named) {
        // The row says which portal bill it paid - no guessing by amount or date.
        const numbers = named.split(/[+,;]/).map((value) => value.trim()).filter(Boolean);
        const bills: any[] = await Invoice.find({ invoiceNumber: { $in: numbers } }).select("invoiceNumber status totalAmount").lean();
        if (bills.length !== numbers.length) throw new AccountsError(`No portal bill ${numbers.filter((number) => !bills.some((bill) => bill.invoiceNumber === number)).join(", ")}`);
        const ids = bills.map((bill) => String(bill._id));
        ids.forEach((id) => usedBills.add(id));
        base.invoiceIds = ids;
        if (bills.every((bill) => bill.status === "paid")) {
          base.status = entry.account === "cash" ? "in_portal" : "duplicate";
          base.message = entry.account === "cash" ? `Paid in the portal (${numbers.join(" + ")}) - recorded as cash received` : `Already paid in the portal (${numbers.join(" + ")}) - skipped`;
        } else if (bills.length === 1) {
          base.status = "settle";
          base.message = `Will mark portal bill ${numbers[0]} paid (${entry.account === "cash" ? "cash" : "bank"})`;
        } else throw new AccountsError("Name one open bill per row.");
        preview.push(base);
        continue;
      }
      if (entry.category === "offline_fees" && entry.amount > 0 && entry.student) {
        const bill = await portalBillFor(entry.student, entry.amount, entry.date, usedBills);
        for (const id of bill?.ids || []) usedBills.add(id);
        if (bill?.kind === "paid" && entry.account === "cash") {
          // The bill is the revenue; the cash still has to reach the cash book.
          base.status = "in_portal";
          base.invoiceIds = bill.ids;
          base.message = `Paid in the portal (${bill.number}) - revenue counted there; recorded as cash received`;
          preview.push(base);
          continue;
        }
        if (bill?.kind === "paid") {
          base.status = "duplicate";
          base.message = `Already paid in the portal (${bill.number}) - skipped, it is counted from there`;
          preview.push(base);
          continue;
        }
        if (bill?.kind === "open") {
          base.status = "settle";
          base.invoiceIds = bill.ids;
          base.message = `Will mark portal bill ${bill.number} paid (${entry.account === "cash" ? "cash" : "bank"})`;
          preview.push(base);
          continue;
        }
      }

      if (entry.month !== academyMonthOf(entry.date)) base.message = `Counts in ${entry.month}`;
      // Same category, amount, day, account and payer. Two students paying the
      // same fee on the same day, or a cash fee beside a bank fee of the same
      // amount, are different money.
      const who = String(entry.student || entry.studentName || entry.counterparty || entry.description).toLowerCase();
      const key = `${entry.category}|${entry.amount}|${entry.month}|${entry.date.toISOString().slice(0, 10)}|${entry.account}|${who}`;
      const already = await AccountEntry.exists({
        voidedAt: null,
        category: entry.category,
        amount: entry.amount,
        account: entry.account === "cash" ? "cash" : { $ne: "cash" },
        ...(entry.student ? { student: entry.student } : entry.studentName ? { studentName: entry.studentName } : {}),
        date: { $gte: new Date(entry.date.getTime() - 86_400_000), $lte: new Date(entry.date.getTime() + 86_400_000) },
      });
      if (already || inFile.has(key)) {
        base.status = "duplicate";
        base.message = already ? "Already in the ledger - will be skipped" : "Same as an earlier row in this file - will be skipped";
      }
      inFile.add(key);
    } catch (error) {
      if (!(error instanceof AccountsError)) throw error;
      base.status = "error";
      base.message = error.message;
      base.amount = parseEntryAmount(cell(row, "amount")) || 0;
      const date = parseEntryDate(cell(row, "date"));
      if (date) base.date = date.toISOString();
    }
    preview.push(base);
  }
  return preview;
}

export async function commitLedgerImport(
  buffer: Buffer,
  fileName: string,
  kind: LedgerImportKind,
  actorId: string,
  // "other" while a server still runs a Fees schema without the cash mode.
  options: { cashPaymentMode?: "cash" | "other" } = {}
) {
  const preview = await previewLedgerImport(buffer, fileName, kind);
  const { rows, headerIndex, map } = await readRows(buffer, fileName, kind);
  const cell = (row: string[], field: string) => (map[field] === undefined ? "" : String(row[map[field]] ?? "").trim());
  const batch = randomUUID();
  const docs = [];
  let settled = 0;
  for (const item of preview.filter((row) => row.status === "settle" && row.invoiceIds?.length)) {
    // Recorded in Fees, so revenue and the receivable both update from the
    // portal. Back-dated: no "payment received" message to the parent.
    await markInvoicePaid(
      item.invoiceIds![0],
      undefined,
      { actor: actorId, source: "manual_admin", label: "Marked paid from an Accounts import" },
      [{ mode: item.account === "cash" ? options.cashPaymentMode || "cash" : "bank_transfer", amount: item.amount, paidAt: new Date(item.date), referenceNumber: "Accounts import" }],
      {},
      { notifyStudent: false }
    );
    settled += 1;
  }
  for (const item of preview.filter((row) => row.status === "ok")) {
    const row = rows[item.line - 1];
    const category = kind === "income" ? resolveCategory(cell(row, "category") || "offline_fees") : resolveCategory(cell(row, "category"));
    const entry = await buildEntry({ ...rowInput((field) => cell(row, field), category), source: "csv_import", importBatch: batch });
    docs.push({ ...entry, createdBy: actorId, updatedBy: actorId });
  }
  for (const item of preview.filter((row) => row.status === "in_portal" && row.invoiceIds?.length)) {
    const row = rows[item.line - 1];
    const entry = await buildEntry({
      ...rowInput((field) => cell(row, field), resolveCategory("portal_cash_fee")),
      category: "portal_cash_fee",
      source: "csv_import",
      importBatch: batch,
    });
    docs.push({ ...entry, invoices: item.invoiceIds, createdBy: actorId, updatedBy: actorId });
  }
  if (!docs.length && !settled) throw new AccountsError("Nothing to import - every row was a duplicate or had an error.");
  if (docs.length) await AccountEntry.insertMany(docs);
  await recordActivity({
    actor: actorId,
    type: "accounts.ledger.imported",
    label: `Imported ${docs.length} ${kind === "income" ? "offline income" : "cost"} entries from ${fileName}${settled ? ` and marked ${settled} portal bills paid` : ""}`,
    entityType: "AccountEntry",
    entityId: batch,
  });
  return { imported: docs.length, settled, skipped: preview.length - docs.length - settled };
}

