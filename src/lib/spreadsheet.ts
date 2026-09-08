import { deflateRawSync } from "node:zlib";

/**
 * Dependency-free workbook writer for the finance exports.
 *
 * Excel opens a plain CSV as Windows-1252 unless the file starts with a BOM, so
 * the rupee sign in an INR amount used to arrive as "â‚¹". Rather than only
 * patching the BOM in, exports now carry real types: money goes out as a number
 * with a currency format, dates as real dates, and columns are pre-sized, so a
 * finance user gets a sheet they can sum instead of a wall of text.
 */

export type CellType = "text" | "money" | "number" | "percent" | "date" | "datetime" | "badge";

export type SheetColumn = {
  label: string;
  /** `money` values are paise, matching `formatINR` and everything stored in Mongo. */
  type?: CellType;
};

export type Sheet = {
  name: string;
  columns: SheetColumn[];
  rows: unknown[][];
};

export type SpreadsheetFormat = "csv" | "xlsx" | "ods";

export const SPREADSHEET_MEDIA_TYPES: Record<SpreadsheetFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
};

/** Accepts anything a query string may carry; unknown values fall back to `fallback`. */
export function resolveFormat(value: unknown, fallback: SpreadsheetFormat = "csv"): SpreadsheetFormat {
  const key = String(value ?? "").trim().toLowerCase();
  if (key === "csv") return "csv";
  if (key === "ods" || key === "odf" || key === "odt") return "ods";
  // `xls` is the legacy value: the old export was an HTML table named .xls.
  if (key === "xlsx" || key === "xls" || key === "excel") return "xlsx";
  return fallback;
}

/* ------------------------------------------------------------ cell values */

// Split per kind rather than grouping the unions, so a `kind` check narrows to
// the `value`/`date` payload the branch actually reads.
type Cell =
  | { kind: "text"; text: string }
  | { kind: "number"; text: string; value: number }
  | { kind: "money"; text: string; value: number }
  | { kind: "percent"; text: string; value: number }
  | { kind: "date"; text: string; date: Date }
  | { kind: "datetime"; text: string; date: Date };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isoTime(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" || typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function normalize(value: unknown, type?: CellType): Cell {
  if (value === null || value === undefined || value === "") return { kind: "text", text: "" };

  if (type === "money") {
    const rupees = Number(value) / 100;
    if (!Number.isFinite(rupees)) return { kind: "text", text: String(value) };
    return { kind: "money", text: rupees.toFixed(2), value: rupees };
  }

  if (type === "number" || type === "percent") {
    const num = Number(value);
    if (!Number.isFinite(num)) return { kind: "text", text: String(value) };
    return type === "percent"
      ? { kind: "percent", text: `${num}%`, value: num }
      : { kind: "number", text: String(num), value: num };
  }

  if (type === "date" || type === "datetime") {
    const date = asDate(value);
    if (!date) return { kind: "text", text: String(value) };
    return type === "date"
      ? { kind: "date", text: isoDate(date), date }
      : { kind: "datetime", text: `${isoDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`, date };
  }

  return { kind: "text", text: String(value) };
}

function headerLabel(column: SheetColumn) {
  // The currency symbol lives in the cell format, not in the value, so the unit
  // belongs in the header instead - otherwise a bare "2796.60" reads ambiguous.
  if (column.type === "money" && !/\bINR\b|₹/i.test(column.label)) return `${column.label} (INR)`;
  if (column.type === "percent" && !column.label.includes("%")) return `${column.label} (%)`;
  return column.label;
}

function normalizeSheet(sheet: Sheet) {
  const headers = sheet.columns.map(headerLabel);
  const cells = sheet.rows.map((row) => sheet.columns.map((column, index) => normalize(row[index], column.type)));
  const widths = sheet.columns.map((_, index) =>
    Math.min(50, Math.max(9, headers[index].length + 2, ...cells.map((row) => row[index].text.length + 2)))
  );
  return { headers, cells, widths };
}

/* -------------------------------------------------------------------- csv */

function csvCell(text: string) {
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(sheets: Sheet[]): Buffer {
  const blocks = sheets.map((sheet) => {
    const { headers, cells } = normalizeSheet(sheet);
    const lines: string[] = [];
    if (sheets.length > 1) lines.push(csvCell(sheet.name));
    lines.push(headers.map(csvCell).join(","));
    // The unit is already in the header, so numbers go out bare - a "18%" or a
    // "₹2,796.60" would land in the sheet as text nobody can add up.
    for (const row of cells) {
      lines.push(row.map((cell) => csvCell(cell.kind === "percent" ? String(cell.value) : cell.text)).join(","));
    }
    return lines.join("\r\n");
  });
  // The BOM is what stops Excel reading UTF-8 rupee signs as Windows-1252.
  return Buffer.from(`\uFEFF${blocks.join("\r\n\r\n")}\r\n`, "utf8");
}

/* -------------------------------------------------------------------- zip */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value;
  }
  return table;
})();

