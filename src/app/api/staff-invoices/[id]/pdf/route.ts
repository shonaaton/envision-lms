import { NextResponse } from "next/server";

import { invoiceFileName } from "@/lib/staffInvoice";
import { resolveStaffInvoiceViewer } from "@/lib/staffInvoiceAccess";
import { loadInvoiceForPdf } from "@/lib/staffInvoiceData";
import { renderStaffInvoicePdf } from "@/lib/staffInvoicePdf";

export const dynamic = "force-dynamic";

/** A staff invoice as a PDF: to the person who raised it, or to whoever may read all of them. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const viewer = await resolveStaffInvoiceViewer();
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const invoice = await loadInvoiceForPdf(params.id, viewer);
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pdf = renderStaffInvoicePdf(invoice);
  const fileName = invoiceFileName(invoice.billFrom?.fullName || "", invoice.month);
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
