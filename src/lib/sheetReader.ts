import { inflateRawSync } from "zlib";

/**
 * Reading spreadsheets without a spreadsheet library: CSV, and the first sheet
 * of an .xlsx (a zip of XML). Shared by the legacy student import and the
 * Accounts bank statement / ledger imports.
 */

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);
  return rows;
}

function columnLettersToIndex(value: string) {
  let total = 0;
  for (const char of value.toUpperCase()) {
    total = total * 26 + (char.charCodeAt(0) - 64);
  }
  return Math.max(0, total - 1);
}

export function extractZipEntries(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const localSignature = 0x04034b50;

  for (let position = buffer.length - 22; position >= 0; position -= 1) {
    if (buffer.readUInt32LE(position) !== eocdSignature) continue;
    const centralDirectoryOffset = buffer.readUInt32LE(position + 16);
    let cursor = centralDirectoryOffset;

    while (cursor + 46 <= buffer.length && buffer.readUInt32LE(cursor) === centralSignature) {
      const compressionMethod = buffer.readUInt16LE(cursor + 10);
      const compressedSize = buffer.readUInt32LE(cursor + 20);
      const fileNameLength = buffer.readUInt16LE(cursor + 28);
      const extraLength = buffer.readUInt16LE(cursor + 30);
      const commentLength = buffer.readUInt16LE(cursor + 32);
      const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
      const fileName = buffer.toString("utf8", cursor + 46, cursor + 46 + fileNameLength);

      if (buffer.readUInt32LE(localHeaderOffset) !== localSignature) break;
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const payload = buffer.subarray(dataStart, dataStart + compressedSize);
      const extracted = compressionMethod === 0 ? payload : compressionMethod === 8 ? inflateRawSync(payload) : null;
      if (extracted) entries.set(fileName, extracted);

      cursor += 46 + fileNameLength + extraLength + commentLength;
    }
    break;
  }

  return entries;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Excel keeps dates as serial numbers; only the cell's number format marks them
 * as dates. Reading the sheet without styles.xml hands a due date over as
 * "45955", and `new Date("45955")` is a perfectly valid date in the year 45955 -
 * which is how imported invoices ended up dated 01-01-46235.
 */
const BUILTIN_DATE_FORMAT_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57,
  58,
]);

function isDateFormatCode(code: string) {
  // Literals, escaped characters and [$-409]/[Red] sections carry letters that
  // are not date tokens, so drop them before looking for y/m/d/h/s.
  const stripped = code
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[[^\]]*\]/g, "");
  return /[ymdhs]/i.test(stripped);
}

/** Style indexes (a cell's `s` attribute) whose number format renders a date. */
function xlsxDateStyles(stylesXml: string) {
  const customFormats = new Map<number, string>();
  for (const match of stylesXml.matchAll(/<numFmt\b[^>]*\bnumFmtId="(\d+)"[^>]*\bformatCode="([^"]*)"[^>]*>/g)) {
    customFormats.set(Number(match[1]), decodeXmlEntities(match[2]));
  }

  const dateStyles = new Set<number>();
  const cellXfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || "";
  let styleIndex = 0;
  for (const match of cellXfs.matchAll(/<xf\b([^>]*)>/g)) {
    const numFmtId = Number(match[1].match(/\bnumFmtId="(\d+)"/)?.[1] || 0);
    const customCode = customFormats.get(numFmtId);
    if (BUILTIN_DATE_FORMAT_IDS.has(numFmtId) || (customCode && isDateFormatCode(customCode))) {
      dateStyles.add(styleIndex);
    }
    styleIndex += 1;
  }
  return dateStyles;
}

