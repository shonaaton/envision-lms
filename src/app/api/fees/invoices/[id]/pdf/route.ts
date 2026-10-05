import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { getAcademySettings } from "@/lib/fees";
import { ACADEMY_DEFAULTS, ACADEMY_LOGO_URL, ACADEMY_SIGNATURE_URL } from "@/lib/branding";
import { Invoice } from "@/models/Fee";
import { canAccessFeature } from "@/lib/featureAccess";
import { isFeesManager } from "@/lib/feesAccess";
import { invoiceReferences } from "@/lib/feesMetrics";
import {
  ACCENT,
  BRAND,
  GREEN,
  INK,
  LINE,
  MUTED,
  PAGE,
  PANEL,
  PdfCanvas,
  RED,
  buildPdf,
  date,
  fitImage,
  money,
  parseImage,
  resolveImageSource,
  safeFilename,
  titleCase,
  type PdfImage,
} from "@/lib/pdf/simplePdf";

export const dynamic = "force-dynamic";

function hashInvoiceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function displayAcademyName(settings: any) {
  const name = String(settings?.academyName || "").trim();
  if (!name || name === "Envision Chess Academy") return "Envisions Chess Academy LLP";
  return name;
}


async function makeInvoicePdf(invoice: any, settings: any) {
  const logoSource = await resolveImageSource(ACADEMY_LOGO_URL, ACADEMY_LOGO_URL);
  const signatorySource = await resolveImageSource(ACADEMY_SIGNATURE_URL, ACADEMY_SIGNATURE_URL);
  const logo = parseImage(logoSource, "ImLogo");
  const signatory = parseImage(signatorySource, "ImSign");
  const images = [logo, signatory].filter(Boolean) as PdfImage[];
  const canvas = new PdfCanvas();
  const academyName = settings.academyName || ACADEMY_DEFAULTS.academyName;
  const legalName = displayAcademyName({ academyName: ACADEMY_DEFAULTS.legalName });
  const registeredAddress = settings.registeredAddress || ACADEMY_DEFAULTS.registeredAddress;
  const gstNumber = settings.gstNumber || ACADEMY_DEFAULTS.gstNumber;
  const sellerLines = [
    `Unit of ${legalName}`,
    ...String(registeredAddress).split(/\r?\n/).filter(Boolean),
    ACADEMY_DEFAULTS.affiliationLine,
    ACADEMY_DEFAULTS.recognitionLine,
    `GSTN: ${gstNumber}`,
    settings.phone || ACADEMY_DEFAULTS.phone,
    settings.email || ACADEMY_DEFAULTS.email,
    ACADEMY_DEFAULTS.website,
  ];
  const isGstInvoice = invoice.invoiceMode === "included" || invoice.invoiceMode === "excluded";
  const isPaid = invoice.status === "paid";
  const student = invoice.student || {};
  const plan = invoice.plan || {};
  const invoiceTitle = invoice.type === "credits" ? "Credit Plan Invoice" : invoice.type === "monthly" ? "Monthly Fee Invoice" : "Custom Fee Invoice";
  const taxMode = invoice.invoiceMode === "included" ? "GST Included" : invoice.invoiceMode === "excluded" ? "GST Excluded" : "Non-GST";
  const statusColor = isPaid ? GREEN : invoice.status === "cancelled" || invoice.status === "overdue" ? RED : BRAND;
  const qty = invoice.credits ? `${invoice.credits}` : "1";
  const unitLabel = invoice.credits ? "credits" : "fee";
  const gstRate = Number(invoice.gstPercentage || 0);
  const baseAmount = Number(invoice.taxableAmount || invoice.amount || 0);
  const amountWords = `Amount in words: ${money(invoice.totalAmount)} only`;

  canvas.rect(0, 0, PAGE.width, PAGE.height, "#ffffff");
  canvas.rect(0, 0, PAGE.width, 112, BRAND);
  canvas.rect(0, 112, PAGE.width, 6, ACCENT);

  if (logo) {
    const fitted = fitImage(logo, 200, 58);
    canvas.image(logo.name, 34, 28 + (58 - fitted.height) / 2, fitted.width, fitted.height);
  } else {
    canvas.text("ENVISION CHESS ACADEMY", 34, 58, { size: 16, font: "bold", color: ACCENT });
  }

  canvas.text(isGstInvoice ? "TAX INVOICE" : "INVOICE", 558, 34, { size: 22, font: "bold", color: "#ffffff", align: "right" });
  canvas.text(invoiceTitle, 558, 53, { size: 8, font: "bold", color: ACCENT, align: "right" });
  canvas.text(`Invoice No: ${invoice.invoiceNumber || "-"}`, 558, 70, { size: 9, font: "bold", color: "#ffffff", align: "right" });
  canvas.pill(titleCase(invoice.status), 485, 82, 73, statusColor);

  canvas.rect(34, 138, 527, 150, "#ffffff", LINE);
  canvas.text("Seller Details", 50, 160, { size: 8, font: "bold", color: BRAND });
  canvas.text(academyName, 50, 179, { size: 13, font: "bold", color: INK, maxWidth: 230, lineHeight: 15 });
  sellerLines.forEach((line, index) => {
    const strong = line.startsWith("GSTN:") || line === settings.phone || line === settings.email || line === ACADEMY_DEFAULTS.website;
    canvas.text(line, 50, 199 + index * 10, { size: 7.2, font: strong ? "bold" : "regular", color: "#344054", maxWidth: 240, maxLines: 1 });
  });

  canvas.line(310, 154, 310, 272, LINE);
  canvas.text("Bill To", 326, 160, { size: 8, font: "bold", color: BRAND });
  canvas.text(student.name || "Student", 326, 181, { size: 13, font: "bold", color: INK, maxWidth: 108, maxLines: 2, lineHeight: 15 });
  canvas.text(student.email || student.username || "Student details not added", 326, 213, { size: 7.5, color: "#344054", maxWidth: 108, maxLines: 2 });

  canvas.line(447, 154, 447, 272, LINE);
  canvas.meta("Invoice Date", date(invoice.issueDate), 464, 162, 80);
  canvas.meta("Due Date", date(invoice.dueDate), 464, 194, 80);
  canvas.meta("GSTIN", isGstInvoice ? gstNumber : "Not applicable", 464, 226, 80);
  canvas.meta("Reference No", invoiceReferences(invoice).join(", ") || "-", 464, 258, 80);

  canvas.rect(34, 310, 527, 52, PANEL, LINE);
  canvas.meta("Tax Mode", taxMode, 52, 333, 95);
  canvas.meta("Student Plan", plan.name || titleCase(invoice.type), 165, 333, 130);
  canvas.meta("Place of Supply", "West Bengal", 315, 333, 105);
  canvas.meta("Payment Status", titleCase(invoice.status), 444, 333, 90);

  canvas.rect(34, 392, 527, 28, BRAND);
  canvas.text("#", 50, 410, { size: 8, font: "bold", color: "#ffffff" });
  canvas.text("Item Name", 78, 410, { size: 8, font: "bold", color: "#ffffff" });
  canvas.text("Qty", 325, 410, { size: 8, font: "bold", color: "#ffffff", align: "right" });
  canvas.text("Unit", 368, 410, { size: 8, font: "bold", color: "#ffffff", align: "right" });
  canvas.text("Price", 427, 410, { size: 8, font: "bold", color: "#ffffff", align: "right" });
  canvas.text("GST", 483, 410, { size: 8, font: "bold", color: "#ffffff", align: "right" });
  canvas.text("Amount", 544, 410, { size: 8, font: "bold", color: "#ffffff", align: "right" });
  canvas.rect(34, 420, 527, 70, "#ffffff", LINE);
  canvas.text("1", 50, 446, { size: 9, color: INK });
  canvas.text(invoice.title || plan.name || invoiceTitle, 78, 446, { size: 10, font: "bold", color: INK, maxWidth: 210, maxLines: 2, lineHeight: 12 });
  canvas.text(invoice.notes || "Academy fee generated through the Envision LMS billing system.", 78, 468, { size: 7.5, color: "#475467", maxWidth: 220, maxLines: 2, lineHeight: 9 });
  canvas.text(qty, 325, 446, { size: 9, font: "bold", color: INK, align: "right" });
  canvas.text(unitLabel, 368, 446, { size: 8, color: "#475467", align: "right" });
  canvas.text(money(baseAmount), 427, 446, { size: 8.5, color: INK, align: "right" });
  canvas.text(isGstInvoice ? `${gstRate}%` : "-", 483, 446, { size: 8.5, color: INK, align: "right" });
  canvas.text(money(invoice.totalAmount), 544, 446, { size: 9, font: "bold", color: INK, align: "right" });

  canvas.rect(34, 510, 252, 72, PANEL, LINE);
  canvas.text("Amount in words", 52, 535, { size: 8, font: "bold", color: BRAND });
  canvas.text(amountWords, 52, 558, { size: 8, color: "#475467", maxWidth: 210, maxLines: 3, lineHeight: 10 });

  canvas.rect(321, 510, 240, isGstInvoice ? 126 : 84, "#ffffff", LINE);
  let rowY = 533;
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

  canvas.rect(34, 620, 252, 88, "#ffffff", LINE);
  canvas.text("Terms & Notes", 52, 644, { size: 8, font: "bold", color: BRAND });
  canvas.text(settings.invoiceFooter || "Thank you for choosing Envisions Chess Academy LLP. This is a computer-generated invoice issued from the academy LMS.", 52, 668, {
    size: 7.5,
    color: "#475467",
    maxWidth: 212,
    maxLines: 4,
    lineHeight: 10,
  });

  canvas.rect(321, 642, 240, 104, "#ffffff", LINE);
  canvas.text("For", 339, 666, { size: 7.5, color: MUTED });
  canvas.text(legalName, 339, 683, { size: 9, font: "bold", color: INK, maxWidth: 190, maxLines: 2 });
  if (signatory) {
    const fitted = fitImage(signatory, 128, 40);
    canvas.image(signatory.name, 339, 694, fitted.width, fitted.height);
  } else {
    canvas.text(ACADEMY_DEFAULTS.authorizedSignatory, 342, 712, { size: 16, font: "italic", color: BRAND, maxWidth: 150 });
  }
  canvas.line(339, 725, 526, 725, BRAND, 1.1);
  canvas.text(ACADEMY_DEFAULTS.authorizedSignatory, 339, 739, { size: 8, font: "bold", color: INK, maxWidth: 180 });

  canvas.rect(34, 780, 527, 28, BRAND);
  canvas.text("Generated by Envision LMS", 52, 798, { size: 8, font: "bold", color: "#ffffff" });
  canvas.text("This document is valid without a physical seal unless separately required.", 543, 798, { size: 7, color: "#ffffff", align: "right" });

  return buildPdf([canvas.output()], images);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  await dbConnect();

  const invoice: any = await Invoice.findById(params.id).populate("student plan").lean();
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const token = new URL(req.url).searchParams.get("token") || "";
  const tokenAllowed =
    token &&
    invoice.publicDownloadTokenHash &&
    invoice.publicDownloadTokenHash === hashInvoiceToken(token) &&
    invoice.publicDownloadTokenExpiresAt &&
    new Date(invoice.publicDownloadTokenExpiresAt).getTime() >= Date.now();
  if (!tokenAllowed) {
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any).role;
    const hasManagementAccess = isFeesManager(role) && await canAccessFeature("fees", session.user as any, "view");
    if (!hasManagementAccess && invoice.student?._id?.toString() !== (session.user as any).id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  const settings: any = await getAcademySettings();
  const pdf = await makeInvoicePdf(invoice, settings);

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(invoice.invoiceNumber)}.pdf"`,
    },
  });
}
