import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { getAcademySettings } from "@/lib/fees";
import { Invoice } from "@/models/Fee";

export const dynamic = "force-dynamic";

const PAGE = { width: 595, height: 842 };
const BRAND = "#5a1372";
const ACCENT = "#fde75a";
const INK = "#172033";
const MUTED = "#667085";
const LINE = "#e6d8eb";
const SOFT = "#fbf7fd";
const GREEN = "#0f8a5f";
const RED = "#b42318";

type FontName = "regular" | "bold" | "italic";
type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/[()\\]/g, (match) => `\\${match}`)
    .replace(/[^\x20-\x7E]/g, "");
}

function money(paise: unknown) {
  const amount = Number(paise || 0) / 100;
  return `INR ${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function date(value: unknown) {
  const parsed = value ? new Date(value as any) : new Date();
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function titleCase(value: unknown) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeFilename(value: unknown) {
  return String(value || "invoice")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "invoice";
}

function textWidth(value: string, size: number) {
  return value.length * size * 0.52;
}

function wrapText(value: unknown, size: number, maxWidth: number) {
  const words = esc(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (textWidth(next, size) <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

class PdfCanvas {
  private commands: string[] = [];

  private y(top: number) {
    return PAGE.height - top;
  }

  color(hex: string) {
    const [r, g, b] = hexToRgb(hex);
    return `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`;
  }

  rect(x: number, top: number, width: number, height: number, fill?: string, stroke?: string, lineWidth = 1) {
    this.commands.push("q");
    if (fill) this.commands.push(`${this.color(fill)} rg`);
    if (stroke) this.commands.push(`${this.color(stroke)} RG`);
    this.commands.push(`${lineWidth} w`);
    this.commands.push(`${x} ${this.y(top + height)} ${width} ${height} re ${fill && stroke ? "B" : fill ? "f" : "S"}`);
    this.commands.push("Q");
  }

  line(x1: number, top1: number, x2: number, top2: number, color = LINE, lineWidth = 1) {
    this.commands.push("q");
    this.commands.push(`${this.color(color)} RG`);
    this.commands.push(`${lineWidth} w`);
    this.commands.push(`${x1} ${this.y(top1)} m ${x2} ${this.y(top2)} l S`);
    this.commands.push("Q");
  }

  circle(x: number, top: number, radius: number, fill: string) {
    const c = radius * 0.5522847498;
    const cy = this.y(top);
    this.commands.push("q");
    this.commands.push(`${this.color(fill)} rg`);
    this.commands.push(`${x + radius} ${cy} m`);
    this.commands.push(`${x + radius} ${cy + c} ${x + c} ${cy + radius} ${x} ${cy + radius} c`);
    this.commands.push(`${x - c} ${cy + radius} ${x - radius} ${cy + c} ${x - radius} ${cy} c`);
    this.commands.push(`${x - radius} ${cy - c} ${x - c} ${cy - radius} ${x} ${cy - radius} c`);
    this.commands.push(`${x + c} ${cy - radius} ${x + radius} ${cy - c} ${x + radius} ${cy} c f`);
    this.commands.push("Q");
  }

  text(value: unknown, x: number, top: number, options: {
    size?: number;
    font?: FontName;
    color?: string;
    align?: "left" | "right" | "center";
    maxWidth?: number;
    lineHeight?: number;
  } = {}) {
    const size = options.size || 10;
    const fontKey = options.font === "bold" ? "F2" : options.font === "italic" ? "F3" : "F1";
    const color = options.color || INK;
    const lineHeight = options.lineHeight || size + 4;
    const lines = options.maxWidth ? wrapText(value, size, options.maxWidth) : [esc(value)];
    lines.forEach((line, index) => {
      let tx = x;
      if (options.align === "right") tx = x - textWidth(line, size);
      if (options.align === "center") tx = x - textWidth(line, size) / 2;
      this.commands.push("BT");
      this.commands.push(`/${fontKey} ${size} Tf`);
      this.commands.push(`${this.color(color)} rg`);
      this.commands.push(`${tx} ${this.y(top + index * lineHeight)} Td`);
      this.commands.push(`(${line}) Tj`);
      this.commands.push("ET");
    });
    return lines.length * lineHeight;
  }

  label(label: string, value: unknown, x: number, top: number, width: number) {
    this.text(label.toUpperCase(), x, top, { size: 7, font: "bold", color: MUTED, maxWidth: width });
    return this.text(value || "-", x, top + 13, { size: 10, font: "bold", color: INK, maxWidth: width, lineHeight: 13 });
  }

  output() {
    return this.commands.join("\n");
  }
}

function makePdf(invoice: any, settings: any) {
  const canvas = new PdfCanvas();
  const isGstInvoice = invoice.invoiceMode === "included" || invoice.invoiceMode === "excluded";
  const isPaid = invoice.status === "paid";
  const student = invoice.student || {};
  const plan = invoice.plan || {};
  const invoiceTitle = invoice.type === "credits"
    ? "Credit Plan Invoice"
    : invoice.type === "monthly"
      ? "Monthly Fee Invoice"
      : "Custom Fee Invoice";
  const taxMode = invoice.invoiceMode === "included"
    ? "GST included in amount"
    : invoice.invoiceMode === "excluded"
      ? "GST added separately"
      : "Non-GST invoice";

  canvas.rect(0, 0, PAGE.width, 842, "#ffffff");
  canvas.rect(0, 0, PAGE.width, 134, BRAND);
  canvas.rect(0, 134, PAGE.width, 12, ACCENT);

  canvas.rect(36, 31, 148, 62, "#ffffff");
  canvas.text("ENVISION", 52, 59, { size: 22, font: "bold", color: BRAND });
  canvas.text("CHESS ACADEMY", 54, 78, { size: 8, font: "bold", color: BRAND });
  canvas.circle(149, 60, 11, BRAND);
  canvas.text("E", 145, 64, { size: 12, font: "bold", color: ACCENT });

  canvas.text(isGstInvoice ? "TAX INVOICE" : "INVOICE", 559, 43, { size: 24, font: "bold", color: "#ffffff", align: "right" });
  canvas.text(invoiceTitle, 559, 66, { size: 10, color: ACCENT, align: "right" });
  canvas.text(`Invoice No: ${invoice.invoiceNumber || "-"}`, 559, 86, { size: 11, font: "bold", color: "#ffffff", align: "right" });
  canvas.text(`Status: ${titleCase(invoice.status)}`, 559, 103, { size: 9, font: "bold", color: isPaid ? ACCENT : "#ffffff", align: "right" });

  canvas.rect(36, 170, 250, 108, SOFT, LINE);
  canvas.text("From", 52, 194, { size: 8, font: "bold", color: BRAND });
  canvas.text(settings.academyName || "Envision Chess Academy", 52, 213, { size: 14, font: "bold", color: INK, maxWidth: 205, lineHeight: 16 });
  canvas.text(settings.registeredAddress || "Registered academy address not added", 52, 249, { size: 9, color: MUTED, maxWidth: 205, lineHeight: 12 });
  canvas.text([settings.email, settings.phone].filter(Boolean).join(" | ") || "Contact details not added", 52, 264, { size: 8, color: MUTED, maxWidth: 205, lineHeight: 11 });
  if (isGstInvoice) canvas.text(`GSTIN: ${settings.gstNumber || "Not added"}`, 52, 279, { size: 9, font: "bold", color: BRAND });

  canvas.rect(309, 170, 250, 108, "#ffffff", LINE);
  canvas.text("Bill To", 325, 194, { size: 8, font: "bold", color: BRAND });
  canvas.text(student.name || "Student", 325, 213, { size: 14, font: "bold", color: INK, maxWidth: 204, lineHeight: 16 });
  canvas.text(student.email || student.username || "Student details not added", 325, 249, { size: 9, color: MUTED, maxWidth: 204, lineHeight: 12 });
  canvas.text(`Plan: ${plan.name || titleCase(invoice.type)}`, 325, 264, { size: 9, color: MUTED, maxWidth: 204, lineHeight: 12 });
  if (invoice.credits) canvas.text(`Credits: ${invoice.credits}`, 325, 279, { size: 9, font: "bold", color: BRAND });

  canvas.rect(36, 302, 523, 82, "#ffffff", LINE);
  canvas.label("Issue Date", date(invoice.issueDate), 54, 327, 100);
  canvas.label("Due Date", date(invoice.dueDate), 171, 327, 100);
  canvas.label("Invoice Type", invoiceTitle, 288, 327, 118);
  canvas.label("Tax Mode", taxMode, 423, 327, 118);

  canvas.rect(36, 414, 523, 34, BRAND);
  canvas.text("Description", 54, 436, { size: 9, font: "bold", color: "#ffffff" });
  canvas.text("Qty", 334, 436, { size: 9, font: "bold", color: "#ffffff", align: "right" });
  canvas.text("Amount", 541, 436, { size: 9, font: "bold", color: "#ffffff", align: "right" });

  canvas.rect(36, 448, 523, 70, "#ffffff", LINE);
  canvas.text(invoice.title || plan.name || invoiceTitle, 54, 474, { size: 11, font: "bold", color: INK, maxWidth: 245, lineHeight: 14 });
  canvas.text(invoice.notes || "Academy fee generated through Envision Chess Academy LMS.", 54, 493, { size: 8, color: MUTED, maxWidth: 270, lineHeight: 11 });
  canvas.text(invoice.credits ? `${invoice.credits} credits` : "1", 334, 478, { size: 10, color: INK, align: "right" });
  canvas.text(money(invoice.amount), 541, 478, { size: 10, font: "bold", color: INK, align: "right" });

  canvas.rect(333, 540, 226, isGstInvoice ? 142 : 94, "#ffffff", LINE);
  let totalY = 565;
  const totalRow = (label: string, value: unknown, bold = false, color = INK) => {
    canvas.text(label, 350, totalY, { size: bold ? 10 : 9, font: bold ? "bold" : "regular", color });
    canvas.text(value, 541, totalY, { size: bold ? 10 : 9, font: bold ? "bold" : "regular", color, align: "right" });
    totalY += 19;
  };
  totalRow("Base amount", money(invoice.taxableAmount || invoice.amount));
  if (invoice.lateFee) totalRow("Late fee", money(invoice.lateFee));
  if (isGstInvoice) {
    totalRow(`CGST (${Number(invoice.gstPercentage || 0) / 2}%)`, money(invoice.cgstAmount || 0));
    totalRow(`SGST (${Number(invoice.gstPercentage || 0) / 2}%)`, money(invoice.sgstAmount || 0));
    totalRow("Total GST", money(invoice.gstAmount || 0));
  }
  canvas.line(350, totalY - 7, 541, totalY - 7, LINE);
  totalRow("Grand total", money(invoice.totalAmount), true, BRAND);

  const statusColor = isPaid ? GREEN : invoice.status === "cancelled" || invoice.status === "overdue" ? RED : BRAND;
  canvas.rect(36, 540, 260, 70, SOFT, LINE);
  canvas.text("Payment Status", 54, 566, { size: 8, font: "bold", color: MUTED });
  canvas.text(titleCase(invoice.status), 54, 591, { size: 18, font: "bold", color: statusColor });
  canvas.text(isPaid ? `Paid on ${date(invoice.paidAt)}` : `Payment due by ${date(invoice.dueDate)}`, 54, 608, { size: 9, color: MUTED });

  canvas.rect(36, 636, 260, 80, "#ffffff", LINE);
  canvas.text("Notes", 54, 662, { size: 9, font: "bold", color: BRAND });
  canvas.text(settings.invoiceFooter || "Thank you for choosing Envision Chess Academy. Please keep this invoice for your records.", 54, 684, {
    size: 8,
    color: MUTED,
    maxWidth: 220,
    lineHeight: 12,
  });

  canvas.rect(333, 704, 226, 84, "#ffffff", LINE);
  canvas.text("For", 350, 729, { size: 8, color: MUTED });
  canvas.text(settings.academyName || "Envision Chess Academy", 350, 746, { size: 10, font: "bold", color: INK, maxWidth: 180 });
  canvas.line(350, 772, 530, 772, BRAND, 1.2);
  canvas.text(settings.authorizedSignatory || "Authorized Signatory", 350, 790, { size: 9, font: "bold", color: INK });
  canvas.text(settings.signatoryUrl ? "Signature uploaded in academy settings" : "Authorized Signatory", 350, 805, { size: 7, color: MUTED });

  canvas.rect(36, 760, 260, 28, BRAND);
  canvas.text("This invoice was generated digitally by Envision LMS.", 54, 778, { size: 8, color: "#ffffff", maxWidth: 220 });

  const content = canvas.output();
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const invoice: any = await Invoice.findById(params.id).populate("student plan").lean();
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = (session.user as any).role;
  if (role !== "admin" && invoice.student?._id?.toString() !== (session.user as any).id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const settings: any = await getAcademySettings();
  const pdf = makePdf(invoice, settings);
  const filename = `${safeFilename(invoice.invoiceNumber)}.pdf`;

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
