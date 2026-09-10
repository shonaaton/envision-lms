import { Types } from "mongoose";
import { inflateRawSync, inflateSync } from "zlib";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { CreditLedger, FeeAssignment, FeePlan, Invoice } from "@/models/Fee";
import { User } from "@/models/User";
import { createInvoice, markInvoicePaid } from "@/lib/fees";
import { recordActivity } from "@/lib/activity";

type SupportedRowType =
  | "attendance"
  | "credit_summary"
  | "credit_payment"
  | "monthly_summary"
  | "monthly_invoice"
  | "monthly_payment"
  | "history_payment";

type ImportRow = {
  lineNumber: number;
  rowType: SupportedRowType;
  installmentNumber?: number;
  feeType?: string;
  receiptNumber?: string;
  eventDate?: Date;
  invoiceDate?: Date;
  dueDate?: Date;
  paidDate?: Date;
  firstInvoiceDate?: Date;
  attendanceStatus?: "present" | "absent" | "late" | "excused";
  durationMinutes?: number;
  amountInr?: number;
  credits?: number;
  creditBalance?: number;
  totalCreditsPurchased?: number;
  totalCreditsConsumed?: number;
  status?: "draft" | "unpaid" | "paid" | "overdue" | "cancelled";
  referenceNumber?: string;
  note?: string;
};

type ImportResult = {
  attendanceImported: number;
  invoicesImported: number;
  summariesApplied: number;
};

type StatementSummary = {
  totalFeesInr?: number;
  feesPaidInr?: number;
  dueAmountInr?: number;
  concessionAmountInr?: number;
};

type ImportParseOptions = {
  planType?: "monthly" | "credits";
  creditPlanAmountInr?: number;
  creditPlanCredits?: number;
};

const HEADER_ALIASES: Record<string, string> = {
  rowtype: "row_type",
  row_type: "row_type",
  type: "row_type",
  eventdate: "event_date",
  event_date: "event_date",
  attendancedate: "event_date",
  attendance_date: "event_date",
  invoicedate: "invoice_date",
  invoice_date: "invoice_date",
  duedate: "due_date",
  due_date: "due_date",
  paiddate: "paid_date",
  paid_date: "paid_date",
  firstinvoicedate: "first_invoice_date",
  first_invoice_date: "first_invoice_date",
  attendancestatus: "attendance_status",
  attendance_status: "attendance_status",
  durationminutes: "duration_minutes",
  duration_minutes: "duration_minutes",
  instno: "installment_number",
  inst_no: "installment_number",
  installmentno: "installment_number",
  installment_no: "installment_number",
  installmentnumber: "installment_number",
  installment_number: "installment_number",
  feetype: "fee_type",
  fee_type: "fee_type",
  amount: "amount_inr",
  amountinr: "amount_inr",
  amount_inr: "amount_inr",
  feeamount: "amount_inr",
  feeamountrs: "amount_inr",
  fee_amount: "amount_inr",
  fee_amount_rs: "amount_inr",
  paidamount: "paid_amount_inr",
  paidamountrs: "paid_amount_inr",
  paid_amount: "paid_amount_inr",
  paid_amount_rs: "paid_amount_inr",
  amountpaid: "paid_amount_inr",
  amountpaidrs: "paid_amount_inr",
  amount_paid: "paid_amount_inr",
  amount_paid_rs: "paid_amount_inr",
  balanceamount: "balance_amount_inr",
  balanceamountrs: "balance_amount_inr",
  balance_amount: "balance_amount_inr",
  balance_amount_rs: "balance_amount_inr",
  credits: "credits",
  creditbalance: "credit_balance",
  credit_balance: "credit_balance",
  totalcreditspurchased: "total_credits_purchased",
  total_credits_purchased: "total_credits_purchased",
  totalcreditsconsumed: "total_credits_consumed",
  total_credits_consumed: "total_credits_consumed",
  status: "status",
  totalfees: "total_fees_inr",
  totalfeesrs: "total_fees_inr",
  total_fees: "total_fees_inr",
  total_fees_rs: "total_fees_inr",
  feespaid: "fees_paid_inr",
  feespaidrs: "fees_paid_inr",
  fees_paid: "fees_paid_inr",
  fees_paid_rs: "fees_paid_inr",
  dueamount: "due_amount_inr",
  dueamountrs: "due_amount_inr",
  due_amount: "due_amount_inr",
  due_amount_rs: "due_amount_inr",
  concessionamount: "concession_amount_inr",
  concessionamountrs: "concession_amount_inr",
  concession_amount: "concession_amount_inr",
  concession_amount_rs: "concession_amount_inr",
  referencenumber: "reference_number",
  reference_number: "reference_number",
  receiptno: "reference_number",
  receipt_no: "reference_number",
  receiptnumber: "reference_number",
  receipt_number: "reference_number",
  collecteddate: "collected_date",
  collected_date: "collected_date",
  note: "note",
  notes: "note",
};

