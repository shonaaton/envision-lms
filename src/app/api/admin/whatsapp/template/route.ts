import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { normalizeWhatsAppNumber, sendWhatsAppTemplateMessage } from "@/lib/whatsappAutomation";
import { WhatsAppMessage } from "@/models/WhatsApp";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

const DEFAULT_RECIPIENTS = ["8017996184", "6290349998"];

function canManageWhatsApp(session: any) {
  return ["admin", "sub-admin"].includes(String(session?.user?.role || ""));
}

async function findUserByPhone(phoneNumber: string) {
  const variants = Array.from(new Set([
    phoneNumber,
    phoneNumber.replace(/^91/, ""),
    `+${phoneNumber}`,
    `+${phoneNumber.replace(/^91/, "")}`,
  ]));
  return User.findOne({ phone: { $in: variants } }).select("_id name phone email username role").lean();
}

export async function POST(req: Request) {
  const session = await auth();
  if (!canManageWhatsApp(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const templateName = String(body.templateName || "hello_world").trim();
  const language = String(body.language || "en_US").trim();
  const recipients: string[] = (Array.isArray(body.recipients) && body.recipients.length ? body.recipients : DEFAULT_RECIPIENTS)
    .map((value: unknown) => normalizeWhatsAppNumber(String(value || "")))
    .filter(Boolean);

  await dbConnect();
  const results = [];
  for (const phoneNumber of Array.from(new Set<string>(recipients))) {
    const matchedUser: any = await findUserByPhone(phoneNumber);
    const result = await sendWhatsAppTemplateMessage({
      to: phoneNumber,
      templateName,
      language,
      testMode: false,
      metadata: { kind: "manual_template_send", source: "whatsapp_admin", templateName },
    });
    await WhatsAppMessage.create({
      phoneNumber,
      contactName: matchedUser?.name || "",
      matchedUser: matchedUser?._id,
      direction: "outbound",
      messageType: "template",
      text: templateName,
      templateName,
      templateLanguage: language,
      status: result.delivered ? "sent" : result.skipped ? "queued" : "failed",
      metaMessageId: result.metaMessageId || undefined,
      error: result.errorMessage || result.error || "",
      rawPayload: result.payload,
      sentAt: new Date(),
    });
    results.push({
      phoneNumber,
      name: matchedUser?.name || "",
      ok: result.ok,
      skipped: result.skipped,
      status: result.status,
      error: result.errorMessage || result.error || "",
      metaError: result.payload?.error || null,
      debug: result.debug || {},
    });
  }

  return NextResponse.json({ ok: results.every((item) => item.ok), templateName, language, results });
}
