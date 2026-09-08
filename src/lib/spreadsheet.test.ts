import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { buildSpreadsheet, resolveFormat, toCsv, toOds, toXlsx, type Sheet } from "./spreadsheet";

/** Minimal reader for the archives written by `spreadsheet.ts`. */
function readZip(buffer: Buffer) {
  const entries: Record<string, { data: Buffer; stored: boolean; offset: number }> = {};
  let offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    const raw = buffer.subarray(start, start + compressedSize);
    const data = method === 0 ? raw : inflateRawSync(raw);
    expect(data.length).toBe(uncompressedSize);
    entries[name] = { data, stored: method === 0, offset };
    offset = start + compressedSize;
  }
  return entries;
}

const sheet: Sheet = {
  name: "GST collected",
  columns: [
    { label: "Invoice" },
    { label: "Student" },
    { label: "Paid on", type: "date" },
    { label: "Taxable", type: "money" },
    { label: "GST %", type: "percent" },
    { label: "Credits", type: "number" },
  ],
  // Money arrives in paise, exactly as the invoice documents store it.
  rows: [["INV/26-27/001", "Srinija <Basu> & Co", "2026-04-07T06:30:00.000Z", 279660, 18, 4]],
};

describe("toCsv", () => {
  it("leads with a BOM so Excel reads the rupee sign as UTF-8", () => {
    const csv = toCsv([sheet]).toString("utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("writes money as a plain number and names the unit in the header", () => {
    const csv = toCsv([sheet]).toString("utf8");
    const [headerLine, rowLine] = csv.slice(1).split("\r\n");
    expect(headerLine).toContain('"Taxable (INR)"');
    expect(headerLine).toContain('"GST %"');
    expect(rowLine).toContain('"2796.60"');
    // No thousands separator and no symbol, so the cell stays numeric.
    expect(rowLine).not.toContain("2,796");
    expect(rowLine).not.toContain("₹");
    // Percentages go out bare too, for the same reason.
    expect(rowLine).toContain('"18"');
    expect(rowLine).not.toContain('"18%"');
  });

  it("escapes quotes and keeps one block per sheet", () => {
    const csv = toCsv([sheet, { ...sheet, name: "Late fees" }]).toString("utf8");
    expect(csv).toContain('"GST collected"');
    expect(csv).toContain('"Late fees"');
  });
});

describe("toXlsx", () => {
  const entries = readZip(toXlsx([sheet]));

  it("packs the parts Excel needs", () => {
    expect(Object.keys(entries).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
  });

  it("writes money in rupees and dates as Excel serials", () => {
    const xml = entries["xl/worksheets/sheet1.xml"].data.toString("utf8");
    expect(xml).toContain("<v>2796.6</v>");
    // 2026-04-07 is 46119 days after the 1899-12-30 epoch, and a date-only cell
    // carries no clock fraction even though the source value had a time on it.
    expect(xml).toContain('<c r="C2" s="3"><v>46119</v></c>');
    expect(xml).toContain('<v>18</v>');
  });

  it("escapes text rather than breaking the XML", () => {
    const xml = entries["xl/worksheets/sheet1.xml"].data.toString("utf8");
    expect(xml).toContain("Srinija &lt;Basu&gt; &amp; Co");
  });

  it("sizes columns so dates do not render as ####", () => {
    const xml = entries["xl/worksheets/sheet1.xml"].data.toString("utf8");
    expect(xml).toMatch(/<col min="1" max="1" width="\d+" customWidth="1"\/>/);
  });

  it("names every sheet uniquely and within Excel's limits", () => {
    const workbook = readZip(toXlsx([sheet, { ...sheet }]))["xl/workbook.xml"].data.toString("utf8");
    const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((match) => match[1]);
    expect(names).toEqual(["GST collected", "GST collected 2"]);
  });
});

describe("toOds", () => {
  const buffer = toOds([sheet]);
  const entries = readZip(buffer);

  it("stores the mimetype first and uncompressed, as ODF requires", () => {
    expect(buffer.subarray(30, 38).toString("utf8")).toBe("mimetype");
    expect(entries.mimetype.offset).toBe(0);
    expect(entries.mimetype.stored).toBe(true);
    expect(entries.mimetype.data.toString("utf8")).toBe("application/vnd.oasis.opendocument.spreadsheet");
  });

  it("types the cells so LibreOffice can total them", () => {
    const xml = entries["content.xml"].data.toString("utf8");
    expect(xml).toContain('office:value-type="currency" office:currency="INR" office:value="2796.6"');
    expect(xml).toContain('office:value-type="date" office:date-value="2026-04-07"');
    expect(xml).toContain('<table:table table:name="GST collected">');
  });
});

describe("resolveFormat", () => {
  it("maps the query values the finance pages send", () => {
    expect(resolveFormat("xlsx")).toBe("xlsx");
    expect(resolveFormat("ods")).toBe("ods");
    expect(resolveFormat("odf")).toBe("ods");
    expect(resolveFormat("csv")).toBe("csv");
    // Legacy links asked for the HTML-table ".xls" export.
    expect(resolveFormat("xls")).toBe("xlsx");
    expect(resolveFormat(null)).toBe("csv");
    expect(resolveFormat("pdf", "xlsx")).toBe("xlsx");
  });
});

describe("buildSpreadsheet", () => {
  it("handles an empty report in every format", () => {
    const empty: Sheet = { name: "Empty", columns: [{ label: "Invoice" }], rows: [] };
    expect(buildSpreadsheet("csv", [empty]).length).toBeGreaterThan(0);
    expect(readZip(buildSpreadsheet("xlsx", [empty]))["xl/worksheets/sheet1.xml"].data.length).toBeGreaterThan(0);
    expect(readZip(buildSpreadsheet("ods", [empty]))["content.xml"].data.length).toBeGreaterThan(0);
  });
});
