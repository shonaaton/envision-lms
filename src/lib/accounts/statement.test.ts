import { describe, expect, it } from "vitest";

import { parseEntryAmount, parseEntryDate, teacherPayAmounts } from "@/lib/accounts/entryInput";
import { detectColumns, parseStatementRows, suggestRulePattern, StatementFormatError } from "@/lib/accounts/statement";
import { parseCsv, parseHtmlTableRows, readSpreadsheet, SpreadsheetFormatError } from "@/lib/sheetReader";

const istDay = (date: Date | null) => (date ? new Date(date.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) : null);

describe("parseEntryAmount", () => {
  it("reads Indian formats to paise", () => {
    expect(parseEntryAmount("1,20,000.50")).toBe(12_000_050);
    expect(parseEntryAmount("₹ 450")).toBe(45_000);
    expect(parseEntryAmount("Rs.99.9")).toBe(9_990);
    expect(parseEntryAmount("(300)")).toBe(-30_000);
    expect(parseEntryAmount("-12")).toBe(-1_200);
    expect(parseEntryAmount("2,500.00 Cr")).toBe(250_000);
    expect(parseEntryAmount("")).toBeNull();
    expect(parseEntryAmount("abc")).toBeNull();
    expect(parseEntryAmount(12.5)).toBe(1_250);
  });
});

describe("parseEntryDate", () => {
  it("reads day-first Indian dates in Kolkata, never month-first", () => {
    expect(istDay(parseEntryDate("03/04/2026"))).toBe("2026-04-03");
    expect(istDay(parseEntryDate("03-04-26"))).toBe("2026-04-03");
    expect(istDay(parseEntryDate("2026-04-30"))).toBe("2026-04-30");
    expect(istDay(parseEntryDate("01 Apr 2026"))).toBe("2026-04-01");
    expect(istDay(parseEntryDate("01-Sep-26"))).toBe("2026-09-01");
    expect(istDay(parseEntryDate("31/03/2026 23:10:00"))).toBe("2026-03-31");
    expect(istDay(parseEntryDate(46113))).toBe("2026-04-01");
  });

  it("rejects impossible dates", () => {
    expect(parseEntryDate("31/02/2026")).toBeNull();
    expect(parseEntryDate("Opening Balance")).toBeNull();
    expect(parseEntryDate("")).toBeNull();
  });
});

describe("teacherPayAmounts", () => {
  it("books the gross and works it back from a 90% payout", () => {
    expect(teacherPayAmounts(900_000, "net_paid", true)).toEqual({ amount: 1_000_000, tdsAmount: 100_000 });
    expect(teacherPayAmounts(1_000_000, "gross", true)).toEqual({ amount: 1_000_000, tdsAmount: 100_000 });
    expect(teacherPayAmounts(900_000, "net_paid", false)).toEqual({ amount: 900_000, tdsAmount: 0 });
  });
});

describe("detectColumns", () => {
  it("reads HDFC, SBI and ICICI headers", () => {
    expect(detectColumns(["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"])).toEqual({
      date: 0,
      narration: 1,
      reference: 2,
      debit: 4,
      credit: 5,
      balance: 6,
    });
    expect(detectColumns(["Txn Date", "Value Date", "Description", "Ref No./Cheque No.", "Debit", "Credit", "Balance"])).toMatchObject({
      date: 0,
      narration: 2,
      reference: 3,
      debit: 4,
      credit: 5,
      balance: 6,
    });
    expect(
      detectColumns(["S No.", "Value Date", "Transaction Date", "Cheque Number", "Transaction Remarks", "Withdrawal Amount (INR )", "Deposit Amount (INR )", "Balance (INR )"])
    ).toMatchObject({ date: 2, reference: 3, narration: 4, debit: 5, credit: 6, balance: 7 });
    expect(detectColumns(["Account", "Name"])).toBeNull();
  });
});

describe("parseStatementRows", () => {
  const rows = parseCsv(
    [
      "Envision Chess Academy,,,,,,",
      "Statement from 01/04/2026 to 30/04/2026,,,,,,",
      "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
      ",Opening Balance,,,,,10000.00",
      '02/04/26,UPI-RAVI KUMAR-ravi@okaxis-412345678901,412345678901,02/04/26,,"3,000.00","13,000.00"',
      '05/04/26,UPI/DR/412399/CESC LIMITED/YESB/cesc@ybl,412399,05/04/26,"1,250.00",,"11,750.00"',
      "05/04/26,SMS CHARGES,,05/04/26,15.00,,11735.00",
      "05/04/26,SMS CHARGES,,05/04/26,15.00,,11720.00",
      "*** End of statement ***,,,,,,",
    ].join("\n")
  );

  it("finds the header under the letterhead and reads debits and credits", () => {
    const parsed = parseStatementRows(rows);
    expect(parsed.headerRow).toBe(2);
    expect(parsed.transactions).toHaveLength(4);
    const [credit, cesc] = parsed.transactions;
    expect(credit.credit).toBe(300_000);
    expect(credit.debit).toBe(0);
    expect(credit.reference).toBe("412345678901");
    expect(istDay(credit.date)).toBe("2026-04-02");
    expect(cesc.debit).toBe(125_000);
    expect(parsed.skipped.map((skip) => skip.reason)).toContain("No date");
  });

  it("gives the same row the same hash across uploads and tells identical rows apart", () => {
    const first = parseStatementRows(rows).transactions.map((row) => row.hash);
    const again = parseStatementRows(rows).transactions.map((row) => row.hash);
    expect(again).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });

  it("reads a single amount column with a Dr/Cr marker", () => {
    const parsed = parseStatementRows([
      ["Transaction Date", "Description", "Amount", "Dr / Cr", "Balance"],
      ["01-Apr-2026", "NEFT FROM PARENT", "5,000.00", "CR", "15,000.00"],
      ["02-Apr-2026", "FACEBK ADS", "2,000.00", "DR", "13,000.00"],
    ]);
    expect(parsed.transactions.map((row) => [row.credit, row.debit])).toEqual([
      [500_000, 0],
      [0, 200_000],
    ]);
  });

  it("refuses a file with no recognisable header", () => {
    expect(() => parseStatementRows([["foo", "bar"], ["1", "2"]])).toThrow(StatementFormatError);
  });
});

describe("suggestRulePattern", () => {
  it("keeps the payee and drops codes", () => {
    expect(suggestRulePattern("UPI/DR/412399/CESC LIMITED/YESB/cesc@ybl")).toBe("cesc limited");
  });
});

describe("readSpreadsheet", () => {
  it("reads an HTML table saved as .xls", () => {
    const html = "<html><table><tr><th>Date</th><th>Narration</th></tr><tr><td>01/04/2026</td><td>A&amp;B&nbsp;Ltd</td></tr></table></html>";
    expect(parseHtmlTableRows(html)).toEqual([
      ["Date", "Narration"],
      ["01/04/2026", "A&B Ltd"],
    ]);
    expect(readSpreadsheet(Buffer.from(html), "statement.xls")).toHaveLength(2);
  });

  it("reads tab-separated text even with Indian thousands commas", () => {
    expect(readSpreadsheet(Buffer.from("Date\tAmount\n01/04/2026\t1,20,000"), "x.txt")).toEqual([
      ["Date", "Amount"],
      ["01/04/2026", "1,20,000"],
    ]);
  });

  it("refuses a binary .xls with what to do instead", () => {
    const binary = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]);
    expect(() => readSpreadsheet(binary, "old.xls")).toThrow(SpreadsheetFormatError);
  });
});