export function excelSerialToDate(serial: number) {
  // The epoch is 1899-12-30 rather than 12-31 because Excel keeps a phantom
  // 1900-02-29; serials below 61 predate that day and need the extra day back.
  const days = Math.floor(serial);
  const timeMs = Math.round((serial - days) * 86400000);
  const utc = new Date(Date.UTC(1899, 11, 30) + (days < 61 ? days + 1 : days) * 86400000 + timeMs);
  // Rebuild in local time so the calendar day matches what Excel displays.
  return new Date(
    utc.getUTCFullYear(),
    utc.getUTCMonth(),
    utc.getUTCDate(),
    utc.getUTCHours(),
    utc.getUTCMinutes(),
    utc.getUTCSeconds()
  );
}

/** Renders a serial into one of the shapes `asDate` already understands. */
export function formatExcelSerial(serial: number) {
  const date = excelSerialToDate(serial);
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
  if (!date.getHours() && !date.getMinutes() && !date.getSeconds()) return day;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseSimpleXlsxRows(buffer: Buffer) {
  const entries = extractZipEntries(buffer);
  const sharedStringsXml = entries.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  // One <si> per string. A formatted string is several <r> runs, each with its
  // own <t>; reading <t> tags one by one shifted every later index (bank
  // exports often bold a single word in a narration).
  const sharedStrings = Array.from(sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)).map((si) =>
    Array.from(si[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g))
      .map((match) => decodeXmlEntities(match[1]))
      .join("")
  );
  const dateStyles = xlsxDateStyles(entries.get("xl/styles.xml")?.toString("utf8") || "");
  const firstSheet =
    entries.has("xl/worksheets/sheet1.xml")
      ? "xl/worksheets/sheet1.xml"
      : Array.from(entries.keys())
          .filter((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name))
          .sort()[0];
  const sheetXml = firstSheet ? entries.get(firstSheet)?.toString("utf8") : undefined;
  if (!sheetXml) throw new Error("Could not read the first worksheet from the Excel file.");

  const rows: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    // Empty cells are written self-closing (`<c r="J2" s="2"/>`); matching only
    // the paired form let one swallow every cell up to the next `</c>` and shift
    // the row's columns out of alignment.
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] || "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1] || "A";
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] || "";
      const styleIndex = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? -1);
      const colIndex = columnLettersToIndex(ref);
      const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || "";
      const inlineValue = body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] || "";
      let resolved = "";
      if (type === "s") resolved = sharedStrings[Number(value)] || "";
      else if (type === "inlineStr") resolved = decodeXmlEntities(inlineValue);
      else resolved = decodeXmlEntities(value);
      // A number carrying a date format is a serial, not a quantity.
      if (!type || type === "n") {
        const serial = Number(resolved);
        if (resolved && dateStyles.has(styleIndex) && Number.isFinite(serial)) resolved = formatExcelSerial(serial);
      }
      cells[colIndex] = resolved;
    }
    if (cells.some((cell) => String(cell || "").trim().length > 0)) rows.push(cells.map((cell) => String(cell || "")));
  }
  return rows;
}

function htmlText(value: string) {
  return decodeXmlEntities(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Rows of every <table> in an HTML page - what many Indian banks save as ".xls". */
export function parseHtmlTableRows(html: string) {
  const rows: string[][] = [];
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
      const text = htmlText(cellMatch[3]);
      const span = Number(cellMatch[2].match(/colspan\s*=\s*"?(\d+)/i)?.[1] || 1);
      cells.push(text);
      for (let extra = 1; extra < Math.min(span, 20); extra += 1) cells.push("");
    }
    if (cells.some((cell) => cell.trim())) rows.push(cells);
  }
  return rows;
}

export class SpreadsheetFormatError extends Error {}

/**
 * Any spreadsheet a person is likely to upload, as rows of text: .csv, .xlsx,
 * or an ".xls" that is really an HTML table. A genuine old binary .xls cannot
 * be read without a library, so it is refused with what to do instead.
 */
export function readSpreadsheet(buffer: Buffer, fileName = ""): string[][] {
  const name = fileName.toLowerCase();
  if (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50) return parseSimpleXlsxRows(buffer);
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0xd0cf11e0) return parseXlsRows(buffer);
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (/<table\b/i.test(text)) return parseHtmlTableRows(text);
  if (name.endsWith(".pdf") || text.startsWith("%PDF")) {
    throw new SpreadsheetFormatError("PDF statements cannot be read here. Download the statement from net banking as Excel or CSV.");
  }
  // Tab-separated exports are common too. Amounts like "1,20,000" put commas
  // in a TSV's rows, so the busier separator on the first line decides it.
  const head = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const count = (separator: string) => head.split(separator).length - 1;
  if (count("\t") > count(",")) {
    return text
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((cell) => cell.replace(/^"|"$/g, "")))
      .filter((row) => row.some((cell) => cell.trim()));
  }
  return parseCsv(text);
}