function parseCsv(text: string) {
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

function extractZipEntries(buffer: Buffer) {
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

function excelSerialToDate(serial: number) {
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
function formatExcelSerial(serial: number) {
  const date = excelSerialToDate(serial);
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
  if (!date.getHours() && !date.getMinutes() && !date.getSeconds()) return day;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseSimpleXlsxRows(buffer: Buffer) {
  const entries = extractZipEntries(buffer);
  const sharedStringsXml = entries.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  const sharedStrings = Array.from(sharedStringsXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((match) => decodeXmlEntities(match[1]));
  const dateStyles = xlsxDateStyles(entries.get("xl/styles.xml")?.toString("utf8") || "");
  const sheetXml = entries.get("xl/worksheets/sheet1.xml")?.toString("utf8");
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

function decodePdfLiteral(value: string) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      output += char;
      continue;
    }
    const next = value[index + 1];
    if (!next) break;
    index += 1;
    if (next === "n") output += "\n";
    else if (next === "r") output += "\r";
    else if (next === "t") output += "\t";
    else if (next === "b") output += "\b";
    else if (next === "f") output += "\f";
    else if (next === "(" || next === ")" || next === "\\") output += next;
    else if (/[0-7]/.test(next)) {
      const octal = `${next}${value[index + 1] || ""}${value[index + 2] || ""}`.match(/^[0-7]{1,3}/)?.[0] || next;
      output += String.fromCharCode(parseInt(octal, 8));
      index += octal.length - 1;
    } else output += next;
  }
  return output;
}

function extractPdfTextOperators(content: string) {
  const tokens: string[] = [];
  const literalMatches = content.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g);
  for (const match of literalMatches) {
    const literal = match[0].replace(/\)\s*Tj$/, "").replace(/^\(/, "");
    tokens.push(decodePdfLiteral(literal));
  }

  const arrayMatches = content.matchAll(/\[(.*?)\]\s*TJ/gs);
  for (const match of arrayMatches) {
    const chunk = match[1];
    const pieces = chunk.matchAll(/\((?:\\.|[^\\)])*\)/g);
    for (const piece of pieces) {
      tokens.push(decodePdfLiteral(piece[0].slice(1, -1)));
    }
  }
  return tokens;
}

function extractDecodedPdfStreams(buffer: Buffer) {
  const source = buffer.toString("latin1");
  const streams: string[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const dictStart = source.indexOf("<<", cursor);
    if (dictStart === -1) break;
    const streamMarker = source.indexOf("stream", dictStart);
    if (streamMarker === -1) break;
    const dictEnd = source.lastIndexOf(">>", streamMarker);
    if (dictEnd === -1) break;
    const dictionary = source.slice(dictStart, dictEnd + 2);
    const dataStart = streamMarker + (source.slice(streamMarker, streamMarker + 8).startsWith("stream\r\n") ? 8 : 7);
    const endMarker = source.indexOf("endstream", dataStart);
    if (endMarker === -1) break;
    let chunk = buffer.subarray(dataStart, endMarker);
    while (chunk.length && (chunk[chunk.length - 1] === 10 || chunk[chunk.length - 1] === 13)) {
      chunk = chunk.subarray(0, chunk.length - 1);
    }

    try {
      if (dictionary.includes("/FlateDecode")) {
        try {
          streams.push(inflateSync(chunk).toString("latin1"));
        } catch {
          streams.push(inflateRawSync(chunk).toString("latin1"));
        }
      } else {
        streams.push(chunk.toString("latin1"));
      }
    } catch {
      // Ignore unreadable stream blocks.
    }

    cursor = endMarker + "endstream".length;
  }

  return streams;
}

function normalizeStatementDate(value: string, lineLabel: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Could not read ${lineLabel} from the statement PDF.`);
  }
  return parsed;
}

function parseStatementRows(tokens: string[]) {
  const cleaned = tokens
    .map((token) => token.replace(/\\\(/g, "(").replace(/\\\)/g, ")").trim())
    .filter(Boolean);

  const summaryStart = cleaned.indexOf("Fee Details");
  if (summaryStart === -1) throw new Error("Could not find fee details in the uploaded statement.");
  const feeSummaryIndex = cleaned.indexOf("Fee Summary");
  const feeStructureIndex = cleaned.indexOf("Fee Structure");
  if (feeSummaryIndex === -1 || feeStructureIndex === -1) {
    throw new Error("Could not find the fee summary sections in the uploaded statement.");
  }

  const rows: ImportRow[] = [];
  const studentLine = cleaned.slice(summaryStart, feeSummaryIndex);
  const amounts = studentLine.filter((item) => /^\d+(?:\.\d+)?$/.test(item));
  const summary: StatementSummary = {
    totalFeesInr: amounts[0] ? Number(amounts[0]) : undefined,
    feesPaidInr: amounts[1] ? Number(amounts[1]) : undefined,
    dueAmountInr: amounts[2] ? Number(amounts[2]) : undefined,
    concessionAmountInr: amounts[3] ? Number(amounts[3]) : undefined,
  };
  rows.push({
    lineNumber: 1,
    rowType: "monthly_summary",
    amountInr: summary.totalFeesInr,
    note: "Imported from fee statement PDF",
  });

  const paymentTokens = cleaned.slice(feeSummaryIndex, feeStructureIndex);
  const paymentHeaderIndex = paymentTokens.findIndex((item) => item === "Paid Date");
  if (paymentHeaderIndex !== -1) {
    const entries = paymentTokens.slice(paymentHeaderIndex + 1);
    for (let index = 0; index + 3 < entries.length; index += 4) {
      const installmentNumber = Number(entries[index]);
      const feeType = entries[index + 1];
      const paidAmount = Number(entries[index + 2]);
      const paidDate = normalizeStatementDate(entries[index + 3], `paid date for installment ${entries[index]}`);
      if (!Number.isFinite(installmentNumber) || !Number.isFinite(paidAmount)) continue;
      rows.push({
        lineNumber: rows.length + 1,
        rowType: "monthly_payment",
        installmentNumber,
        feeType,
        amountInr: paidAmount,
        paidDate,
        dueDate: paidDate,
        status: "paid",
        note: `Imported installment ${installmentNumber} from statement PDF`,
      });
    }
  }

  const structureTokens = cleaned.slice(feeStructureIndex);
  const structureHeaderIndex = structureTokens.findIndex((item) => item === "Status");
  if (structureHeaderIndex !== -1) {
    const entries = structureTokens.slice(structureHeaderIndex + 1);
    const seen = new Set<number>();
    for (let index = 0; index + 4 < entries.length; index += 5) {
      const installmentNumber = Number(entries[index]);
      const feeType = entries[index + 1];
      const feeAmount = Number(entries[index + 2]);
      const balanceAmount = Number(entries[index + 3]);
      const dueDate = normalizeStatementDate(entries[index + 4], `due date for installment ${entries[index]}`);
      const status = String(entries[index + 5] || "").trim().toLowerCase();
      if (!Number.isFinite(installmentNumber) || !Number.isFinite(feeAmount) || !Number.isFinite(balanceAmount)) continue;
      if (seen.has(installmentNumber)) continue;
      seen.add(installmentNumber);

      const existingPaid = rows.find((row) => row.rowType === "monthly_payment" && row.installmentNumber === installmentNumber);
      if (existingPaid) {
        existingPaid.dueDate = dueDate;
        existingPaid.feeType = existingPaid.feeType || feeType;
        existingPaid.note = existingPaid.note || `Imported installment ${installmentNumber} from statement PDF`;
      } else {
        rows.push({
          lineNumber: rows.length + 1,
          rowType: status === "paid" ? "monthly_payment" : "monthly_invoice",
          installmentNumber,
          feeType,
          amountInr: feeAmount,
          dueDate,
          status: status === "paid" ? "paid" : normalizeInvoiceStatus(status, rows.length + 1),
          note: `Imported installment ${installmentNumber} from statement PDF`,
        });
      }
      index += 1;
    }
  }

  if (summary.totalFeesInr !== undefined || summary.feesPaidInr !== undefined || summary.dueAmountInr !== undefined || summary.concessionAmountInr !== undefined) {
    rows[0].note = `Imported from fee statement PDF | total=${summary.totalFeesInr ?? 0} | paid=${summary.feesPaidInr ?? 0} | due=${summary.dueAmountInr ?? 0} | concession=${summary.concessionAmountInr ?? 0}`;
  }

  return rows;
}

function extractFirstPdfFromZip(buffer: Buffer) {
  const entries = extractZipEntries(buffer);
  for (const [fileName, payload] of entries.entries()) {
    if (fileName.toLowerCase().endsWith(".pdf")) return payload;
  }

  throw new Error("Could not find a PDF inside the uploaded ZIP file.");
}

function parsePdfStatementRows(buffer: Buffer) {
  const decodedStreams = extractDecodedPdfStreams(buffer);
  const tokens = decodedStreams.flatMap((stream) => extractPdfTextOperators(stream));
  if (!tokens.length) throw new Error("Could not read text from the uploaded PDF statement.");
  return parseStatementRows(tokens);
}

function normalizeHeader(value: string) {
  const compact = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return HEADER_ALIASES[compact] || compact;
}

function asNumber(raw: string | undefined) {
  const value = String(raw || "").trim();
  if (!value) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function asDate(raw: string | undefined) {
  const value = String(raw || "").trim();
  if (!value) return undefined;
  const ddMmYyyy = value.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ddMmYyyy) {
    const [, day, month, year, hh, mm, ss] = ddMmYyyy;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hh || 0), Number(mm || 0), Number(ss || 0));
    if (!Number.isNaN(date.getTime())) return date;
  }
  const ddMonYyyy = value.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?)?$/i);
  if (ddMonYyyy) {
    const [, day, mon, year, hh, mm, ss, meridiem] = ddMonYyyy;
    const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIndex = monthNames.indexOf(mon.toLowerCase());
    if (monthIndex >= 0) {
      let hours = Number(hh || 0);
      if ((meridiem || "").toUpperCase() === "PM" && hours < 12) hours += 12;
      if ((meridiem || "").toUpperCase() === "AM" && hours === 12) hours = 0;
      const date = new Date(Number(year), monthIndex, Number(day), hours, Number(mm || 0), Number(ss || 0));
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  // A CSV saved out of Excel can still carry the bare serial. Bounded to
  // 1954-2119 so a plain year never reads as one, and checked before the
  // fallback below because `new Date("45955")` happily returns the year 45955.
  if (/^\d{5}(?:\.\d+)?$/.test(value)) {
    const serial = Number(value);
    if (serial >= 20000 && serial <= 80000) return excelSerialToDate(serial);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function requireDate(value: Date | undefined, field: string, lineNumber: number) {
  if (!value) throw new Error(`Line ${lineNumber}: ${field} is required and must be a valid date.`);
  return value;
}

function requireNumber(value: number | undefined, field: string, lineNumber: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Line ${lineNumber}: ${field} is required and must be a number.`);
  }
  return value;
}

