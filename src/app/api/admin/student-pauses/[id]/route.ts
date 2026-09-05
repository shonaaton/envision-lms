import { NextResponse } from "next/server";

import { dbConnect } from "@/lib/db";
import { cancelPause, updatePause } from "@/lib/studentPause";
import { pauseActorFromSession, requireStudentPauseAccess } from "@/lib/studentPauseAccess";
import { StudentPause } from "@/models/StudentPause";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireStudentPauseAccess("view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const pause = await StudentPause.findById(params.id)
    .populate("student", "name email username countryCode phone")
    .populate("batch", "name")
    .populate("resumeBatch", "name")
    .lean();
  if (!pause) return NextResponse.json({ error: "Pause record not found" }, { status: 404 });
  return NextResponse.json(pause);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireStudentPauseAccess("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const body = await req.json().catch(() => ({}));
  try {
    const pause = await updatePause({
      pauseId: params.id,
      pausedUntil: body.pausedUntil,
      expectedRestartDate: body.expectedRestartDate,
      reason: body.reason,
      actor: pauseActorFromSession(session),
    });
    return NextResponse.json(pause);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not update this pause." }, { status: 400 });
  }
}

/** Cancel a pause that was recorded by mistake and put back what it voided. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await requireStudentPauseAccess("manage");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const url = new URL(req.url);
  const reason = url.searchParams.get("reason") || "";
  const restoreInvoices = url.searchParams.get("restoreInvoices") !== "false";
  try {
    const result = await cancelPause({
      pauseId: params.id,
      reason,
      restoreInvoices,
      actor: pauseActorFromSession(session),
    });
    return NextResponse.json({ ok: true, invoicesRestored: result.invoicesRestored });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not cancel this pause." }, { status: 400 });
  }
}
