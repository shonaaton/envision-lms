/**
 * Reads the two sheets the Bowbazar centre kept before the portal:
 *
 *  - the student list ("Sr, Reg #, Student Name, Father Name, Class, Fee
 *    Remaining, Phone") - everyone on it is a current student;
 *  - the fees report ("Sr#, Date, Reg No, Student Name, Class, Fee Month,
 *    Total, Paid, Balance") - one row per student per month, which also names
 *    the students who have since left.
 *
 * Pure: rows of text in, a plan out. lib/branch/import.ts turns the plan into
 * records. Amounts here are rupees as the sheets have them; paise only at the
 * database edge.
 */

export type ImportBill = {
  month: string; // "YYYY-MM"
  total: number;
  paid: number;
  date: string | null; // "YYYY-MM-DD", the day the old system recorded the row
  receipt: string;
};

export type ImportStudent = {
  regNo: string;
  name: string;
  fatherName: string;
  phone: string;
  className: string;
  active: boolean;
  /** What the student list says is still owed: 0 for "Paid", null when blank. */
  listRemaining: number | null;
  /** Balance the fees report adds up to. */
  reportOwed: number;
  monthlyFee: number;
  firstMonth: string | null;
  lastMonth: string | null;
  bills: ImportBill[];
};

export type ImportPlan = {
  students: ImportStudent[];
  classes: { name: string; active: number; total: number }[];
  skipped: { sheet: "students" | "report"; row: number; reason: string }[];
};

export class ImportFormatError extends Error {}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function regNoOf(value: unknown) {
  const match = String(value ?? "").toUpperCase().match(/ECA-\d{4}-\d{3,5}/);
  return match ? match[0] : "";
}