function normalizeRowType(raw: string, lineNumber: number): SupportedRowType {
  const value = raw.trim().toLowerCase();
  if (
    value === "attendance" ||
    value === "credit_summary" ||
    value === "credit_payment" ||
    value === "monthly_summary" ||
    value === "monthly_invoice" ||
    value === "monthly_payment" ||
    value === "history_payment"
  ) {
    return value;
  }
  throw new Error(
    `Line ${lineNumber}: unsupported row_type "${raw}". Use attendance, credit_summary, credit_payment, monthly_summary, monthly_invoice, monthly_payment, or history_payment.`
  );
}

function inferRowType(rawRow: Record<string, string>, lineNumber: number): SupportedRowType {
  const explicit = String(rawRow.row_type || "").trim();
  if (explicit) return normalizeRowType(explicit, lineNumber);

  const hasAttendance = Boolean(rawRow.event_date || rawRow.attendance_status);
  if (hasAttendance) return "attendance";

  const hasInstallment = Boolean(rawRow.installment_number || rawRow.due_date || rawRow.paid_date || rawRow.paid_amount_inr || rawRow.amount_inr);
  if (hasInstallment) {
    return rawRow.paid_date || String(rawRow.status || "").trim().toLowerCase() === "paid" ? "monthly_payment" : "monthly_invoice";
  }

  const hasMonthlySummary = Boolean(rawRow.total_fees_inr || rawRow.fees_paid_inr || rawRow.due_amount_inr || rawRow.concession_amount_inr);
  if (hasMonthlySummary) return "monthly_summary";

  throw new Error(`Line ${lineNumber}: row_type is missing and could not be inferred.`);
}

