import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { crmClientConfig } from "@/lib/crm/client";
import { crmStageLabel, type DemoStage } from "@/lib/crm/stages";
import { syncBookingStageToCrm } from "@/lib/crm/sync";
import { Booking } from "@/models/Booking";
import { CrmLead } from "@/models/CrmLead";

export const dynamic = "force-dynamic";

const STAGES: DemoStage[] = ["DEMO_REQUESTED", "DEMO_BOOKED", "DEMO_NO_SHOW", "DEMO_COMPLETED", "CURRENT_STUDENT"];

async function requireAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return role === "admin" || role === "sub-admin" ? session : null;
}

/** Sync health: is the integration wired up, and what has it been doing. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();

  const config = crmClientConfig();
  const [leads, failing, total] = await Promise.all([
    CrmLead.find({})
      .populate("user", "name email phone accountStatus")
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean(),
    CrmLead.countDocuments({ lastPushError: { $exists: true, $ne: null } }),
    CrmLead.countDocuments({}),
  ]);

  return NextResponse.json({
    config: {
      outboundConfigured: config.configured,
      inboundConfigured: Boolean(String(process.env.KRAYA_WEBHOOK_SECRET || "").trim()),
      endpoint: config.configured ? `${config.baseUrl}${config.upsertPath}` : null,
      webhookPath: "/api/crm/kraya/webhook",
      stageLabels: Object.fromEntries(STAGES.map((stage) => [stage, crmStageLabel(stage)])),
    },
    counts: { total, failing },
    leads,
  });
}

/** Manually re-push a booking, for leads that failed while the CRM was down. */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
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
