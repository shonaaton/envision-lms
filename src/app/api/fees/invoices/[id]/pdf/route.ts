import { NextResponse } from "next/server";
import { inflateSync, deflateSync } from "zlib";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { getAcademySettings } from "@/lib/fees";
import { Invoice } from "@/models/Fee";

export const dynamic = "force-dynamic";

const PAGE = { width: 595, height: 842 };
const BRAND = "#5a1372";
const ACCENT = "#fde75a";
const INK = "#101828";
const MUTED = "#667085";
const LINE = "#e7d9ec";
const PANEL = "#fbf8fc";
const GREEN = "#027a48";
const RED = "#b42318";

type FontName = "regular" | "bold" | "italic";
type PdfImage = {
  name: string;
  width: number;
  height: number;
  object: string;
  smask?: string;
};

function hexToRgb(hex: string) {
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
  return `INR ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

function date(value: unknown) {
  const parsed = value ? new Date(value as any) : new Date();
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function titleCase(value: unknown) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeFilename(value: unknown) {
  return String(value || "invoice").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "invoice";
}

function displayAcademyName(settings: any) {
  const name = String(settings?.academyName || "").trim();
  if (!name || name === "Envision Chess Academy") return "Envisions Chess Academy LLP";
  return name;
}

function textWidth(value: string, size: number) {
  return value.length * size * 0.49;
}

function wrapText(value: unknown, size: number, maxWidth: number, maxLines = 4) {
  const words = esc(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (textWidth(next, size) <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, lines[maxLines - 1].length - 3))}...`;
  }
  return lines.length ? lines : [""];
}