function normalizeAttendanceStatus(raw: string | undefined, lineNumber: number) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return undefined;
  if (value === "present" || value === "absent" || value === "late" || value === "excused") return value;
  throw new Error(`Line ${lineNumber}: unsupported attendance_status "${raw}".`);
}

function normalizeInvoiceStatus(raw: string | undefined, lineNumber: number) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return undefined;
  if (value === "draft" || value === "unpaid" || value === "paid" || value === "overdue" || value === "cancelled") return value;
  throw new Error(`Line ${lineNumber}: unsupported status "${raw}".`);
}

function parseImportRows(fileText: string) {
  const parsed = parseCsv(fileText);
  if (parsed.length < 2) throw new Error("The CSV must include a header row and at least one data row.");

  const headers = parsed[0].map(normalizeHeader);
  const rows: ImportRow[] = [];

  for (let index = 1; index < parsed.length; index += 1) {
    const values = parsed[index];
    const rawRow: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      rawRow[header] = String(values[headerIndex] || "").trim();
    });

    const lineNumber = index + 1;
    const rowType = inferRowType(rawRow, lineNumber);
    rows.push({
      lineNumber,
      rowType,
      installmentNumber: asNumber(rawRow.installment_number),
      feeType: rawRow.fee_type || undefined,
      eventDate: asDate(rawRow.event_date),
      invoiceDate: asDate(rawRow.invoice_date),
      dueDate: asDate(rawRow.due_date),
      paidDate: asDate(rawRow.paid_date),
      firstInvoiceDate: asDate(rawRow.first_invoice_date),
      attendanceStatus: normalizeAttendanceStatus(rawRow.attendance_status, lineNumber),
      durationMinutes: asNumber(rawRow.duration_minutes),
      amountInr: asNumber(rawRow.amount_inr) ?? asNumber(rawRow.paid_amount_inr),
      credits: asNumber(rawRow.credits),
      creditBalance: asNumber(rawRow.credit_balance),
      totalCreditsPurchased: asNumber(rawRow.total_credits_purchased),
      totalCreditsConsumed: asNumber(rawRow.total_credits_consumed),
      status: normalizeInvoiceStatus(rawRow.status, lineNumber),
      referenceNumber: rawRow.reference_number || undefined,
      note: rawRow.note || undefined,
    });
  }

  return rows;
}

