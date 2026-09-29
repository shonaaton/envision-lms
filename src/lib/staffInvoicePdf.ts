import "server-only";

import { monthLabel } from "@/lib/feedback/feedbackCycleDates";
import { ACCENT, BRAND, INK, LINE, MUTED, PAGE, PANEL, PdfCanvas, buildPdf, fitImage, parseImage, type PdfImage } from "@/lib/pdf/simplePdf";
import { ACADEMY_BILL_TO, ACCOUNT_TYPE_LABELS, KIND_LABELS, hoursLabel, invoiceDateLabel, invoiceMoney } from "@/lib/staffInvoice";

/**
 * The staff member's invoice to the academy, as an A4 PDF.
 *
 * Drawn only from the invoice's own snapshot (lines, bill-from, bank, signature)
 * so a PDF downloaded next year matches the one emailed this month. The table
 * carries over onto further pages when there are many classrooms; the totals,
 * bank details and signature always stay together.
 */

const LEFT = 34;
const RIGHT = PAGE.width - 34;
const WIDTH = RIGHT - LEFT;
const FOOTER_TOP = 806;
const ROW_HEIGHT = 30;
const CLOSING_HEIGHT = 262;
const BODY_TEXT = "#344054";

const COLUMNS = {
  index: LEFT + 10,
  description: LEFT + 30,
  classes: LEFT + 334,
  hours: LEFT + 376,
  rate: LEFT + 448,
  amount: RIGHT - 10,
};