function dataUrlToBuffer(value: unknown) {
  const source = String(value || "");
  const match = source.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

function readUInt32(buffer: Buffer, offset: number) {
  return buffer.readUInt32BE(offset);
}

function parseJpegSize(buffer: Buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function unfilterPng(raw: Buffer, width: number, height: number, bytesPerPixel: number) {
  const rowBytes = width * bytesPerPixel;
  const result = Buffer.alloc(rowBytes * height);
  let input = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[input++];
    const rowStart = y * rowBytes;
    const prevStart = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const rawByte = raw[input++];
      const left = x >= bytesPerPixel ? result[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? result[prevStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? result[prevStart + x - bytesPerPixel] : 0;
      let value = rawByte;
      if (filter === 1) value = rawByte + left;
      if (filter === 2) value = rawByte + up;
      if (filter === 3) value = rawByte + Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        value = rawByte + predictor;
      }
      result[rowStart + x] = value & 255;
    }
  }
  return result;
}

function parsePng(buffer: Buffer, name: string): PdfImage | null {
  if (buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats: Buffer[] = [];
  while (offset < buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
    }
    if (type === "IDAT") idats.push(data);
    if (type === "IEND") break;
    offset += length + 12;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || !width || !height || idats.length === 0) return null;
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const pixels = unfilterPng(inflateSync(Buffer.concat(idats)), width, height, bytesPerPixel);
  const rgb = Buffer.alloc(width * height * 3);
  const alpha = colorType === 6 ? Buffer.alloc(width * height) : null;
  for (let src = 0, px = 0; src < pixels.length; src += bytesPerPixel, px += 1) {
    rgb[px * 3] = pixels[src];
    rgb[px * 3 + 1] = pixels[src + 1];
    rgb[px * 3 + 2] = pixels[src + 2];
    if (alpha) alpha[px] = pixels[src + 3];
  }
  const colorData = deflateSync(rgb);
  const alphaData = alpha ? deflateSync(alpha) : null;
  return {
    name,
    width,
    height,
    object: `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${colorData.length}${alphaData ? " /SMask __SMASK__ 0 R" : ""} >>\nstream\n${colorData.toString("binary")}\nendstream`,
    smask: alphaData ? `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${alphaData.length} >>\nstream\n${alphaData.toString("binary")}\nendstream` : undefined,
  };
}

function parseImage(value: unknown, name: string): PdfImage | null {
  const data = dataUrlToBuffer(value);
  if (!data) return null;
  if (data.mime === "image/png") return parsePng(data.buffer, name);
  if (data.mime === "image/jpeg" || data.mime === "image/jpg") {
    const size = parseJpegSize(data.buffer);
    if (!size) return null;
    return {
      name,
      width: size.width,
      height: size.height,
      object: `<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.buffer.length} >>\nstream\n${data.buffer.toString("binary")}\nendstream`,
    };
  }
  return null;
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
    this.commands.push("q", `${this.color(color)} RG`, `${lineWidth} w`, `${x1} ${this.y(top1)} m ${x2} ${this.y(top2)} l S`, "Q");
  }

  image(name: string, x: number, top: number, width: number, height: number) {
    this.commands.push("q", `${width} 0 0 ${height} ${x} ${this.y(top + height)} cm`, `/${name} Do`, "Q");
  }

  text(value: unknown, x: number, top: number, options: {
    size?: number;
    font?: FontName;
    color?: string;
    align?: "left" | "right" | "center";
    maxWidth?: number;
    lineHeight?: number;
    maxLines?: number;
  } = {}) {
    const size = options.size || 10;
    const fontKey = options.font === "bold" ? "F2" : options.font === "italic" ? "F3" : "F1";
    const color = options.color || INK;
    const lineHeight = options.lineHeight || size + 4;
    const lines = options.maxWidth ? wrapText(value, size, options.maxWidth, options.maxLines || 4) : [esc(value)];
    lines.forEach((line, index) => {
      let tx = x;
      if (options.align === "right") tx = x - textWidth(line, size);
      if (options.align === "center") tx = x - textWidth(line, size) / 2;
      this.commands.push("BT", `/${fontKey} ${size} Tf`, `${this.color(color)} rg`, `${tx} ${this.y(top + index * lineHeight)} Td`, `(${line}) Tj`, "ET");
    });
    return lines.length * lineHeight;
  }

  pill(label: string, x: number, top: number, width: number, color: string) {
    this.rect(x, top, width, 20, color);
    this.text(label, x + width / 2, top + 13, { size: 8, font: "bold", color: "#ffffff", align: "center" });
  }

  meta(label: string, value: unknown, x: number, top: number, width: number) {
    this.text(label.toUpperCase(), x, top, { size: 6.5, font: "bold", color: MUTED, maxWidth: width });
    this.text(value || "-", x, top + 12, { size: 9, font: "bold", color: INK, maxWidth: width, maxLines: 2, lineHeight: 11 });
  }

  output() {
    return this.commands.join("\n");
  }
}

function fitImage(image: PdfImage, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}