/** "Jun-2026", "June 2026", "2026-06" or "06/2026" to "2026-06". */
export function feeMonthOf(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  let match = text.match(/^([a-z]{3})[a-z]*[\s\-/']+(\d{4})$/);
  if (match && MONTHS.includes(match[1])) return `${match[2]}-${String(MONTHS.indexOf(match[1]) + 1).padStart(2, "0")}`;
  match = text.match(/^(\d{4})-(\d{1,2})$/) || null;
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}`;
  match = text.match(/^(\d{1,2})[/-](\d{4})$/);
  if (match) return `${match[2]}-${match[1].padStart(2, "0")}`;
  return "";
}

/** "31-May-2026" or "2026-05-31" to "2026-05-31". */
export function dayOf(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  let match = text.match(/^(\d{1,2})[\s\-/]([a-z]{3})[a-z]*[\s\-/](\d{4})$/);
  if (match && MONTHS.includes(match[2])) return `${match[3]}-${String(MONTHS.indexOf(match[2]) + 1).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return null;
}

/** "₹ 1,500", "1500", "Paid" (= 0). NaN when it is not an amount. */
export function rupeesOf(value: unknown) {
  const text = String(value ?? "").trim();
  if (/^(paid|nil|none|-)$/i.test(text)) return 0;
  const cleaned = text.replace(/[₹,\s]|rs\.?/gi, "");
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : NaN;
}

/** An Indian mobile as the portal stores it: ten digits, no +91. */
export function phoneOf(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** "RAJARSHI ROY" reads better as "Rajarshi Roy"; mixed case is left alone. */
export function tidyName(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text || text !== text.toUpperCase() && text !== text.toLowerCase()) return text;
  return text.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** Finds the header row (the first with every required label) and the column of each field. */
function locate<F extends Record<string, RegExp>>(rows: string[][], fields: F, required: (keyof F)[], sheet: string) {
  for (let index = 0; index < Math.min(rows.length, 15); index += 1) {
    const cells = rows[index].map((cell) => String(cell || "").trim().toLowerCase());
    const columns = {} as Record<keyof F, number>;
    for (const key of Object.keys(fields) as (keyof F)[]) {
      columns[key] = cells.findIndex((cell) => fields[key].test(cell));
    }
    if (required.every((key) => columns[key] >= 0)) return { headerIndex: index, columns };
  }
  throw new ImportFormatError(`The ${sheet} has no header row with ${required.join(", ")}.`);
}

const STUDENT_FIELDS = {
  reg: /^reg/,
  name: /student\s*name|^name$/,
  father: /father/,
  className: /^class|batch/,
  remaining: /remaining|due|balance/,
  phone: /phone|mobile|contact/,
};
const REPORT_FIELDS = {
  date: /^date/,
  sr: /^sr/,
  reg: /^reg/,
  name: /student\s*name|^name$/,
  className: /^class|batch/,
  month: /month/,
  total: /^total|^fee$|amount/,
  paid: /^paid/,
  balance: /balance/,
};

/** The fee a student pays now: the commonest monthly total after their first month, latest on a tie. */
export function usualFee(bills: ImportBill[]) {
  const sorted = [...bills].sort((a, b) => a.month.localeCompare(b.month));
  const pool = (sorted.length > 1 ? sorted.slice(1) : sorted).filter((bill) => bill.total > 0);
  if (!pool.length) return 0;
  const counts = new Map<number, { count: number; latest: string }>();
  for (const bill of pool) {
    const entry = counts.get(bill.total) || { count: 0, latest: "" };
    counts.set(bill.total, { count: entry.count + 1, latest: bill.month > entry.latest ? bill.month : entry.latest });
  }
  return [...counts.entries()].sort((a, b) => b[1].count - a[1].count || b[1].latest.localeCompare(a[1].latest))[0][0];
}

export function parseBranchImport(studentRows: string[][], reportRows: string[][]): ImportPlan {
  const skipped: ImportPlan["skipped"] = [];
  const list = locate(studentRows, STUDENT_FIELDS, ["reg", "name"], "student list");
  const report = locate(reportRows, REPORT_FIELDS, ["reg", "month", "total", "paid"], "fees report");
  const cell = (row: string[], index: number) => (index >= 0 ? String(row[index] ?? "").trim() : "");

  const students = new Map<string, ImportStudent>();
  const blank = (regNo: string): ImportStudent => ({
    regNo,
    name: "",
    fatherName: "",
    phone: "",
    className: "",
    active: false,
    listRemaining: null,
    reportOwed: 0,
    monthlyFee: 0,
    firstMonth: null,
    lastMonth: null,
    bills: [],
  });

  studentRows.slice(list.headerIndex + 1).forEach((row, offset) => {
    const at = list.headerIndex + offset + 2;
    if (!row.some((value) => String(value || "").trim())) return;
    const c = list.columns;
    const regNo = regNoOf(cell(row, c.reg));
    if (!regNo) return skipped.push({ sheet: "students", row: at, reason: `No registration number ("${cell(row, c.reg)}")` });
    if (students.has(regNo)) return skipped.push({ sheet: "students", row: at, reason: `${regNo} is listed twice` });
    const remaining = rupeesOf(cell(row, c.remaining));
    students.set(regNo, {
      ...blank(regNo),
      name: tidyName(cell(row, c.name)),
      fatherName: tidyName(cell(row, c.father)),
      phone: phoneOf(cell(row, c.phone)),
      className: cell(row, c.className).replace(/\s+/g, " "),
      active: true,
      listRemaining: cell(row, c.remaining) && !Number.isNaN(remaining) ? remaining : null,
    });
  });

  const seen = new Set<string>();
  reportRows.slice(report.headerIndex + 1).forEach((row, offset) => {
    const at = report.headerIndex + offset + 2;
    if (!row.some((value) => String(value || "").trim())) return;
    const c = report.columns;
    const regNo = regNoOf(cell(row, c.reg));
    const month = feeMonthOf(cell(row, c.month));
    const total = rupeesOf(cell(row, c.total));
    const paid = rupeesOf(cell(row, c.paid));
    if (!regNo) return skipped.push({ sheet: "report", row: at, reason: `No registration number (${cell(row, c.month) || "no month"}, ₹${cell(row, c.paid) || 0} paid)` });
    if (!month) return skipped.push({ sheet: "report", row: at, reason: `${regNo}: fee month "${cell(row, c.month)}" not understood` });
    if (Number.isNaN(total) || Number.isNaN(paid)) return skipped.push({ sheet: "report", row: at, reason: `${regNo} ${month}: amounts not understood` });
    if (seen.has(`${regNo}|${month}`)) return skipped.push({ sheet: "report", row: at, reason: `${regNo} has ${month} twice; the first row was kept` });
    seen.add(`${regNo}|${month}`);
    const student = students.get(regNo) || blank(regNo);
    if (!student.active) {
      // Former students take their name and class from their latest row.
      if (!student.lastMonth || month >= student.lastMonth) {
        student.name = tidyName(cell(row, c.name)) || student.name;
        student.className = cell(row, c.className).replace(/\s+/g, " ") || student.className;
      }
    }
    student.bills.push({ month, total, paid, date: dayOf(cell(row, c.date)), receipt: cell(row, c.sr) });
    student.firstMonth = !student.firstMonth || month < student.firstMonth ? month : student.firstMonth;
    student.lastMonth = !student.lastMonth || month > student.lastMonth ? month : student.lastMonth;
    students.set(regNo, student);
  });

  const all = [...students.values()].map((student) => ({
    ...student,
    name: student.name || student.regNo,
    bills: student.bills.sort((a, b) => a.month.localeCompare(b.month)),
    reportOwed: student.bills.reduce((sum, bill) => sum + Math.max(0, bill.total - bill.paid), 0),
    monthlyFee: usualFee(student.bills),
  }));
  const classes = new Map<string, { name: string; active: number; total: number }>();
  for (const student of all) {
    if (!student.className) continue;
    const entry = classes.get(student.className) || { name: student.className, active: 0, total: 0 };
    entry.total += 1;
    if (student.active) entry.active += 1;
    classes.set(student.className, entry);
  }
  return {
    students: all.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
    classes: [...classes.values()].sort((a, b) => b.active - a.active || b.total - a.total || a.name.localeCompare(b.name)),
    skipped,
  };
}

const DAY_WORDS: [RegExp, number][] = [
  [/\bsun(day)?\b/, 0],
  [/\bmon(day)?\b/, 1],
  [/\btue(s|sday)?\b/, 2],
  [/\bwed(nesday)?\b/, 3],
  [/\bthu(rs|rsday)?\b/, 4],
  [/\bfri(day)?\b/, 5],
  [/\bsat(urday)?\b/, 6],
];

/**
 * Slots an old class name points at: its days, at the time it names. "Saturday
 * Sunday 12pm" is two slots; "Saturday Beginner 4pm" is the slot running at
 * 4pm. A class with no time, or a day with no slot at that time, gets nothing
 * and is left for a person to choose.
 */
export function guessSlots(className: string, slots: { id: string; dayOfWeek: number; startTime: string; endTime: string }[]) {
  const text = className.toLowerCase();
  const days = DAY_WORDS.filter(([pattern]) => pattern.test(text)).map(([, day]) => day);
  const time = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (!days.length || !time) return [];
  let hours = Number(time[1]) % 12;
  if (time[3] === "pm") hours += 12;
  const at = `${String(hours).padStart(2, "0")}:${time[2] || "00"}`;
  const chosen = days.map((day) => slots.find((slot) => slot.dayOfWeek === day && slot.startTime <= at && at < slot.endTime));
  return chosen.every(Boolean) ? chosen.map((slot) => slot!.id) : [];
}