function quantityLabel(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function lineSubtitle(line: any) {
  if (line.group === "manual") return "Other item";
  if (line.group === "class") return [line.batchName, KIND_LABELS[line.kind as keyof typeof KIND_LABELS]].filter(Boolean).join(" - ");
  return line.group === "demo" ? "Trial classes taken this month" : "Demo students who enrolled";
}

function tableHeader(canvas: PdfCanvas, top: number) {
  canvas.rect(LEFT, top, WIDTH, 24, BRAND);
  const y = top + 15;
  // Title case, not capitals: right-aligned text is placed by an estimated
  // width, and bold capitals run wider than the estimate.
  const style = { size: 8, font: "bold" as const, color: "#ffffff" };
  canvas.text("#", COLUMNS.index, y, style);
  canvas.text("Description", COLUMNS.description, y, style);
  canvas.text("Classes", COLUMNS.classes, y, { ...style, align: "right" });
  canvas.text("Hours", COLUMNS.hours, y, { ...style, align: "right" });
  canvas.text("Rate per class", COLUMNS.rate, y, { ...style, align: "right" });
  canvas.text("Amount", COLUMNS.amount, y, { ...style, align: "right" });
  return top + 24;
}

function firstPageHeader(canvas: PdfCanvas, invoice: any) {
  const from = invoice.billFrom || {};
  const to = { ...ACADEMY_BILL_TO, ...(invoice.billTo || {}) };

  canvas.rect(0, 0, PAGE.width, 92, BRAND);
  canvas.rect(0, 92, PAGE.width, 5, ACCENT);
  canvas.text("INVOICE", LEFT, 52, { size: 26, font: "bold", color: "#ffffff" });
  canvas.text(`For services in ${monthLabel(invoice.month)}`, LEFT, 72, { size: 9, color: ACCENT });
  canvas.text(`Invoice No: ${invoice.invoiceNumber}`, RIGHT, 40, { size: 10, font: "bold", color: "#ffffff", align: "right" });
  canvas.text(`Invoice Date: ${invoiceDateLabel(invoice.month)}`, RIGHT, 56, { size: 9, color: "#ffffff", align: "right" });

  const panelTop = 116;
  const panelHeight = 172;
  const half = (WIDTH - 12) / 2;

  canvas.rect(LEFT, panelTop, half, panelHeight, "#ffffff", LINE);
  canvas.text("BILL FROM", LEFT + 14, panelTop + 20, { size: 7.5, font: "bold", color: BRAND });
  canvas.text(from.fullName || "-", LEFT + 14, panelTop + 38, { size: 12, font: "bold", color: INK, maxWidth: half - 28, maxLines: 2, lineHeight: 14 });
  let y = panelTop + 56;
  const addressLines = String(from.address || "").split(/\r?\n/).filter(Boolean);
  for (const part of addressLines) {
    y += canvas.text(part, LEFT + 14, y, { size: 8, color: BODY_TEXT, maxWidth: half - 28, maxLines: 3, lineHeight: 10.5 });
    if (y > panelTop + 110) break;
  }
  y = Math.max(y + 4, panelTop + 100);
  canvas.text(`PAN: ${from.pan || "-"}`, LEFT + 14, y, { size: 8, font: "bold", color: INK });
  if (from.phone) canvas.text(`Phone: ${from.phone}`, LEFT + 14, y + 13, { size: 8, color: BODY_TEXT, maxWidth: half - 28, maxLines: 1 });
  if (from.email) canvas.text(`Email: ${from.email}`, LEFT + 14, y + 26, { size: 8, color: BODY_TEXT, maxWidth: half - 28, maxLines: 1 });

  const toLeft = LEFT + half + 12;
  canvas.rect(toLeft, panelTop, half, panelHeight, PANEL, LINE);
  canvas.text("BILL TO", toLeft + 14, panelTop + 20, { size: 7.5, font: "bold", color: BRAND });
  canvas.text(to.name, toLeft + 14, panelTop + 38, { size: 12, font: "bold", color: INK, maxWidth: half - 28, maxLines: 1 });
  const toLines: Array<[string, boolean]> = [
    [`Registered name: ${to.registeredName}`, false],
    ...(to.addressLines || []).map((line: string) => [line, false] as [string, boolean]),
    [to.affiliation, false],
    [`PAN: ${to.pan}`, true],
    [`GSTN: ${to.gstin}`, true],
    [to.phone, false],
    [to.email, false],
    [to.website, false],
  ];
  toLines.forEach(([text, strong], index) => {
    canvas.text(text, toLeft + 14, panelTop + 56 + index * 11, { size: 7.8, font: strong ? "bold" : "regular", color: strong ? INK : BODY_TEXT, maxWidth: half - 28, maxLines: 1 });
  });

  return tableHeader(canvas, panelTop + panelHeight + 20);
}

function continuationHeader(canvas: PdfCanvas, invoice: any) {
  canvas.rect(0, 0, PAGE.width, 6, BRAND);
  canvas.text(`Invoice ${invoice.invoiceNumber} - ${invoice.billFrom?.fullName || ""} (continued)`, LEFT, 34, { size: 9, font: "bold", color: INK });
  return tableHeader(canvas, 50);
}

function drawRow(canvas: PdfCanvas, line: any, index: number, top: number) {
  if (index % 2 === 1) canvas.rect(LEFT, top, WIDTH, ROW_HEIGHT, PANEL);
  canvas.line(LEFT, top + ROW_HEIGHT, RIGHT, top + ROW_HEIGHT, LINE, 0.6);
  const y = top + 13;
  canvas.text(String(index + 1), COLUMNS.index, y, { size: 8.5, color: MUTED });
  canvas.text(line.title, COLUMNS.description, y, { size: 8.8, font: "bold", color: INK, maxWidth: 270, maxLines: 1 });
  canvas.text(lineSubtitle(line), COLUMNS.description, y + 11, { size: 7, color: MUTED, maxWidth: 270, maxLines: 1 });
  canvas.text(quantityLabel(Number(line.quantity || 0)), COLUMNS.classes, y + 4, { size: 8.8, color: INK, align: "right" });
  canvas.text(line.minutes ? hoursLabel(line.minutes) : "-", COLUMNS.hours, y + 4, { size: 8.8, color: INK, align: "right" });
  canvas.text(invoiceMoney(line.rate), COLUMNS.rate, y + 4, { size: 8.5, color: INK, align: "right" });
  canvas.text(invoiceMoney(line.amount), COLUMNS.amount, y + 4, { size: 8.8, font: "bold", color: INK, align: "right" });
}

function drawClosing(canvas: PdfCanvas, invoice: any, top: number, signature: PdfImage | null) {
  const from = invoice.billFrom || {};
  const bank = from.bank || {};

  canvas.rect(LEFT, top, WIDTH, 30, "#ffffff", BRAND, 1.2);
  const classes = (invoice.lines || []).filter((line: any) => line.group !== "manual").reduce((sum: number, line: any) => sum + Number(line.quantity || 0), 0);
  if (classes) canvas.text(`${classes} class${classes === 1 ? "" : "es"} in total`, LEFT + 14, top + 19, { size: 8, color: MUTED });
  canvas.text("Total", COLUMNS.hours, top + 19, { size: 10, font: "bold", color: BRAND, align: "right" });
  canvas.text(invoiceMoney(invoice.total), COLUMNS.amount, top + 19, { size: 11, font: "bold", color: INK, align: "right" });

  const wordsTop = top + 42;
  canvas.rect(LEFT, wordsTop, WIDTH, 44, PANEL, LINE);
  canvas.text("AMOUNT IN WORDS", LEFT + 14, wordsTop + 16, { size: 7.5, font: "bold", color: BRAND });
  canvas.text(invoice.totalInWords, LEFT + 14, wordsTop + 31, { size: 9, font: "bold", color: INK, maxWidth: WIDTH - 28, maxLines: 1 });

  const blockTop = wordsTop + 56;
  const half = (WIDTH - 12) / 2;
  canvas.rect(LEFT, blockTop, half, 132, "#ffffff", LINE);
  canvas.text("PLEASE TRANSFER TO", LEFT + 14, blockTop + 18, { size: 7.5, font: "bold", color: BRAND });
  const bankRows: Array<[string, string]> = [
    ["Account holder", bank.accountHolder || from.fullName || "-"],
    ["Bank name", bank.bankName || "-"],
    ["Account number", bank.accountNumber || "-"],
    ["Branch", bank.branchName || "-"],
    ["IFSC code", bank.ifsc || "-"],
    ["Account type", ACCOUNT_TYPE_LABELS[bank.accountType as "savings" | "current"] || bank.accountType || "-"],
  ];
  bankRows.forEach(([label, value], index) => {
    const y = blockTop + 36 + index * 15;
    canvas.text(label, LEFT + 14, y, { size: 7.8, color: MUTED });
    canvas.text(value, LEFT + 104, y, { size: 8.5, font: "bold", color: INK, maxWidth: half - 118, maxLines: 1 });
  });

  const signLeft = LEFT + half + 12;
  canvas.rect(signLeft, blockTop, half, 132, "#ffffff", LINE);
  canvas.text("SIGNATURE", signLeft + 14, blockTop + 18, { size: 7.5, font: "bold", color: BRAND });
  if (signature) {
    const fitted = fitImage(signature, half - 60, 56);
    canvas.image(signature.name, signLeft + 14, blockTop + 30 + (56 - fitted.height), fitted.width, fitted.height);
  }
  canvas.line(signLeft + 14, blockTop + 94, signLeft + half - 14, blockTop + 94, BRAND, 1);
  canvas.text(from.fullName || "", signLeft + 14, blockTop + 108, { size: 9, font: "bold", color: INK, maxWidth: half - 28, maxLines: 1 });
  canvas.text(`Date: ${invoiceDateLabel(invoice.month)}`, signLeft + 14, blockTop + 121, { size: 7.5, color: MUTED });
}

export function renderStaffInvoicePdf(invoice: any) {
  const signature = parseImage(invoice.signature, "ImSign");
  const lines: any[] = invoice.lines || [];
  const pages: PdfCanvas[] = [];

  let canvas = new PdfCanvas();
  pages.push(canvas);
  let top = firstPageHeader(canvas, invoice);

  lines.forEach((line, index) => {
    if (top + ROW_HEIGHT > FOOTER_TOP - 10) {
      canvas = new PdfCanvas();
      pages.push(canvas);
      top = continuationHeader(canvas, invoice);
    }
    drawRow(canvas, line, index, top);
    top += ROW_HEIGHT;
  });

  // Totals, bank details and signature are one block and never split.
  if (top + 12 + CLOSING_HEIGHT > FOOTER_TOP - 6) {
    canvas = new PdfCanvas();
    pages.push(canvas);
    canvas.rect(0, 0, PAGE.width, 6, BRAND);
    top = 30;
  }
  drawClosing(canvas, invoice, top + 12, signature);

  pages.forEach((page, index) => {
    page.line(LEFT, FOOTER_TOP, RIGHT, FOOTER_TOP, LINE, 0.8);
    page.text(`${invoice.billFrom?.fullName || ""} - Invoice ${invoice.invoiceNumber}`, LEFT, FOOTER_TOP + 14, { size: 7, color: MUTED, maxWidth: 360, maxLines: 1 });
    page.text(`Page ${index + 1} of ${pages.length}`, RIGHT, FOOTER_TOP + 14, { size: 7, color: MUTED, align: "right" });
  });

  return buildPdf(
    pages.map((page) => page.output()),
    signature ? [signature] : []
  );
}
