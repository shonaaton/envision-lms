/**
 * Turning a bank statement export into transactions. Pure: header detection,
 * amounts and the duplicate key are unit-tested against the shapes Indian banks
 * actually export (HDFC, ICICI, SBI, Axis, Kotak all differ).
 */

import { parseEntryAmount, parseEntryDate } from "@/lib/accounts/entryInput";

export type StatementColumn = "date" | "narration" | "reference" | "debit" | "credit" | "amount" | "type" | "balance" | "label";

export type ColumnMap = Partial<Record<StatementColumn, number>>;

export type ParsedTransaction = {
  date: Date;
  narration: string;
  reference: string;
  /** Paise, both positive; exactly one is non-zero. */
  debit: number;
  credit: number;
  balance: number | null;
  /** The admin's own note for the row, typed into a spare column of the statement ("teacher fees previous month"). */
  label: string;
  hash: string;
  line: number;
};

export type StatementParse = {
  headerRow: number;
  columns: ColumnMap;
  transactions: ParsedTransaction[];
  skipped: { line: number; reason: string }[];
};

export class StatementFormatError extends Error {}

function squash(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

// Most specific first: "value date" must lose to "txn date" when both exist,
// and "withdrawal amt" must not be read as a plain "amount" column.
const ALIASES: Record<StatementColumn, string[]> = {
  date: ["txndate", "transactiondate", "trandate", "date", "postingdate", "valuedate", "valuedt", "txndt"],
  narration: ["narration", "description", "particulars", "transactiondetails", "transactionremarks", "remarks", "details", "transactiondescription"],
  reference: ["chqrefno", "refnochequeno", "chequeno", "chqno", "refno", "referenceno", "reference", "utr", "utrno", "chequenumber", "instrumentid"],
  debit: ["withdrawalamt", "withdrawalamount", "withdrawal", "withdrawals", "debitamount", "debit", "amountdebited", "dr", "debitamt"],
  credit: ["depositamt", "depositamount", "deposit", "deposits", "creditamount", "credit", "amountcredited", "cr", "creditamt"],
  amount: ["transactionamount", "amount", "amt", "amountinr"],
  type: ["drcr", "crdr", "debitcredit", "transactiontype", "type"],
  balance: ["closingbalance", "balance", "availablebalance", "runningbalance", "balanceinr"],
  label: ["label", "category", "mycategory", "tag", "note", "notes", "comment", "comments", "head", "purpose"],
};

function columnFor(headers: string[], column: StatementColumn, taken: Set<number>) {
  for (const alias of ALIASES[column]) {
    const index = headers.findIndex((header, position) => !taken.has(position) && header === alias);
    if (index >= 0) return index;
  }
  // Loose pass: "Withdrawal Amt.(INR)" squashes to "withdrawalamtinr".
  for (const alias of ALIASES[column]) {
    if (alias.length < 4) continue;
    const index = headers.findIndex((header, position) => !taken.has(position) && header.startsWith(alias));
    if (index >= 0) return index;
  }
  return -1;
}

export function detectColumns(row: string[]): ColumnMap | null {
  const headers = row.map(squash);
  const taken = new Set<number>();
  const map: ColumnMap = {};
  // Debit and credit before amount, so "amount" never claims a withdrawal column.
  for (const column of ["date", "debit", "credit", "balance", "narration", "reference", "type", "amount", "label"] as StatementColumn[]) {
    const index = columnFor(headers, column, taken);
    if (index >= 0) {
      map[column] = index;
      taken.add(index);
    }
  }
  const hasMoney = (map.debit !== undefined && map.credit !== undefined) || map.amount !== undefined;
  if (map.date === undefined || !hasMoney) return null;
  return map;
}

/** The header is somewhere in the first rows, under the bank's letterhead and account summary. */
export function findHeader(rows: string[][]): { index: number; columns: ColumnMap } | null {
  for (let index = 0; index < Math.min(rows.length, 60); index += 1) {
    const columns = detectColumns(rows[index]);
    if (columns) return { index, columns };
  }
  return null;
}

function fnv(text: string, seed: number) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * The same bank row, recognised when a later statement overlaps an earlier one.
 * Two identical rows on one day (two ₹500 UPI fees from the same parent) differ
 * by running balance; without a balance column, `occurrence` tells them apart.
 */
export function transactionHash(row: { date: Date; narration: string; reference: string; debit: number; credit: number; balance: number | null }, occurrence = 0) {
  const day = new Date(row.date.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const key = [day, row.debit, row.credit, row.reference.trim().toLowerCase(), row.narration.replace(/\s+/g, " ").trim().toLowerCase(), row.balance ?? "", occurrence].join("|");
  return `${fnv(key, 0x811c9dc5)}${fnv(key, 0x01234567)}`;
}

function cell(row: string[], index: number | undefined) {
  return index === undefined ? "" : String(row[index] ?? "").trim();
}

/**
 * A column with no heading, right of the bank's own columns, holding words on
 * most rows: the admin's own labels typed beside the statement (HDFC leaves
 * the eighth column blank, and that is where the academy writes "student fees").
 */
function spareTextColumn(rows: string[][], columns: ColumnMap): number | null {
  const used = new Set(Object.values(columns));
  const last = Math.max(...Object.values(columns).map((value) => Number(value)));
  const width = Math.max(0, ...rows.map((row) => row.length));
  for (let index = last + 1; index < width; index += 1) {
    if (used.has(index)) continue;
    const values = rows.map((row) => String(row[index] ?? "").trim());
    const words = values.filter((value) => /[a-z]{3}/i.test(value) && parseEntryAmount(value) === null);
    if (words.length >= Math.max(2, rows.length * 0.3)) return index;
  }
  return null;
}

export function parseStatementRows(rows: string[][], override?: ColumnMap): StatementParse {
  const found = override ? { index: -1, columns: override } : findHeader(rows);
  if (!found) {
    throw new StatementFormatError(
      "Could not find the header row. The statement needs a Date column and either Debit/Withdrawal and Credit/Deposit columns or an Amount column."
    );
  }
  const columns = { ...found.columns };
  if (columns.label === undefined) {
    const spare = spareTextColumn(rows.slice(found.index + 1, found.index + 81), columns);
    if (spare !== null) columns.label = spare;
  }
  const transactions: ParsedTransaction[] = [];
  const skipped: { line: number; reason: string }[] = [];
  const seen = new Map<string, number>();

  for (let index = found.index + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const line = index + 1;
    const rawDate = cell(row, columns.date);
    const date = parseEntryDate(rawDate);
    if (!date) {
      // Opening balance lines, page footers, "*** End of statement ***".
      if (row.some((value) => String(value || "").trim())) skipped.push({ line, reason: rawDate ? `Unreadable date "${rawDate}"` : "No date" });
      continue;
    }

    let debit = 0;
    let credit = 0;
    if (columns.debit !== undefined && columns.credit !== undefined) {
      debit = Math.abs(parseEntryAmount(cell(row, columns.debit)) || 0);
      credit = Math.abs(parseEntryAmount(cell(row, columns.credit)) || 0);
    } else {
      const raw = cell(row, columns.amount);
      const amount = parseEntryAmount(raw) || 0;
      const type = squash(cell(row, columns.type));
      const marker = type || squash(raw.slice(-2));
      if (marker.startsWith("dr") || marker.startsWith("debit") || marker === "d") debit = Math.abs(amount);
      else if (marker.startsWith("cr") || marker.startsWith("credit") || marker === "c") credit = Math.abs(amount);
      else if (amount < 0) debit = -amount;
      else credit = amount;
    }
    if (!debit && !credit) {
      skipped.push({ line, reason: "No amount" });
      continue;
    }
    if (debit && credit) {
      skipped.push({ line, reason: "Both debit and credit filled in" });
      continue;
    }

    const balanceRaw = cell(row, columns.balance);
    const balance = balanceRaw ? parseEntryAmount(balanceRaw) : null;
    const narration = cell(row, columns.narration).slice(0, 500);
    const reference = cell(row, columns.reference).replace(/^0+$/, "").slice(0, 120);
    const base = { date, narration, reference, debit, credit, balance };
    // The label is left out of the hash: re-uploading after relabelling a row
    // must still be recognised as the same bank row.
    const baseHash = transactionHash(base);
    const occurrence = seen.get(baseHash) || 0;
    seen.set(baseHash, occurrence + 1);
    const label = cell(row, columns.label).slice(0, 120);
    transactions.push({ ...base, label, hash: occurrence ? transactionHash(base, occurrence) : baseHash, line });
  }

  if (!transactions.length) throw new StatementFormatError("No transactions found under the header row.");
  return { headerRow: found.index, columns, transactions, skipped };
}

/**
 * Words in a narration worth remembering as a rule: the payee part of a UPI or
 * NEFT narration, without the reference numbers and bank codes around it.
 * "UPI/DR/412345678901/CESC LIMITED/YESB/cesc@ybl" -> "cesc limited".
 */
export function suggestRulePattern(narration: string) {
  const parts = narration
    .toLowerCase()
    .split(/[\/\-|:*]+/)
    .map((part) => part.replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 3 && !/^(upi|neft|imps|rtgs|ach|nach|pos|dr|cr|inb|mb|ib|ecs|bil|onl|txn|ref|payment|paid|to|from|transfer|trf)$/.test(part));
  const best = parts.sort((a, b) => b.length - a.length)[0] || "";
  return best.slice(0, 40);
}