/**
 * A payment-history workbook is a record of what a student already paid on the
 * old platform, not a fresh purchase. It is imported as flat paid history:
 * every row becomes a standalone paid invoice, so the amounts never have to
 * line up with the student's current fee plan and no credits are granted.
 */
export function parsePaymentHistoryWorkbook(buffer: Buffer, _options: ImportParseOptions = {}) {
  const sheetRows = parseSimpleXlsxRows(buffer);
  if (sheetRows.length < 2) throw new Error("The Excel file must include a header row and at least one payment row.");
  const headers = sheetRows[0].map(normalizeHeader);
  const rows: ImportRow[] = [];

  for (let index = 1; index < sheetRows.length; index += 1) {
    const values = sheetRows[index];
    const rawRow: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      rawRow[header] = String(values[headerIndex] || "").trim();
    });
    const amountInr = asNumber(rawRow.paid_amount_inr || rawRow.amount_inr);
    if (!amountInr) continue;

    const paidDate = asDate(rawRow.paid_date);
    const collectedDate = asDate(rawRow.collected_date);
    const dueDate = asDate(rawRow.due_date);
    const hasReceipt = Boolean(rawRow.reference_number);
    const hasInstallment = Boolean(rawRow.installment_number);
    const hasStudentName = Boolean(rawRow.name);
    const hasAnyDate = Boolean(paidDate || collectedDate || dueDate);
    if (!hasAnyDate || (!hasReceipt && !hasInstallment && !hasStudentName)) continue;
    rows.push({
      lineNumber: index + 1,
      rowType: "history_payment",
      installmentNumber: asNumber(rawRow.installment_number),
      feeType: rawRow.fee_type || "Tuition Fees",
      receiptNumber: rawRow.reference_number || undefined,
      amountInr,
      paidDate: paidDate || collectedDate || dueDate,
      dueDate: dueDate || paidDate || collectedDate,
      status: "paid",
      referenceNumber: rawRow.reference_number || undefined,
      note: rawRow.reference_number ? `Imported from payment history ${rawRow.reference_number}` : "Imported from payment history workbook",
    });
  }

  if (!rows.length) throw new Error("No payment rows were found in the Excel file.");
  return rows;
}

async function ensureLegacyAttendanceClassroom(studentId: string, studentName: string) {
  const title = `${studentName} Legacy Attendance`;
  const existing = await Classroom.findOne({
    title,
    isActive: true,
    description: "Legacy attendance imported during platform migration.",
    students: new Types.ObjectId(studentId),
  });
  if (existing) return existing;

  return Classroom.create({
    title,
    description: "Legacy attendance imported during platform migration.",
    classroomType: "series",
    status: "completed",
    levelName: "Legacy import",
    topicName: "Imported attendance history",
    courseName: "Legacy migration",
    students: [new Types.ObjectId(studentId)],
    durationMinutes: 60,
  });
}

function toPaise(amountInr: number) {
  return Math.round(amountInr * 100);
}

function planTaxDetails(plan: any) {
  const mode = plan?.gstMode === "included" || plan?.gstMode === "excluded" ? plan.gstMode : "non_gst";
  return {
    invoiceMode: mode as "included" | "excluded" | "non_gst",
    gstPercentage: mode === "non_gst" ? 0 : Math.max(0, Number(plan?.gstPercentage || 0)),
  };
}

