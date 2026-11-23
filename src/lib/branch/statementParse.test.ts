import { describe, expect, it } from "vitest";
import { categoryOf, looksLikeStatement, parseStatement, statementDateOf, statementMonthOf, statementRowKeys } from "./statementParse";
import { parseBranchImport } from "./importParse";

const HEAD = [["Account Statement (01 January 2025 - 24 November 2026)"], ["Date", "Description", "Expense", "Income", "Net Balance"]];
const fee = (date: string, month: string, reg: string, amount = "₹ 1,000") => [date, `Fee Submission for ${month} of Student ID:- ${reg}`, "", amount, ""];

describe("statement cells", () => {
  it("reads day-first dates, short and long months", () => {
    expect(statementDateOf("02-01-2025")).toBe("2025-01-02");
    expect(statementDateOf("2026-11-24")).toBe("2026-11-24");
    expect(statementDateOf("45658")).toBe("2025-01-01");
    expect(statementDateOf("31-13-2025")).toBe("");
    expect(statementMonthOf("Jan 25")).toBe("2025-01");
    expect(statementMonthOf("July 2026")).toBe("2026-07");
    expect(statementMonthOf("Smarch 25")).toBe("");
  });

  it("guesses a category from the wording", () => {
    expect(categoryOf("Teacher Cost Sayan Bose", "expense")).toBe("teacher");
    expect(categoryOf("Ambarish fees", "expense")).toBe("teacher");
    expect(categoryOf("Employee Salary Payment ID:- 241450", "expense")).toBe("salary");
    expect(categoryOf("SMS Charges for SEP 25 by bank", "expense")).toBe("bank");
    expect(categoryOf("Withdrawl to Myself", "expense")).toBe("withdrawal");
    expect(categoryOf("Tournament fees", "income")).toBe("tournament");
    expect(categoryOf("Aditya fees", "income")).toBe("other_income");
    expect(categoryOf("Fee deleted of student ID:- ECA-2025-3650 for month July 2025", "expense")).toBe("fee_correction");
  });
});

describe("parseStatement", () => {
  it("keeps every row and adds up like the sheet", () => {
    const plan = parseStatement([
      ...HEAD,
      ["02-01-2025", "Equipments", "₹ 5,530", "", "₹ -5,530"],
      fee("04-01-2025", "Jan 25", "ECA-2025-5347"),
      ["05-01-2025", "Tournament fees", "", "₹ 300", ""],
      ["", "Totals", "₹ 5,530", "₹ 1,300", ""],
    ]);
    expect(plan.rows).toHaveLength(3);
    expect(plan.totals).toEqual({ income: 1300, expense: 5530 });
    expect(plan.months).toEqual([{ regNo: "ECA-2025-5347", month: "2025-01", payments: [{ amount: 1000, date: "2025-01-04" }], blankRows: 0, unmatchedCorrections: 0 }]);
  });

  it("lets a 'fee deleted' row take back the duplicate payment, even when it comes first", () => {
    const plan = parseStatement([
      ...HEAD,
      ["01-07-2026", "Fee deleted of student ID:-  ECA-2026-9906 for July 2026", "₹ 1,000", "", ""],
      fee("02-07-2026", "Jul 26", "ECA-2026-9906"),
      fee("03-07-2026", "Jul 26", "ECA-2026-9906"),
    ]);
    const july = plan.months.find((entry) => entry.month === "2026-07")!;
    expect(july.payments).toEqual([{ amount: 1000, date: "2026-07-02" }]);
    expect(plan.rows.filter((row) => row.category === "fee_correction")).toHaveLength(1);
  });

  it("keeps two real payments for one month", () => {
    const plan = parseStatement([...HEAD, fee("04-04-2026", "Apr 26", "ECA-2026-9881", "₹ 1,500"), fee("20-04-2026", "Apr 26", "ECA-2026-9881", "₹ 500")]);
    expect(plan.months[0].payments.map((payment) => payment.amount)).toEqual([1500, 500]);
  });

  it("keeps blank and nameless fee rows in the cashbook but not as a payment", () => {
    const plan = parseStatement([...HEAD, fee("24-11-2026", "Nov 26", "ECA-2026-9894", ""), fee("06-06-2026", "Jun 26", "", "₹ 1,000")]);
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0]).toMatchObject({ amount: 0, kind: "income", category: "fee" });
    expect(plan.months[0]).toMatchObject({ regNo: "ECA-2026-9894", payments: [], blankRows: 1 });
    expect(plan.skipped).toHaveLength(1);
  });

  it("gives identical rows different keys, the same on every run", () => {
    const rows = parseStatement([...HEAD, ["01-01-2025", "Pens", "₹ 50", "", ""], ["01-01-2025", "Pens", "₹ 50", "", ""]]).rows;
    const keys = statementRowKeys(rows);
    expect(new Set(keys).size).toBe(2);
    expect(statementRowKeys(rows)).toEqual(keys);
  });
});

describe("parseBranchImport with a statement", () => {
  const list = [
    ["Envision Chess Academy"],
    ["Reg #", "Student Name", "Father Name", "Class", "Fee Remaining", "Phone"],
    ["ECA-2025-5347", "Rajdeep Pandit", "Suman Kalyan Pandit", "Saturday Beginner 4pm", "Paid", "919062071530"],
  ];

  it("bills listed students from their payments and leaves the others to Accounts", () => {
    expect(looksLikeStatement(HEAD)).toBe(true);
    const plan = parseBranchImport(list, [...HEAD, fee("04-01-2025", "Jan 25", "ECA-2025-5347"), fee("04-02-2025", "Feb 25", "ECA-2025-5347"), fee("04-01-2025", "Jan 25", "ECA-2025-4404")]);
    expect(plan.format).toBe("statement");
    expect(plan.students).toHaveLength(1);
    expect(plan.students[0]).toMatchObject({ regNo: "ECA-2025-5347", active: true, monthlyFee: 1000, firstMonth: "2025-01", lastMonth: "2025-02", reportOwed: 0 });
    expect(plan.feeOnly).toEqual([{ regNo: "ECA-2025-4404", months: 1, paid: 1000, firstMonth: "2025-01", lastMonth: "2025-01" }]);
    expect(plan.cash).toHaveLength(3);
  });
});
