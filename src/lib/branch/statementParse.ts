/**
 * Reads the centre's account statement: the cashbook it kept before the portal
 * ("Date, Description, Expense, Income, Net Balance"). Every row is kept as a
 * cashbook line, and the fee rows also become each student's monthly fee
 * history:
 *
 *  - "Fee Submission for Jan 25 of Student ID:- ECA-2025-5347" (income) is a
 *    payment for that student and month;
 *  - "Fee deleted of student ID:- ECA-2025-3650 for month July 2025" (an
 *    expense) takes back a payment recorded twice by mistake;
 *  - every other row is an expense or other income of the centre.
 *
 * Pure: rows of text in, rows and fee months out. Amounts are rupees here.
 */

export type CashCategory =
  | "fee"
  | "fee_correction"
  | "other_income"
  | "teacher"
  | "salary"
  | "tech"
  | "supplies"
  | "travel"
  | "food"
  | "marketing"
  | "tournament"
  | "refund"
  | "bank"
  | "deposit"
  | "withdrawal"
  | "other";

export const CASH_CATEGORIES: { key: CashCategory; label: string }[] = [
  { key: "fee", label: "Student fee" },
  { key: "fee_correction", label: "Fee correction" },
  { key: "other_income", label: "Other income" },
  { key: "teacher", label: "Teacher cost" },
  { key: "salary", label: "Salary" },
  { key: "tech", label: "Tech, phone and internet" },
  { key: "supplies", label: "Equipment and supplies" },
  { key: "travel", label: "Travel" },
  { key: "food", label: "Food" },
  { key: "marketing", label: "Marketing" },
  { key: "tournament", label: "Tournament" },
  { key: "refund", label: "Refund" },
  { key: "bank", label: "Bank charges" },
  { key: "deposit", label: "Deposit / savings" },
  { key: "withdrawal", label: "Withdrawal" },
  { key: "other", label: "Other" },
];

export function isCashCategory(value: unknown): value is CashCategory {
  return CASH_CATEGORIES.some((entry) => entry.key === value);
}

export type CashRow = {
  /** Row number in the sheet, 1-based, for messages. */
  row: number;
  date: string; // "YYYY-MM-DD"
  kind: "income" | "expense";
  amount: number; // rupees, 0 when the sheet left it blank
  description: string;
  category: CashCategory;
  regNo: string;
  month: string; // "YYYY-MM" on fee rows
};

export type StatementPayment = { amount: number; date: string };
export type StatementMonth = {
  regNo: string;
  month: string;
  payments: StatementPayment[];
  /** Rows for the month that carried no amount. */
  blankRows: number;
  /** Corrections that found no payment to take back. */
  unmatchedCorrections: number;
};