function makePdf(invoice: any, settings: any) {
  const logo = parseImage(settings.logoUrl, "ImLogo");
  const signatory = parseImage(settings.signatoryUrl, "ImSign");
  const images = [logo, signatory].filter(Boolean) as PdfImage[];
  const canvas = new PdfCanvas();
  const academyName = displayAcademyName(settings);
  const isGstInvoice = invoice.invoiceMode === "included" || invoice.invoiceMode === "excluded";
  const isPaid = invoice.status === "paid";
  const student = invoice.student || {};
  const plan = invoice.plan || {};
  const invoiceTitle = invoice.type === "credits" ? "Credit Plan Invoice" : invoice.type === "monthly" ? "Monthly Fee Invoice" : "Custom Fee Invoice";
  const taxMode = invoice.invoiceMode === "included" ? "GST Included" : invoice.invoiceMode === "excluded" ? "GST Excluded" : "Non-GST";
  const statusColor = isPaid ? GREEN : invoice.status === "cancelled" || invoice.status === "overdue" ? RED : BRAND;

  canvas.rect(0, 0, PAGE.width, PAGE.height, "#ffffff");
  canvas.rect(0, 0, PAGE.width, 106, BRAND);
  canvas.rect(0, 106, PAGE.width, 6, ACCENT);

  if (logo) {
    canvas.rect(34, 25, 128, 50, "#ffffff");
    const fitted = fitImage(logo, 112, 34);
    canvas.image(logo.name, 42, 33 + (34 - fitted.height) / 2, fitted.width, fitted.height);
  } else {
    canvas.rect(34, 25, 128, 50, "#ffffff");
    canvas.text("ENVISION", 46, 52, { size: 18, font: "bold", color: BRAND });
    canvas.text("CHESS ACADEMY", 47, 68, { size: 7, font: "bold", color: BRAND });
  }

  canvas.text(isGstInvoice ? "TAX INVOICE" : "INVOICE", 558, 34, { size: 22, font: "bold", color: "#ffffff", align: "right" });
  canvas.text(invoiceTitle, 558, 53, { size: 8, font: "bold", color: ACCENT, align: "right" });
  canvas.text(`Invoice No: ${invoice.invoiceNumber || "-"}`, 558, 70, { size: 9, font: "bold", color: "#ffffff", align: "right" });
  canvas.pill(titleCase(invoice.status), 485, 82, 73, statusColor);

  canvas.rect(34, 134, 527, 106, "#ffffff", LINE);
  canvas.text(academyName, 50, 162, { size: 15, font: "bold", color: INK, maxWidth: 245, lineHeight: 16 });
  canvas.text(settings.registeredAddress || "Registered address not added", 50, 187, { size: 8, color: MUTED, maxWidth: 260, maxLines: 3, lineHeight: 10 });
  canvas.text([settings.email, settings.phone].filter(Boolean).join(" | ") || "Contact details not added", 50, 221, { size: 7.5, color: MUTED, maxWidth: 260, maxLines: 2 });
  canvas.line(320, 152, 320, 222, LINE);
  canvas.text("Bill To", 338, 160, { size: 8, font: "bold", color: BRAND });
  canvas.text(student.name || "Student", 338, 181, { size: 14, font: "bold", color: INK, maxWidth: 185, maxLines: 2, lineHeight: 15 });
  canvas.text(student.email || student.username || "Student details not added", 338, 211, { size: 8, color: MUTED, maxWidth: 185, maxLines: 2 });
  if (invoice.credits) canvas.text(`${invoice.credits} credits`, 338, 226, { size: 8, font: "bold", color: BRAND });

  canvas.rect(34, 258, 527, 64, PANEL, LINE);
  canvas.meta("Issue Date", date(invoice.issueDate), 52, 282, 76);
  canvas.meta("Due Date", date(invoice.dueDate), 142, 282, 76);
  canvas.meta("GSTIN", isGstInvoice ? settings.gstNumber || "Not added" : "Not applicable", 232, 282, 118);
  canvas.meta("Tax Mode", taxMode, 364, 282, 76);
  canvas.meta("Student Plan", plan.name || titleCase(invoice.type), 454, 282, 84);

  canvas.rect(34, 352, 527, 28, BRAND);
  canvas.text("Description", 50, 370, { size: 8, font: "bold", color: "#ffffff" });
  canvas.text("Qty", 393, 370, { size: 8, font: "bold", color: "#ffffff", align: "right" });
  canvas.text("Amount", 544, 370, { size: 8, font: "bold", color: "#ffffff", align: "right" });
  canvas.rect(34, 380, 527, 72, "#ffffff", LINE);
  canvas.text(invoice.title || plan.name || invoiceTitle, 50, 408, { size: 10, font: "bold", color: INK, maxWidth: 270, maxLines: 2, lineHeight: 12 });
  canvas.text(invoice.notes || "Academy fee generated through the Envision LMS billing system.", 50, 431, { size: 7.5, color: MUTED, maxWidth: 290, maxLines: 2, lineHeight: 9 });
  canvas.text(invoice.credits ? `${invoice.credits} credits` : "1", 393, 410, { size: 9, font: "bold", color: INK, align: "right" });
  canvas.text(money(invoice.amount), 544, 410, { size: 9, font: "bold", color: INK, align: "right" });

  canvas.rect(321, 480, 240, isGstInvoice ? 145 : 96, "#ffffff", LINE);
  let rowY = 504;
  const totalRow = (label: string, value: string, bold = false, color = INK) => {
    canvas.text(label, 339, rowY, { size: bold ? 9 : 8, font: bold ? "bold" : "regular", color });
    canvas.text(value, 543, rowY, { size: bold ? 9 : 8, font: bold ? "bold" : "regular", color, align: "right" });
    rowY += 18;
  };
  totalRow("Base amount", money(invoice.taxableAmount || invoice.amount));
  if (invoice.lateFee) totalRow("Late fee", money(invoice.lateFee));
  if (isGstInvoice) {
    totalRow(`CGST (${Number(invoice.gstPercentage || 0) / 2}%)`, money(invoice.cgstAmount || 0));
    totalRow(`SGST (${Number(invoice.gstPercentage || 0) / 2}%)`, money(invoice.sgstAmount || 0));
    totalRow("GST total", money(invoice.gstAmount || 0));
  }
  canvas.line(339, rowY - 7, 543, rowY - 7, LINE);
  totalRow("Grand total", money(invoice.totalAmount), true, BRAND);

  canvas.rect(34, 480, 252, 96, PANEL, LINE);
  canvas.text("Payment Status", 52, 506, { size: 8, font: "bold", color: MUTED });
  canvas.text(titleCase(invoice.status), 52, 532, { size: 20, font: "bold", color: statusColor });
  canvas.text(isPaid ? `Paid on ${date(invoice.paidAt)}` : `Payment due by ${date(invoice.dueDate)}`, 52, 552, { size: 8, color: MUTED });

  canvas.rect(34, 604, 252, 112, "#ffffff", LINE);
  canvas.text("Terms & Notes", 52, 630, { size: 8, font: "bold", color: BRAND });
  canvas.text(settings.invoiceFooter || "Thank you for choosing Envisions Chess Academy LLP. This is a computer-generated invoice issued from the academy LMS.", 52, 654, {
    size: 7.5,
    color: MUTED,
    maxWidth: 212,
    maxLines: 5,
    lineHeight: 10,
  });

  canvas.rect(321, 650, 240, 98, "#ffffff", LINE);
  canvas.text("For", 339, 674, { size: 7.5, color: MUTED });
  canvas.text(academyName, 339, 691, { size: 9, font: "bold", color: INK, maxWidth: 190, maxLines: 2 });
  if (signatory) {
    const fitted = fitImage(signatory, 120, 34);
    canvas.image(signatory.name, 339, 704, fitted.width, fitted.height);
  }
  canvas.line(339, 730, 526, 730, BRAND, 1.1);
  canvas.text(settings.authorizedSignatory || "Authorized Signatory", 339, 744, { size: 8, font: "bold", color: INK, maxWidth: 180 });

  canvas.rect(34, 780, 527, 28, BRAND);
  canvas.text("Generated by Envision LMS", 52, 798, { size: 8, font: "bold", color: "#ffffff" });
  canvas.text("This document is valid without a physical seal unless separately required.", 543, 798, { size: 7, color: "#ffffff", align: "right" });

  const content = canvas.output();
  const baseObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>",
  ];
  const imageObjects: string[] = [];
  const xObjectRefs: string[] = [];
  let nextObject = baseObjects.length + 1;
  for (const image of images) {
    let smaskRef = "";
    if (image.smask) {
      smaskRef = `${nextObject} 0 R`;
      imageObjects.push(image.smask);
      nextObject += 1;
    }
    xObjectRefs.push(`/${image.name} ${nextObject} 0 R`);
    imageObjects.push(image.object.replace("__SMASK__ 0 R", smaskRef || "0 0 R"));
    nextObject += 1;
  }
  const contentObjectNumber = nextObject;
  baseObjects[2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >>${xObjectRefs.length ? ` /XObject << ${xObjectRefs.join(" ")} >>` : ""} >> /Contents ${contentObjectNumber} 0 R >>`;
  const objects = [
    ...baseObjects,
    ...imageObjects,
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "binary"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "binary");
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

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(invoice.invoiceNumber)}.pdf"`,
    },
  });
}
