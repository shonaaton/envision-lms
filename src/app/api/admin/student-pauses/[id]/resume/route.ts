import { NextResponse } from "next/server";

import { dbConnect } from "@/lib/db";
import { resumeStudent } from "@/lib/studentPause";
import { pauseActorFromSession, requireStudentPauseAccess } from "@/lib/studentPauseAccess";
import { formatINR } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireStudentPauseAccess("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const body = await req.json().catch(() => ({}));
  if (!body.nextInvoiceDate) {
    return NextResponse.json({ error: "Choose the date of the first invoice after the restart." }, { status: 400 });
  }

  try {
    const result = await resumeStudent({
      pauseId: params.id,
      batchId: body.batch ? String(body.batch) : undefined,
      nextInvoiceDate: body.nextInvoiceDate,
      restartDate: body.restartDate,
      note: body.note ? String(body.note) : undefined,
      actor: pauseActorFromSession(session),
    });
    return NextResponse.json({
      ok: true,
      batch: result.pause.resumeBatchName || "",
      classroomsUpdated: result.classroomsUpdated,
      invoice: result.invoice
        ? {
            id: result.invoice._id.toString(),
            invoiceNumber: result.invoice.invoiceNumber,
            dueDate: result.invoice.dueDate,
            amount: formatINR(result.invoice.totalAmount || 0),
          }
        : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not reinstate this student." }, { status: 400 });
  }
}