function crc32(buffer: Buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

type ZipEntry = { name: string; data: Buffer; store?: boolean };

function zip(entries: ZipEntry[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const body = entry.store ? entry.data : deflateRawSync(entry.data);
    const method = entry.store ? 0 : 8;
    const crc = crc32(entry.data);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0x0021, 12); // 1980-01-01, so archives stay byte-stable
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, name, body);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt16LE(0, 12);
    directory.writeUInt16LE(0x0021, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(body.length, 20);
    directory.writeUInt32LE(entry.data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);

    offset += header.length + name.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...local, directory, end]);
}

/* -------------------------------------------------------------------- xml */

function xml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sheetNames(sheets: Sheet[]) {
  const used = new Set<string>();
  return sheets.map((sheet, index) => {
    const fallback = `Sheet${index + 1}`;
    const base = (sheet.name || fallback).replace(/[\\/?*[\]:]/g, "-").slice(0, 31).trim() || fallback;
    let name = base;
    let suffix = 2;
    while (used.has(name.toLowerCase())) {
      name = `${base.slice(0, 28)} ${suffix}`;
      suffix += 1;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/* ------------------------------------------------------------------- xlsx */

const XLSX_STYLE = { text: 0, header: 1, money: 2, date: 3, datetime: 4, percent: 5, number: 6 } as const;

function columnLetter(index: number) {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function excelSerial(date: Date) {
  const utc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds()
  );
  return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}

function xlsxStyleFor(cell: Cell) {
  if (cell.kind === "money") return XLSX_STYLE.money;
  if (cell.kind === "date") return XLSX_STYLE.date;
  if (cell.kind === "datetime") return XLSX_STYLE.datetime;
  if (cell.kind === "percent") return XLSX_STYLE.percent;
  if (cell.kind === "number") return XLSX_STYLE.number;
  return XLSX_STYLE.text;
}

function xlsxCell(reference: string, cell: Cell, style: number) {
  if (cell.kind === "text") {
    if (!cell.text) return `<c r="${reference}" s="${style}"/>`;
    return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(cell.text)}</t></is></c>`;
  }
  // A date-only cell gets a whole serial; keeping the clock fraction would make
  // it sort and compare against midnight-aligned dates by a few hours.
  const value =
    cell.kind === "date"
      ? Math.floor(excelSerial(cell.date))
      : cell.kind === "datetime"
        ? excelSerial(cell.date)
        : cell.value;
  return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
}

function xlsxSheet(sheet: Sheet) {
  const { headers, cells, widths } = normalizeSheet(sheet);
  const lastColumn = columnLetter(Math.max(headers.length - 1, 0));
  const dimension = `A1:${lastColumn}${cells.length + 1}`;

  const cols = widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const headerRow = `<row r="1" ht="18" customHeight="1">${headers
    .map((label, index) => xlsxCell(`${columnLetter(index)}1`, { kind: "text", text: label }, XLSX_STYLE.header))
    .join("")}</row>`;
  const bodyRows = cells
    .map((row, rowIndex) => {
      const reference = rowIndex + 2;
      const body = row
        .map((cell, index) => xlsxCell(`${columnLetter(index)}${reference}`, cell, xlsxStyleFor(cell)))
        .join("");
      return `<row r="${reference}">${body}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${headerRow}${bodyRows}</sheetData>${
    cells.length ? `<autoFilter ref="${dimension}"/>` : ""
  }</worksheet>`;
}

const XLSX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;₹&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="dd-mm-yyyy"/><numFmt numFmtId="166" formatCode="dd-mm-yyyy\\ hh:mm"/><numFmt numFmtId="167" formatCode="0&quot;%&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function toXlsx(sheets: Sheet[]): Buffer {
  const names = sheetNames(sheets);

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${
          index + 1
        }.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join("")}</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
    .map((name, index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("")}</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${
          index + 1
        }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${
          index + 1
        }.xml"/>`
    )
    .join("")}<Relationship Id="rId${
    sheets.length + 1
  }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  return zip([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rootRels, "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(workbook, "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(workbookRels, "utf8") },
    { name: "xl/styles.xml", data: Buffer.from(XLSX_STYLES, "utf8") },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: Buffer.from(xlsxSheet(sheet), "utf8"),
    })),
  ]);
}

/* -------------------------------------------------------------------- ods */