// ---------------------------------------------------------------------------
// Old binary Excel (.xls, BIFF8 inside a Compound File). HDFC and most Indian
// banks export statements this way. Only what a statement needs is read: the
// first worksheet's text, numbers and dates.

const CFB_END = 0xfffffffe;
const CFB_FREE = 0xffffffff;

/** The named stream ("Workbook") out of an OLE compound file. */
function readCompoundStream(buffer: Buffer, wanted: string[]): Buffer | null {
  if (buffer.length < 512 || buffer.readUInt32BE(0) !== 0xd0cf11e0) return null;
  const sectorSize = 1 << buffer.readUInt16LE(0x1e);
  const miniSectorSize = 1 << buffer.readUInt16LE(0x20);
  const firstDirSector = buffer.readUInt32LE(0x30);
  const miniCutoff = buffer.readUInt32LE(0x38);
  const firstMiniFat = buffer.readUInt32LE(0x3c);
  let difatSector = buffer.readUInt32LE(0x44);
  const sectorOffset = (sector: number) => (sector + 1) * sectorSize;

  // The FAT's own sectors are listed in the header (109) and then in DIFAT sectors.
  const fatSectors: number[] = [];
  for (let index = 0; index < 109; index += 1) {
    const sector = buffer.readUInt32LE(0x4c + index * 4);
    if (sector !== CFB_FREE && sector !== CFB_END) fatSectors.push(sector);
  }
  for (let guard = 0; difatSector !== CFB_END && difatSector !== CFB_FREE && guard < 10_000; guard += 1) {
    const base = sectorOffset(difatSector);
    const perSector = sectorSize / 4 - 1;
    for (let index = 0; index < perSector; index += 1) {
      const sector = buffer.readUInt32LE(base + index * 4);
      if (sector !== CFB_FREE && sector !== CFB_END) fatSectors.push(sector);
    }
    difatSector = buffer.readUInt32LE(base + perSector * 4);
  }
  const fat: number[] = [];
  for (const sector of fatSectors) {
    const base = sectorOffset(sector);
    for (let index = 0; index < sectorSize / 4 && base + index * 4 + 4 <= buffer.length; index += 1) fat.push(buffer.readUInt32LE(base + index * 4));
  }
  const chain = (start: number) => {
    const sectors: number[] = [];
    for (let sector = start, guard = 0; sector !== CFB_END && sector < fat.length && guard < 1_000_000; guard += 1) {
      sectors.push(sector);
      sector = fat[sector];
    }
    return sectors;
  };
  const readChain = (start: number, size: number) => {
    const parts = chain(start).map((sector) => buffer.subarray(sectorOffset(sector), sectorOffset(sector) + sectorSize));
    return Buffer.concat(parts).subarray(0, size);
  };

  const directory = Buffer.concat(chain(firstDirSector).map((sector) => buffer.subarray(sectorOffset(sector), sectorOffset(sector) + sectorSize)));
  const entries: { name: string; type: number; start: number; size: number }[] = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = directory.readUInt16LE(offset + 0x40);
    const name = directory.toString("utf16le", offset, offset + Math.max(0, nameLength - 2));
    entries.push({ name, type: directory[offset + 0x42], start: directory.readUInt32LE(offset + 0x74), size: directory.readUInt32LE(offset + 0x78) });
  }
  const entry = entries.find((item) => item.type === 2 && wanted.includes(item.name));
  if (!entry) return null;
  if (entry.size >= miniCutoff) return readChain(entry.start, entry.size);

  // Small streams live in the mini stream, held by the root entry.
  const root = entries.find((item) => item.type === 5);
  if (!root) return null;
  const miniStream = readChain(root.start, root.size);
  const miniFatBytes = readChain(firstMiniFat, chain(firstMiniFat).length * sectorSize);
  const miniFat: number[] = [];
  for (let index = 0; index + 4 <= miniFatBytes.length; index += 4) miniFat.push(miniFatBytes.readUInt32LE(index));
  const parts: Buffer[] = [];
  for (let sector = entry.start, guard = 0; sector !== CFB_END && sector < miniFat.length && guard < 1_000_000; guard += 1) {
    parts.push(miniStream.subarray(sector * miniSectorSize, (sector + 1) * miniSectorSize));
    sector = miniFat[sector];
  }
  return Buffer.concat(parts).subarray(0, entry.size);
}