async function createImportedInvoice(params: {
  studentId: string;
  assignmentId?: string;
  planId?: string;
  type: "monthly" | "credits" | "manual";
  title: string;
  amountInr: number;
  dueDate: Date;
  issueDate?: Date;
  credits?: number;
  actorId?: string;
  referenceNumber?: string;
  note?: string;
  paidDate?: Date;
  status?: "draft" | "unpaid" | "paid" | "overdue" | "cancelled";
  invoiceMode?: "included" | "excluded" | "non_gst";
  gstPercentage?: number;
}) {
  const existing = params.referenceNumber
    ? await Invoice.findOne({ student: params.studentId, referenceNumber: params.referenceNumber }).lean()
    : null;
  if (existing) return existing;

  const invoice = await createInvoice({
    student: params.studentId,
    assignment: params.assignmentId,
    plan: params.planId,
    type: params.type,
    title: params.title,
    amount: toPaise(params.amountInr),
    issueDate: params.issueDate,
    dueDate: params.dueDate,
    referenceNumber: params.referenceNumber,
    credits: params.credits,
    notes: params.note ? `Legacy import: ${params.note}` : "Legacy import",
    invoiceMode: params.invoiceMode || "non_gst",
    gstPercentage: params.invoiceMode === "non_gst" ? 0 : Number(params.gstPercentage || 0),
    activity: {
      actor: params.actorId,
      source: "manual_admin",
      label: `Imported ${params.type} invoice history`,
    },
  });

  if (params.status === "paid" || params.paidDate) {
    await markInvoicePaid(
      invoice._id.toString(),
      undefined,
      {
        actor: params.actorId,
        source: "manual_admin",
        label: `Imported paid ${params.type} invoice history`,
      },
      [
        {
          mode: "other",
          amount: invoice.totalAmount,
          paidAt: params.paidDate || params.dueDate,
          referenceNumber: params.referenceNumber,
        },
      ],
      {},
      { notifyStudent: false }
    );
    return Invoice.findById(invoice._id);
  }

  if (params.status && params.status !== "unpaid") {
    await Invoice.findByIdAndUpdate(invoice._id, { status: params.status });
  }

  return invoice;
}

function parseImportRowsFromBuffer(fileBuffer: Buffer, fileName: string, options: ImportParseOptions = {}) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return parseImportRows(fileBuffer.toString("utf8"));
  }
  if (lowerName.endsWith(".xlsx")) {
    return parsePaymentHistoryWorkbook(fileBuffer, options);
  }
  if (lowerName.endsWith(".pdf")) {
    return parsePdfStatementRows(fileBuffer);
  }
  if (lowerName.endsWith(".zip")) {
    return parsePdfStatementRows(extractFirstPdfFromZip(fileBuffer));
  }
  throw new Error("Unsupported file type. Upload a CSV, XLSX, PDF statement, or ZIP containing a PDF statement.");
}

