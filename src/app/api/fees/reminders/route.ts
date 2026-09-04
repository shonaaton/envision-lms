import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { getFeeReminderWorkspace, sendFeeReminders, type FeeReminderChannel } from "@/lib/feeReminders";
import { type FeeReminderType } from "@/lib/feeReminderRules";
import { requireFeesAccess, isFeesManager } from "@/lib/feesAccess";
import { canAccessFeature } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

const reminderTypes = new Set<FeeReminderType>([
  "credit_low",
  "credit_zero",
  "credit_blocked",
  "invoice_upcoming",
  "invoice_overdue",
  "all_credit",
  "all_invoice",
]);
const channelNames = new Set<FeeReminderChannel>(["email", "whatsapp"]);

export async function GET() {
  const session = await requireFeesAccess("view", "fees");
  const role = String((session?.user as any)?.role || "");
  if (!session?.user || !isFeesManager(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  return NextResponse.json(await getFeeReminderWorkspace());
}

export async function POST(req: Request) {
  const session = await requireFeesAccess("view", "fees");
  const role = String((session?.user as any)?.role || "");
  if (!session?.user || !isFeesManager(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const reminderType = String(body?.reminderType || "") as FeeReminderType;
  const channels = Array.from(new Set((Array.isArray(body?.channels) ? body.channels : []).map(String)))
    .filter((channel): channel is FeeReminderChannel => channelNames.has(channel as FeeReminderChannel));
  const rawRecipientIds: unknown[] = Array.isArray(body?.recipientIds) ? body.recipientIds : [];
  const recipientIds = Array.from(new Set(rawRecipientIds.map((recipientId) => String(recipientId)))).slice(0, 1000);
  if (!reminderTypes.has(reminderType)) return NextResponse.json({ error: "Choose a valid reminder type" }, { status: 400 });
  if (!channels.length) return NextResponse.json({ error: "Select Email, WhatsApp, or both" }, { status: 400 });
  if (!recipientIds.length) return NextResponse.json({ error: "Select at least one recipient" }, { status: 400 });

  const permission = reminderType.startsWith("credit_") || reminderType === "all_credit" ? "credit" : "invoice";
  if (!(await canAccessFeature("fees", session.user as any, permission))) {
    return NextResponse.json({ error: "You do not have permission to send these fee reminders" }, { status: 403 });
  }

  await dbConnect();
  const result = await sendFeeReminders({
    actorId: String((session.user as any).id || ""),
    reminderType,
    channels,
    recipientIds,
  });
  return NextResponse.json({ ok: true, ...result });
}