function decodeRk(rk: number) {
  let value: number;
  if (rk & 0x02) {
    value = rk >> 2;
  } else {
    const bytes = Buffer.alloc(8);
    bytes.writeUInt32LE((rk & 0xfffffffc) >>> 0, 4);
    value = bytes.readDoubleLE(0);
  }
  return rk & 0x01 ? value / 100 : value;
}

/** BIFF8 records, with CONTINUE records kept beside their parent so strings can span them. */
function biffRecords(stream: Buffer) {
  const records: { type: number; data: Buffer; continues: Buffer[] }[] = [];
  for (let offset = 0; offset + 4 <= stream.length; ) {
    const type = stream.readUInt16LE(offset);
    const length = stream.readUInt16LE(offset + 2);
    const data = stream.subarray(offset + 4, offset + 4 + length);
    offset += 4 + length;
    if (type === 0x003c && records.length) records[records.length - 1].continues.push(data);
    else records.push({ type, data, continues: [] });
  }
  return records;
}

/**
 * The shared string table. A string may break across CONTINUE records, and the
 * new record restates whether the remaining characters are 1 or 2 bytes wide.
 */
function readSst(record: { data: Buffer; continues: Buffer[] }) {
  const blocks = [record.data, ...record.continues];
  let block = 0;
  let offset = 8;
  const strings: string[] = [];
  const unique = record.data.readUInt32LE(4);
  const ensure = () => {
    while (block < blocks.length && offset >= blocks[block].length) {
      block += 1;
      offset = 0;
    }
  };
  const u8 = () => {
    ensure();
    return blocks[block]?.[offset++] ?? 0;
  };
  const u16 = () => u8() | (u8() << 8);
  const u32 = () => (u16() | (u16() << 16)) >>> 0;
  const skip = (count: number) => {
    for (let left = count; left > 0; ) {
      ensure();
      if (block >= blocks.length) return;
      const take = Math.min(left, blocks[block].length - offset);
      offset += take;
      left -= take;
    }
  };

  for (let index = 0; index < unique && block < blocks.length; index += 1) {
    const count = u16();
    const flags = u8();
    let wide = (flags & 0x01) !== 0;
    const runs = flags & 0x08 ? u16() : 0;
    const extra = flags & 0x04 ? u32() : 0;
    let text = "";
    for (let read = 0; read < count; ) {
      if (offset >= (blocks[block]?.length ?? 0)) {
        block += 1;
        offset = 0;
        if (block >= blocks.length) break;
        wide = (blocks[block][offset++] & 0x01) !== 0;
      }
      const available = blocks[block].length - offset;
      const take = Math.min(count - read, wide ? Math.floor(available / 2) : available);
      if (take <= 0) break;
      text += wide ? blocks[block].toString("utf16le", offset, offset + take * 2) : blocks[block].toString("latin1", offset, offset + take);
      offset += wide ? take * 2 : take;
      read += take;
    }
    skip(runs * 4 + extra);
    strings.push(text);
  }
  return strings;
}

