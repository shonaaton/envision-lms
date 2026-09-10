import { describe, expect, it } from "vitest";
import { parsePaymentHistoryWorkbook } from "./legacyStudentImport";

/**
 * Minimal store-only zip writer, enough for the workbook parser: it walks the
 * central directory, and never verifies CRCs.
 */
function buildZip(files: Record<string, string>) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const [name, text] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(text, "utf8");

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(0, 8); // stored
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    local.push(header, nameBuffer, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(0, 10); // stored
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuffer.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuffer);

    offset += header.length + nameBuffer.length + data.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...local, directory, end]);
}

// Styles mirror what Excel writes for this sheet: a built-in short date on the
// due date, and a custom long format on the collected date.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mmm/yyyy\\ hh:mm:ss\\ AM/PM"/></numFmts><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="22" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;

function textCell(reference: string, value: string) {
  return `<c r="${reference}" t="inlineStr"><is><t>${value}</t></is></c>`;
}

function workbook(rows: string[]) {
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
    .map((row, index) => `<row r="${index + 1}">${row}</row>`)
    .join("")}</sheetData></worksheet>`;
  return buildZip({ "xl/styles.xml": STYLES, "xl/worksheets/sheet1.xml": sheet });
}

// Column B stays empty so the self-closing `<c/>` sits mid-row, where a parser
// that only matches paired cells swallows the cell after it.
const HEADER_ROW = [
  textCell("A1", "Receipt No."),
  `<c r="B1" s="0"/>`,
  textCell("C1", "Due Date"),
  textCell("D1", "Inst No."),
  textCell("E1", "Amount Paid (Rs)"),
  textCell("F1", "Collected Date"),
].join("");

describe("parsePaymentHistoryWorkbook", () => {
  it("reads date-formatted serials as the dates Excel shows", () => {
    const buffer = workbook([
      HEADER_ROW,
      [
        textCell("A2", "INV/26-27/207"),
        `<c r="B2" s="2"/>`,
        `<c r="C2" s="1"><v>46235</v></c>`,
        `<c r="D2"><v>10</v></c>`,
        `<c r="E2"><v>2400</v></c>`,
        `<c r="F2" s="3"><v>46235</v></c>`,
      ].join(""),
    ]);

    const rows = parsePaymentHistoryWorkbook(buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0].referenceNumber).toBe("INV/26-27/207");
    expect(rows[0].installmentNumber).toBe(10);
    expect(rows[0].amountInr).toBe(2400);
    // Serial 46235 is 01-08-2026 - not the year 46235, which is what
    // `new Date("46235")` returns and what the imported invoices used to show.
    expect(rows[0].paidDate?.getFullYear()).toBe(2026);
    expect(rows[0].paidDate?.getMonth()).toBe(7);
    expect(rows[0].paidDate?.getDate()).toBe(1);
    expect(rows[0].dueDate?.getTime()).toBe(rows[0].paidDate?.getTime());
  });

  it("keeps unformatted numbers as numbers", () => {
    const buffer = workbook([
      HEADER_ROW,
      [
        textCell("A2", "INV/26-27/198"),
        `<c r="B2" s="0"/>`,
        `<c r="C2" s="1"><v>45955</v></c>`,
        `<c r="D2"><v>1</v></c>`,
        `<c r="E2"><v>2200</v></c>`,
        `<c r="F2" s="1"><v>45955</v></c>`,
      ].join(""),
    ]);

    const rows = parsePaymentHistoryWorkbook(buffer);

    // The installment and amount share the plain style with no date format, so
    // they must survive as 1 and 2200 rather than becoming dates in 1900.
    expect(rows[0].installmentNumber).toBe(1);
    expect(rows[0].amountInr).toBe(2200);
    expect(rows[0].paidDate?.toDateString()).toBe(new Date(2025, 9, 25).toDateString());
  });

  it("records payment history without touching credits, whatever plan is assigned", () => {
    const buffer = workbook([
      HEADER_ROW,
      [
        textCell("A2", "INV/26-27/276"),
        `<c r="B2" s="0"/>`,
        `<c r="C2" s="1"><v>46132</v></c>`,
        `<c r="D2"><v>8</v></c>`,
        // 3300 is not a whole multiple of the 2600 credit plan below, which is
        // exactly the receipt that used to abort the whole import.
        `<c r="E2"><v>3300</v></c>`,
        `<c r="F2" s="1"><v>46132</v></c>`,
      ].join(""),
    ]);

    const rows = parsePaymentHistoryWorkbook(buffer, {
      planType: "credits",
      creditPlanAmountInr: 2600,
      creditPlanCredits: 8,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].rowType).toBe("history_payment");
    expect(rows[0].amountInr).toBe(3300);
    expect(rows[0].credits).toBeUndefined();
  });
});
