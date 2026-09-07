import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { saveStageMapping } from "@/lib/crm/catalogue";
import { getCrmHealth } from "@/lib/crm/health";
import { importLeadsFromCsv } from "@/lib/crm/import";
import { syncBookingStageToCrm } from "@/lib/crm/sync";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { Booking } from "@/models/Booking";
import { CrmLead } from "@/models/CrmLead";

export const dynamic = "force-dynamic";

/** Sync health: is the integration wired up, and what has it been doing. */
export async function GET(req: Request) {
  if (!(await requireAdminApiAccess(req, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getCrmHealth());
}

/** Manually re-push a booking, for leads that failed while the CRM was down. */
export async function POST(req: Request) {
  if (!(await requireAdminApiAccess(req, "manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  // Map observed CRM stage names onto the groups the sales counters read.
  if ((body as any)?.action === "stageMapping") {
    await dbConnect();
    const entries = Array.isArray((body as any)?.entries) ? (body as any).entries : [];
    const mapping = await saveStageMapping(entries);
    return NextResponse.json({ ok: true, mapping });
  }

  // Seed the mirror from a CRM export - the only way to get pre-existing leads in,
  // because Kraya offers no endpoint to read them.
  if ((body as any)?.action === "import") {
    await dbConnect();
    const csv = String((body as any)?.csv || "");
    if (!csv.trim()) return NextResponse.json({ error: "No CSV content was uploaded." }, { status: 400 });
    return NextResponse.json(await importLeadsFromCsv(csv));
  }

  const bookingId = String((body as any)?.bookingId || "").trim();
  if (!bookingId) return NextResponse.json({ error: "bookingId is required." }, { status: 400 });

  await dbConnect();
  const booking: any = await Booking.findById(bookingId).select("student bookingType").lean();
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  // A manual re-push is for a lead the CRM never actually received, so clear the
  // dedupe marker on that one lead - otherwise the sync correctly no-ops.
  if (booking.student) {
    await CrmLead.updateOne({ user: booking.student }, { $unset: { lastPushedStage: "" } }).catch(() => undefined);
  }

  const result = await syncBookingStageToCrm(bookingId);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