function biffShortString(data: Buffer, offset: number) {
  const count = data.readUInt16LE(offset);
  const wide = (data[offset + 2] & 0x01) !== 0;
  const start = offset + 3;
  return wide ? data.toString("utf16le", start, start + count * 2) : data.toString("latin1", start, start + count);
}

/** Rows of the first worksheet of a binary .xls, as text. */
export function parseXlsRows(buffer: Buffer): string[][] {
  const stream = readCompoundStream(buffer, ["Workbook", "Book"]);
  if (!stream) throw new SpreadsheetFormatError("Could not open this .xls file. Open it in Excel, save it as .xlsx, and upload that.");
  const records = biffRecords(stream);

  let strings: string[] = [];
  const formats = new Map<number, string>();
  const xfFormats: number[] = [];
  let bofCount = 0;
  const cells = new Map<number, string[]>();
  let pendingFormula: { row: number; col: number } | null = null;

  const put = (row: number, col: number, value: string) => {
    const list = cells.get(row) || [];
    list[col] = value;
    cells.set(row, list);
  };
  const numberText = (value: number, xf: number) => {
    const format = xfFormats[xf] ?? 0;
    const isDate = BUILTIN_DATE_FORMAT_IDS.has(format) || isDateFormatCode(formats.get(format) || "");
    if (isDate && value > 0 && value < 2958466) return formatExcelSerial(value);
    return String(Math.round(value * 1e6) / 1e6);
  };

  for (const record of records) {
    const { type, data } = record;
    if (type === 0x0809) {
      bofCount += 1;
      if (bofCount > 2) break;
      continue;
    }
    if (bofCount === 1) {
      // Workbook globals: the string table and the number formats.
      if (type === 0x00fc) strings = readSst(record);
      else if (type === 0x041e && data.length >= 5) formats.set(data.readUInt16LE(0), biffShortString(data, 2));
      else if (type === 0x00e0 && data.length >= 4) xfFormats.push(data.readUInt16LE(2));
      continue;
    }
    if (bofCount !== 2) continue;
    if (type === 0x000a) break;
    if (data.length < 6) continue;
    const row = data.readUInt16LE(0);
    const col = data.readUInt16LE(2);
    if (type === 0x00fd && data.length >= 10) put(row, col, strings[data.readUInt32LE(6)] ?? "");
    else if (type === 0x0203 && data.length >= 14) put(row, col, numberText(data.readDoubleLE(6), data.readUInt16LE(4)));
    else if (type === 0x027e && data.length >= 10) put(row, col, numberText(decodeRk(data.readInt32LE(6)), data.readUInt16LE(4)));
    else if (type === 0x00bd) {
      const last = data.readUInt16LE(data.length - 2);
      for (let column = col, offset = 4; column <= last && offset + 6 <= data.length - 2; column += 1, offset += 6) {
        put(row, column, numberText(decodeRk(data.readInt32LE(offset + 2)), data.readUInt16LE(offset)));
      }
    } else if (type === 0x0204 && data.length >= 9) put(row, col, biffShortString(data, 6));
    else if (type === 0x0006 && data.length >= 14) {
      // A formula's cached result: a number, or (0xFFFF marker) a string in the next STRING record.
      if (data.readUInt16LE(12) === 0xffff && data[6] === 0) pendingFormula = { row, col };
      else if (data.readUInt16LE(12) !== 0xffff) put(row, col, numberText(data.readDoubleLE(6), data.readUInt16LE(4)));
    } else if (type === 0x0207 && pendingFormula) {
      put(pendingFormula.row, pendingFormula.col, biffShortString(data, 0));
      pendingFormula = null;
    }
  }

  return Array.from(cells.keys())
    .sort((a, b) => a - b)
    .map((row) => Array.from(cells.get(row)!, (value) => String(value ?? "")))
    .filter((row) => row.some((value) => value.trim()));
}