export async function importLegacyStudentData(input: {
  studentId: string;
  planId?: string;
  actorId?: string;
  fileBuffer: Buffer;
  fileName: string;
}) {
  const student: any = await User.findOne({ _id: input.studentId, role: "student" }).lean();
  if (!student) throw new Error("Selected student could not be found.");

  const [existingAssignment, selectedPlan] = await Promise.all([
    FeeAssignment.findOne({ student: input.studentId }),
    input.planId && Types.ObjectId.isValid(input.planId) ? FeePlan.findById(input.planId) : Promise.resolve(null),
  ]);

  const targetPlan: any = selectedPlan || (existingAssignment?.plan ? await FeePlan.findById(existingAssignment.plan) : null);
  const tax = planTaxDetails(targetPlan);
  const rows = parseImportRowsFromBuffer(input.fileBuffer, input.fileName, {
    planType: targetPlan?.type || existingAssignment?.type,
    creditPlanAmountInr: targetPlan?.amount ? Number(targetPlan.amount) / 100 : undefined,
    creditPlanCredits: targetPlan?.credits ? Number(targetPlan.credits) : undefined,
  });
  const feeRows = rows.filter((row) => row.rowType !== "attendance");
  const requiresStructuredPlan = feeRows.some((row) => row.rowType === "credit_summary" || row.rowType === "credit_payment");
  if (requiresStructuredPlan && !targetPlan && !existingAssignment) {
    throw new Error("Choose a fee plan before importing fee history for this student.");
  }

  const importedPlanType = feeRows.some((row) => row.rowType.startsWith("credit_"))
    ? "credits"
    : feeRows.some((row) => row.rowType.startsWith("monthly_"))
      ? "monthly"
      : undefined;

  if (targetPlan && importedPlanType && targetPlan.type !== importedPlanType) {
    throw new Error(`The selected fee plan is ${targetPlan.type}, but the CSV contains ${importedPlanType} rows.`);
  }

  const firstKnownInvoiceDate = rows
    .flatMap((row) => [row.firstInvoiceDate, row.invoiceDate, row.dueDate])
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => left.getTime() - right.getTime())[0];

  // History rows are pure record-keeping: they must never re-assign the plan,
  // shift the billing dates, or add credits to the student's balance.
  const needsAssignment = feeRows.some((row) => row.rowType !== "history_payment");

  let assignment: any = existingAssignment;
  if (targetPlan && needsAssignment) {
    const historyNote = `${new Date().toISOString()} | ${targetPlan.name} | ${targetPlan.type} | Legacy migration import`;
    assignment = await FeeAssignment.findOneAndUpdate(
      { student: new Types.ObjectId(input.studentId) },
      {
        $set: {
          student: new Types.ObjectId(input.studentId),
          plan: targetPlan._id,
          type: targetPlan.type,
          billingStartDate: existingAssignment?.billingStartDate || firstKnownInvoiceDate || new Date(),
          firstDueDate: existingAssignment?.firstDueDate || firstKnownInvoiceDate || new Date(),
          creditBalance: existingAssignment?.creditBalance || 0,
          totalCreditsPurchased: existingAssignment?.totalCreditsPurchased || 0,
          totalCreditsConsumed: existingAssignment?.totalCreditsConsumed || 0,
        },
        $push: { history: historyNote },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  let attendanceImported = 0;
  let invoicesImported = 0;
  let summariesApplied = 0;

  let legacyClassroom: any = null;
  for (const row of rows) {
    if (row.rowType === "attendance") {
      legacyClassroom = legacyClassroom || (await ensureLegacyAttendanceClassroom(input.studentId, student.name));
      const eventDate = requireDate(row.eventDate, "event_date", row.lineNumber);
      const attendanceStatus = row.attendanceStatus || "present";
      await Attendance.findOneAndUpdate(
        {
          classroom: legacyClassroom._id,
          scheduledSessionId: `legacy-import-${row.lineNumber}`,
          sessionDate: eventDate,
        },
        {
          classroom: legacyClassroom._id,
          scheduledSessionId: `legacy-import-${row.lineNumber}`,
          sessionDate: eventDate,
          coachStatus: "present",
          teachingMinutes: Math.max(0, Number(row.durationMinutes || 60)),
          actualTeachingMinutes: Math.max(0, Number(row.durationMinutes || 60)),
          markedBy: input.actorId ? new Types.ObjectId(input.actorId) : undefined,
          records: [
            {
              student: new Types.ObjectId(input.studentId),
              status: attendanceStatus,
              note: row.note || "Imported from previous platform",
            },
          ],
          metadata: {
            importSource: "legacy_student_migration",
            lineNumber: row.lineNumber,
            note: row.note || "",
          },
        },
        { upsert: true, new: true }
      );
      attendanceImported += 1;
      continue;
    }

    if (row.rowType === "credit_payment") {
      if (!assignment || assignment.type !== "credits") {
        throw new Error(`Line ${row.lineNumber}: a credit plan must be assigned before importing credit payments.`);
      }
      const amountInr = requireNumber(row.amountInr, "amount_inr", row.lineNumber);
      const credits = requireNumber(row.credits, "credits", row.lineNumber);
      const issueDate = row.invoiceDate || row.paidDate || row.dueDate;
      const dueDate = requireDate(row.dueDate || row.paidDate || row.invoiceDate, "due_date", row.lineNumber);
      await createImportedInvoice({
        studentId: input.studentId,
        assignmentId: assignment._id.toString(),
        planId: assignment.plan.toString(),
        type: "credits",
        title: `Imported credit recharge${row.note ? ` - ${row.note}` : ""}`,
        amountInr,
        issueDate,
        dueDate,
        credits,
        actorId: input.actorId,
        referenceNumber: row.referenceNumber,
        note: row.note,
        paidDate: row.paidDate || dueDate,
        status: "paid",
        invoiceMode: tax.invoiceMode,
        gstPercentage: tax.gstPercentage,
      });
      invoicesImported += 1;
      continue;
    }

    if (row.rowType === "history_payment") {
      const amountInr = requireNumber(row.amountInr, "amount_inr", row.lineNumber);
      const dueDate = requireDate(row.dueDate || row.paidDate || row.invoiceDate, "due_date", row.lineNumber);
      await createImportedInvoice({
        studentId: input.studentId,
        type: "manual",
        title: row.receiptNumber
          ? `Imported receipt ${row.receiptNumber}${row.installmentNumber ? ` - Installment ${row.installmentNumber}` : ""}`
          : row.note || `Imported fee payment - ${dueDate.toLocaleString("en-IN", { month: "long", year: "numeric" })}`,
        amountInr,
        issueDate: row.invoiceDate || dueDate,
        dueDate,
        actorId: input.actorId,
        referenceNumber: row.receiptNumber || row.referenceNumber,
        note: row.note,
        paidDate: row.paidDate || dueDate,
        status: "paid",
        invoiceMode: "non_gst",
        gstPercentage: 0,
      });
      invoicesImported += 1;
      continue;
    }

    if (row.rowType === "monthly_payment" || row.rowType === "monthly_invoice") {
      const amountInr = requireNumber(row.amountInr, "amount_inr", row.lineNumber);
      const issueDate = row.invoiceDate || row.dueDate || row.paidDate;
      const dueDate = requireDate(row.dueDate || row.invoiceDate || row.paidDate, "due_date", row.lineNumber);
      const useMonthlyAssignment = assignment && assignment.type === "monthly";
      const invoiceType = useMonthlyAssignment ? "monthly" as const : "manual" as const;
      await createImportedInvoice({
        studentId: input.studentId,
        assignmentId: useMonthlyAssignment ? assignment._id.toString() : undefined,
        planId: useMonthlyAssignment ? assignment.plan.toString() : undefined,
        type: invoiceType,
        title: row.receiptNumber
          ? `Imported receipt ${row.receiptNumber}${row.installmentNumber ? ` - Installment ${row.installmentNumber}` : ""}`
          : row.note || `Imported monthly fee - ${dueDate.toLocaleString("en-IN", { month: "long", year: "numeric" })}`,
        amountInr,
        issueDate,
        dueDate,
        actorId: input.actorId,
        referenceNumber: row.receiptNumber || row.referenceNumber,
        note: row.note,
        paidDate: row.rowType === "monthly_payment" ? row.paidDate || dueDate : row.paidDate,
        status: row.rowType === "monthly_payment" ? "paid" : row.status || "unpaid",
        invoiceMode: useMonthlyAssignment ? tax.invoiceMode : "non_gst",
        gstPercentage: useMonthlyAssignment ? tax.gstPercentage : 0,
      });
      invoicesImported += 1;
      continue;
    }
  }

  const creditSummary = rows.find((row) => row.rowType === "credit_summary");
  const monthlySummary = rows.find((row) => row.rowType === "monthly_summary");
  if (assignment && creditSummary && assignment.type === "credits") {
    const nextSet: Record<string, unknown> = {};
    if (creditSummary.firstInvoiceDate) {
      nextSet.billingStartDate = creditSummary.firstInvoiceDate;
      nextSet.firstDueDate = creditSummary.firstInvoiceDate;
    }
    if (typeof creditSummary.creditBalance === "number") nextSet.creditBalance = creditSummary.creditBalance;
    if (typeof creditSummary.totalCreditsPurchased === "number") nextSet.totalCreditsPurchased = creditSummary.totalCreditsPurchased;
    if (typeof creditSummary.totalCreditsConsumed === "number") nextSet.totalCreditsConsumed = creditSummary.totalCreditsConsumed;
    if (Object.keys(nextSet).length > 0) {
      await FeeAssignment.findByIdAndUpdate(assignment._id, { $set: nextSet });
      summariesApplied += 1;
    }
  }

  if (assignment && monthlySummary && assignment.type === "monthly") {
    const nextSet: Record<string, unknown> = {};
    const firstMonthlyDate = monthlySummary.firstInvoiceDate
      || rows
        .filter((row) => row.rowType === "monthly_payment" || row.rowType === "monthly_invoice")
        .flatMap((row) => [row.dueDate, row.paidDate, row.invoiceDate])
        .filter((value): value is Date => Boolean(value))
        .sort((left, right) => left.getTime() - right.getTime())[0];
    if (firstMonthlyDate) {
      nextSet.billingStartDate = firstMonthlyDate;
      nextSet.firstDueDate = firstMonthlyDate;
    }
    if (Object.keys(nextSet).length > 0) {
      await FeeAssignment.findByIdAndUpdate(assignment._id, { $set: nextSet });
      summariesApplied += 1;
    }
  }

  if (creditSummary?.note && assignment?.type === "credits") {
    const summaryLedger = await CreditLedger.findOneAndUpdate(
      {
        student: new Types.ObjectId(input.studentId),
        assignment: assignment._id,
        type: "adjustment",
        sourceType: "LegacyImport",
        sourceId: assignment._id,
      },
      {
        student: new Types.ObjectId(input.studentId),
        assignment: assignment._id,
        type: "adjustment",
        credits: 0,
        balanceAfter: typeof creditSummary.creditBalance === "number" ? creditSummary.creditBalance : assignment.creditBalance || 0,
        sourceType: "LegacyImport",
        sourceId: assignment._id,
        note: `Legacy import summary: ${creditSummary.note}`,
      },
      { upsert: true, new: true }
    );
    await recordActivity({
      actor: input.actorId,
      targetUser: input.studentId,
      type: "fees.credits.adjusted",
      label: "Imported opening credit summary",
      entityType: "CreditLedger",
      entityId: summaryLedger._id.toString(),
      metadata: { source: "legacy_import" },
    });
  }

  await recordActivity({
    actor: input.actorId,
    targetUser: input.studentId,
    type: "student.legacy_import.completed",
    label: `Imported legacy records for ${student.name}`,
    entityType: "User",
    entityId: input.studentId,
    metadata: {
      attendanceImported,
      invoicesImported,
      summariesApplied,
      source: "legacy_import",
    },
  });

  return {
    attendanceImported,
    invoicesImported,
    summariesApplied,
  } satisfies ImportResult;
}