export type StatementPlan = {
  rows: CashRow[];
  months: StatementMonth[];
  skipped: { row: number; reason: string }[];
  totals: { income: number; expense: number };
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** True when the header row is the statement's, not the old fees report's. */
export function looksLikeStatement(rows: string[][]) {
  return rows.slice(0, 15).some((row) => {
    const cells = row.map((cell) => String(cell || "").trim().toLowerCase());
    return cells.includes("description") && (cells.includes("income") || cells.includes("expense"));
  });
}

/** "Jan 25", "January 2025", "July 2026" to "2025-01". */
export function statementMonthOf(value: string) {
  const match = value.trim().toLowerCase().match(/^([a-z]{3})[a-z]*[\s\-/']+(\d{2}|\d{4})$/);
  if (!match || !MONTHS.includes(match[1])) return "";
  const year = match[2].length === 2 ? `20${match[2]}` : match[2];
  return `${year}-${String(MONTHS.indexOf(match[1]) + 1).padStart(2, "0")}`;
}

/** "02-01-2025" (day first), "2025-01-02", or an Excel day number, to "2025-01-02". */
export function statementDateOf(value: unknown) {
  const text = String(value ?? "").trim();
  let match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return "";
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(text)) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  return "";
}

/** "₹ 1,500", "1500.50". NaN when the cell is not an amount; 0 for a blank cell. */
export function statementAmountOf(value: unknown) {
  const text = String(value ?? "").replace(/[₹,\s]|rs\.?/gi, "");
  if (!text) return 0;
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
}

const FEE = /^fee\s+submission\s+for\s+(.+?)\s+of\s+student\s+id\s*:?-?\s*(.*)$/i;
const CORRECTION = /^fee\s+deleted\s+of\s+student\s+id\s*:?-?\s*(.*?)\s+for\s+(?:month\s+)?(.+)$/i;
const REG = /ECA-\d{4}-\d{3,5}/i;

/** A best guess from the description; staff can change it on the Accounts page. */
export function categoryOf(description: string, kind: "income" | "expense"): CashCategory {
  const text = description.toLowerCase();
  if (FEE.test(description)) return "fee";
  if (CORRECTION.test(description)) return "fee_correction";
  if (/tournament/.test(text)) return "tournament";
  if (kind === "income") return "other_income";
  if (/refund/.test(text)) return "refund";
  if (/salary/.test(text)) return "salary";
  if (/teach|coach|substitution|\bsir\b|\bfees?\b/.test(text)) return "teacher";
  if (/withdraw/.test(text)) return "withdrawal";
  if (/recurring deposit|\bfd\b|\brd\b/.test(text)) return "deposit";
  if (/sms|ledger|folio|bank|imps|neft|charges/.test(text)) return "bank";
  if (/tech|website|domain|internet|subscription|recharge|number|software/.test(text)) return "tech";
  if (/equipment|pen|paper|print|priner|router|board|book|stationery/.test(text)) return "supplies";
  if (/travel|petrol|hotel|cab|taxi|fuel/.test(text)) return "travel";
  if (/food|snack|tea/.test(text)) return "food";
  if (/marketing|advert|flyer|banner/.test(text)) return "marketing";
  return "other";
}

export function parseStatement(rows: string[][]): StatementPlan {
  let headerIndex = -1;
  const columns = { date: -1, description: -1, expense: -1, income: -1 };
  for (let index = 0; index < Math.min(rows.length, 15) && headerIndex < 0; index += 1) {
    const cells = rows[index].map((cell) => String(cell || "").trim().toLowerCase());
    const description = cells.indexOf("description");
    if (description < 0) continue;
    headerIndex = index;
    columns.description = description;
    columns.date = cells.findIndex((cell) => /^date/.test(cell));
    columns.expense = cells.findIndex((cell) => /^expense|^debit|^withdrawal/.test(cell));
    columns.income = cells.findIndex((cell) => /^income|^credit|^deposit/.test(cell));
  }
  if (headerIndex < 0 || columns.date < 0 || (columns.expense < 0 && columns.income < 0)) {
    throw new Error("The account statement has no header row with Date, Description, Expense and Income.");
  }

  const cell = (row: string[], index: number) => (index >= 0 ? String(row[index] ?? "").trim() : "");
  const out: CashRow[] = [];
  const skipped: StatementPlan["skipped"] = [];
  const months = new Map<string, StatementMonth>();
  const monthFor = (regNo: string, month: string) => {
    const key = `${regNo}|${month}`;
    if (!months.has(key)) months.set(key, { regNo, month, payments: [], blankRows: 0, unmatchedCorrections: 0 });
    return months.get(key)!;
  };
  const corrections: { regNo: string; month: string; amount: number; row: number }[] = [];

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const at = headerIndex + offset + 2;
    if (!row.some((value) => String(value || "").trim())) return;
    const description = cell(row, columns.description).replace(/\s+/g, " ");
    if (/^totals?$/i.test(description) && !cell(row, columns.date)) return;
    const date = statementDateOf(cell(row, columns.date));
    if (!date) return skipped.push({ row: at, reason: `Date "${cell(row, columns.date)}" not understood (${description || "no description"})` });
    const expense = statementAmountOf(cell(row, columns.expense));
    const income = statementAmountOf(cell(row, columns.income));
    if (Number.isNaN(expense) || Number.isNaN(income)) return skipped.push({ row: at, reason: `${date} ${description}: amount not understood` });

    const fee = description.match(FEE);
    const correction = description.match(CORRECTION);
    // A row says which side it is on by its amount; a blank fee row is a payment that was never filled in.
    const kind: "income" | "expense" = expense > 0 && !income ? "expense" : income > 0 ? "income" : correction ? "expense" : fee ? "income" : "expense";
    const amount = kind === "income" ? income : expense;
    const regNo = ((fee?.[2] || correction?.[1] || "").toUpperCase().match(REG) || [""])[0];
    const month = fee ? statementMonthOf(fee[1]) : correction ? statementMonthOf(correction[2]) : "";
    out.push({ row: at, date, kind, amount, description, category: categoryOf(description, kind), regNo, month });

    if (fee) {
      if (!regNo) return skipped.push({ row: at, reason: `${date} "${description}": no registration number, so it stays in Accounts only` });
      if (!month) return skipped.push({ row: at, reason: `${date} ${regNo}: fee month "${fee[1]}" not understood, so it stays in Accounts only` });
      const entry = monthFor(regNo, month);
      if (amount > 0 && kind === "income") entry.payments.push({ amount, date });
      else entry.blankRows += 1;
    } else if (correction && regNo && month && amount > 0) {
      corrections.push({ regNo, month, amount, row: at });
    }
  });

  // Corrections run after every payment is in, since a deletion can sit above the row it undoes.
  for (const fix of corrections) {
    const entry = months.get(`${fix.regNo}|${fix.month}`);
    if (!entry?.payments.length) {
      monthFor(fix.regNo, fix.month).unmatchedCorrections += 1;
      continue;
    }
    let index = -1;
    for (let at = entry.payments.length - 1; at >= 0; at -= 1) {
      if (entry.payments[at].amount === fix.amount) {
        index = at;
        break;
      }
    }
    if (index >= 0) {
      entry.payments.splice(index, 1);
      continue;
    }
    // No payment of the same amount: take it off the latest ones.
    let left = fix.amount;
    for (let at = entry.payments.length - 1; at >= 0 && left > 0; at -= 1) {
      const take = Math.min(left, entry.payments[at].amount);
      entry.payments[at].amount -= take;
      left -= take;
    }
    entry.payments = entry.payments.filter((payment) => payment.amount > 0);
    if (left > 0) entry.unmatchedCorrections += 1;
  }

  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    rows: out,
    months: [...months.values()].sort((a, b) => a.regNo.localeCompare(b.regNo) || a.month.localeCompare(b.month)),
    skipped,
    totals: {
      income: round(out.filter((row) => row.kind === "income").reduce((sum, row) => sum + row.amount, 0)),
      expense: round(out.filter((row) => row.kind === "expense").reduce((sum, row) => sum + row.amount, 0)),
    },
  };
}

/**
 * A key that names a statement row however often the import runs: the same
 * date, side, amount and description, and how many such rows came before it.
 */
export function statementRowKeys(rows: CashRow[]) {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = `${row.date}|${row.kind}|${Math.round(row.amount * 100)}|${row.description.toLowerCase()}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return `statement:${base}|${n}`;
  });
}