function odsCell(cell: Cell) {
  if (cell.kind === "text") {
    if (!cell.text) return `<table:table-cell/>`;
    return `<table:table-cell office:value-type="string"><text:p>${xml(cell.text)}</text:p></table:table-cell>`;
  }
  if (cell.kind === "money") {
    return `<table:table-cell table:style-name="ceMoney" office:value-type="currency" office:currency="INR" office:value="${
      cell.value
    }"><text:p>${xml(cell.text)}</text:p></table:table-cell>`;
  }
  if (cell.kind === "percent" || cell.kind === "number") {
    const style = cell.kind === "percent" ? ` table:style-name="cePercent"` : "";
    return `<table:table-cell${style} office:value-type="float" office:value="${cell.value}"><text:p>${xml(
      cell.text
    )}</text:p></table:table-cell>`;
  }
  const style = cell.kind === "date" ? "ceDate" : "ceDateTime";
  const value = cell.kind === "date" ? isoDate(cell.date) : `${isoDate(cell.date)}T${isoTime(cell.date)}`;
  return `<table:table-cell table:style-name="${style}" office:value-type="date" office:date-value="${value}"><text:p>${xml(
    cell.text
  )}</text:p></table:table-cell>`;
}

export function toOds(sheets: Sheet[]): Buffer {
  const names = sheetNames(sheets);
  const columnStyles: string[] = [];
  const tables: string[] = [];

  sheets.forEach((sheet, sheetIndex) => {
    const { headers, cells, widths } = normalizeSheet(sheet);
    const columns = widths
      .map((width, index) => {
        const name = `co${sheetIndex + 1}_${index + 1}`;
        columnStyles.push(
          `<style:style style:name="${name}" style:family="table-column"><style:table-column-properties style:column-width="${(
            width * 0.21 +
            0.4
          ).toFixed(2)}cm"/></style:style>`
        );
        return `<table:table-column table:style-name="${name}"/>`;
      })
      .join("");

    const headerRow = `<table:table-row>${headers
      .map(
        (label) =>
          `<table:table-cell table:style-name="ceHeader" office:value-type="string"><text:p>${xml(
            label
          )}</text:p></table:table-cell>`
      )
      .join("")}</table:table-row>`;
    const bodyRows = cells.map((row) => `<table:table-row>${row.map(odsCell).join("")}</table:table-row>`).join("");

    tables.push(`<table:table table:name="${xml(names[sheetIndex])}">${columns}${headerRow}${bodyRows}</table:table>`);
  });

  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" office:version="1.2"><office:automatic-styles><number:currency-style style:name="NINR"><number:currency-symbol number:language="en" number:country="IN">₹</number:currency-symbol><number:number number:decimal-places="2" number:min-decimal-places="2" number:min-integer-digits="1" number:grouping="true"/></number:currency-style><number:date-style style:name="NDATE"><number:day number:style="long"/><number:text>-</number:text><number:month number:style="long"/><number:text>-</number:text><number:year number:style="long"/></number:date-style><number:date-style style:name="NDATETIME"><number:day number:style="long"/><number:text>-</number:text><number:month number:style="long"/><number:text>-</number:text><number:year number:style="long"/><number:text> </number:text><number:hours number:style="long"/><number:text>:</number:text><number:minutes number:style="long"/></number:date-style><number:number-style style:name="NPERCENT"><number:number number:decimal-places="0" number:min-integer-digits="1"/><number:text>%</number:text></number:number-style><style:style style:name="ceHeader" style:family="table-cell"><style:table-cell-properties fo:background-color="#1e3a8a"/><style:text-properties fo:font-weight="bold" fo:color="#ffffff"/></style:style><style:style style:name="ceMoney" style:family="table-cell" style:data-style-name="NINR"/><style:style style:name="ceDate" style:family="table-cell" style:data-style-name="NDATE"/><style:style style:name="ceDateTime" style:family="table-cell" style:data-style-name="NDATETIME"/><style:style style:name="cePercent" style:family="table-cell" style:data-style-name="NPERCENT"/>${columnStyles.join(
    ""
  )}</office:automatic-styles><office:body><office:spreadsheet>${tables.join(
    ""
  )}</office:spreadsheet></office:body></office:document-content>`;

  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" office:version="1.2"><office:styles><style:style style:name="Default" style:family="table-cell"/></office:styles></office:document-styles>`;

  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>`;

  return zip([
    // ODF requires an uncompressed `mimetype` entry written first in the archive.
    { name: "mimetype", data: Buffer.from("application/vnd.oasis.opendocument.spreadsheet", "utf8"), store: true },
    { name: "META-INF/manifest.xml", data: Buffer.from(manifest, "utf8") },
    { name: "styles.xml", data: Buffer.from(styles, "utf8") },
    { name: "content.xml", data: Buffer.from(content, "utf8") },
  ]);
}

/* ----------------------------------------------------------------- output */

export function buildSpreadsheet(format: SpreadsheetFormat, sheets: Sheet[]): Buffer {
  if (format === "xlsx") return toXlsx(sheets);
  if (format === "ods") return toOds(sheets);
  return toCsv(sheets);
}

export function spreadsheetHeaders(format: SpreadsheetFormat, filename: string, body: Buffer) {
  const safe = String(filename).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "report";
  return {
    "Content-Type": SPREADSHEET_MEDIA_TYPES[format],
    "Content-Disposition": `attachment; filename="${safe}.${format}"`,
    "Content-Length": String(body.length),
    "Cache-Control": "no-store",
  };
}
