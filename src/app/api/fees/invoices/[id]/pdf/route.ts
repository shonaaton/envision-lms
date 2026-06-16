import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { getAcademySettings } from "@/lib/fees";
import { formatINR } from "@/lib/utils";
import { Invoice } from "@/models/Fee";

export const dynamic = "force-dynamic";

function esc(value: unknown) {
  return String(value ?? "").replace(/[()\\]/g, (match) => `\\${match}`).replace(/[^\x20-\x7E]/g, "");
}

function makePdf(lines: string[]) {
  const content = [
    "BT",
    "/F1 18 Tf",
    "50 790 Td",
    `(${esc(lines[0])}) Tj`,
    "/F1 10 Tf",
    ...lines.slice(1).flatMap((line) => ["0 -18 Td", `(${esc(line)}) Tj`]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
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
  const isGstInvoice = invoice.invoiceMode === "included" || invoice.invoiceMode === "excluded";

  const pdf = makePdf([
    isGstInvoice ? "GST Invoice" : "Invoice",
    settings.academyName,
    settings.registeredAddress,
    `Phone: ${settings.phone}`,
    `Email: ${settings.email || ""}`,
    isGstInvoice ? `GSTIN: ${settings.gstNumber}` : "",
    `Invoice No: ${invoice.invoiceNumber}`,
    `Issue Date: ${new Date(invoice.issueDate).toLocaleDateString("en-IN")}`,
    `Due Date: ${new Date(invoice.dueDate).toLocaleDateString("en-IN")}`,
    `Bill To: ${invoice.student?.name}`,
    `Student: ${invoice.student?.email || invoice.student?.username || ""}`,
    `Description: ${invoice.title}`,
    `Tax Mode: ${invoice.invoiceMode === "included" ? "GST Included" : invoice.invoiceMode === "excluded" ? "GST Excluded" : "Non-GST"}`,
    `Amount: ${formatINR(invoice.amount)}`,
    `Late Fee: ${formatINR(invoice.lateFee || 0)}`,
    isGstInvoice ? `CGST: ${formatINR(invoice.cgstAmount || 0)}` : "",
    isGstInvoice ? `SGST: ${formatINR(invoice.sgstAmount || 0)}` : "",
    isGstInvoice ? `GST Total: ${formatINR(invoice.gstAmount || 0)}` : "",
    `Total Amount: ${formatINR(invoice.totalAmount)}`,
    `Status: ${invoice.status}`,
    invoice.credits ? `Credits: ${invoice.credits}` : "",
    invoice.notes ? `Notes: ${invoice.notes}` : "",
    settings.invoiceFooter ? `Footer: ${settings.invoiceFooter}` : "",
    `Authorized Signatory: ${settings.authorizedSignatory}`,
    settings.signatoryUrl ? `Signature File: ${settings.signatoryUrl}` : "",
  ].filter(Boolean));

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
