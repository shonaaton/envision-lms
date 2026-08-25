import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { normalizeWhatsAppNumber, sendWhatsAppTemplateMessage } from "@/lib/whatsappAutomation";
import { getWhatsAppTemplateDefinition, renderWhatsAppTemplatePreview } from "@/lib/whatsappTemplateRegistry";
import { WhatsAppMessage } from "@/models/WhatsApp";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

const DEFAULT_RECIPIENTS = ["8017996184", "6290349998"];

function canManageWhatsApp(session: any) {
  return ["admin", "sub-admin"].includes(String(session?.user?.role || ""));
}

function cleanEnv(value?: string) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
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

function extractTemplateVariables(body: any) {
  const direct = Array.isArray(body.templateVariables) ? body.templateVariables : Array.isArray(body.bodyParameters) ? body.bodyParameters : null;
  if (direct) return direct.map((value: unknown) => String(value || "").trim()).filter(Boolean);

  const bodyComponent = Array.isArray(body.components)
    ? body.components.find((component: any) => String(component?.type || "").toLowerCase() === "body")
    : null;
  if (!Array.isArray(bodyComponent?.parameters)) return [];

  return bodyComponent.parameters
    .map((parameter: any) => String(parameter?.text ?? parameter?.value ?? "").trim())
    .filter(Boolean);
}

async function sendViaN8n(input: { templateName: string; language: string; recipients: string[]; templateVariables: string[] }) {
  const webhookUrl = cleanEnv(process.env.WHATSAPP_N8N_SEND_TEMPLATE_WEBHOOK_URL || process.env.WHATSAPP_N8N_SEND_WEBHOOK_URL);
  if (!webhookUrl) return null;
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-lms-whatsapp-secret": cleanEnv(process.env.WHATSAPP_N8N_FORWARD_SECRET),
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      ...input,
      bodyParameters: input.templateVariables,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!canManageWhatsApp(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const templateName = String(body.templateName || body.template_name || "hello_world_2").trim();
  const definition = getWhatsAppTemplateDefinition(templateName);
  const language = String(body.language || body.language_code || definition?.language || "en_US").trim();
  const templateVariables = extractTemplateVariables(body);
  const messagePreview = renderWhatsAppTemplatePreview(templateName, templateVariables);
  const rawRecipients = Array.isArray(body.recipients) && body.recipients.length ? body.recipients : body.to ? [body.to] : DEFAULT_RECIPIENTS;
  const recipients: string[] = rawRecipients
    .map((value: unknown) => normalizeWhatsAppNumber(String(value || "")))
    .filter(Boolean);

  await dbConnect();
  const n8nSend = await sendViaN8n({ templateName, language, recipients: Array.from(new Set<string>(recipients)), templateVariables }).catch((error) => ({
    response: null,
    payload: { ok: false, error: error instanceof Error ? error.message : String(error || "n8n request failed") },
  }));
  if (n8nSend) {
    const n8nResults = Array.isArray(n8nSend.payload?.results) ? n8nSend.payload.results : [];
    const results = [];
    for (const item of n8nResults) {
      const phoneNumber = normalizeWhatsAppNumber(String(item.phoneNumber || item.to || ""));
      const matchedUser: any = await findUserByPhone(phoneNumber);
      await WhatsAppMessage.create({
        phoneNumber,
        contactName: matchedUser?.name || "",
        matchedUser: matchedUser?._id,
        direction: "outbound",
        messageType: "template",
        text: messagePreview,
        templateName,
        templateLanguage: language,
        status: item.ok ? "sent" : "failed",
        metaMessageId: item.metaMessageId || undefined,
        error: item.error || item.metaError?.message || "",
        rawPayload: { ...item, templateVariables, messagePreview },
        sentAt: new Date(),
      });
      results.push({
        phoneNumber,
        name: matchedUser?.name || "",
        ok: Boolean(item.ok),
        skipped: false,
        status: item.status,
        error: item.error || item.metaError?.message || "",
        metaError: item.metaError || null,
        debug: { ...(item.debug || {}), sender: "n8n" },
      });
    }
    if (!results.length) {
      if (n8nSend.response?.ok) {
        const queuedResults = [];
        for (const phoneNumber of Array.from(new Set<string>(recipients))) {
          const matchedUser: any = await findUserByPhone(phoneNumber);
          await WhatsAppMessage.create({
            phoneNumber,
            contactName: matchedUser?.name || "",
            matchedUser: matchedUser?._id,
            direction: "outbound",
            messageType: "template",
            text: messagePreview,
            templateName,
            templateLanguage: language,
            status: "queued",
            rawPayload: { sender: "n8n", response: n8nSend.payload, templateVariables, messagePreview },
            sentAt: new Date(),
          });
          queuedResults.push({
            phoneNumber,
            name: matchedUser?.name || "",
            ok: true,
            skipped: false,
            status: n8nSend.response.status,
            error: "",
            metaError: null,
            debug: { sender: "n8n", queued: true, webhookUrlConfigured: true, status: n8nSend.response.status, bodyParameterCount: templateVariables.length },
          });
        }
        return NextResponse.json({ ok: true, templateName, language, sender: "n8n", results: queuedResults });
      }
      return NextResponse.json({
        ok: false,
        templateName,
        language,
        sender: "n8n",
        results: [{
          phoneNumber: recipients.join(", "),
          ok: false,
          error: n8nSend.payload?.error || `n8n returned HTTP ${n8nSend.response?.status || "unknown"}`,
          debug: { sender: "n8n", webhookUrlConfigured: true, status: n8nSend.response?.status || null, payload: n8nSend.payload },
        }],
      }, { status: n8nSend.response?.ok ? 200 : 502 });
    }
    return NextResponse.json({ ok: results.every((item) => item.ok), templateName, language, sender: "n8n", results });
  }

  const results = [];
  for (const phoneNumber of Array.from(new Set<string>(recipients))) {
    const matchedUser: any = await findUserByPhone(phoneNumber);
    const result = await sendWhatsAppTemplateMessage({
      to: phoneNumber,
      templateName,
      language,
      templateVariables,
      testMode: false,
      bypassN8n: true,
      metadata: { kind: "manual_template_send", source: "whatsapp_admin", templateName },
    });
    await WhatsAppMessage.create({
      phoneNumber,
      contactName: matchedUser?.name || "",
      matchedUser: matchedUser?._id,
      direction: "outbound",
      messageType: "template",
      text: messagePreview,
      templateName,
      templateLanguage: language,
      status: result.delivered ? "sent" : result.skipped ? "queued" : "failed",
      metaMessageId: result.metaMessageId || undefined,
      error: result.errorMessage || result.error || "",
      rawPayload: { ...(result.payload || {}), templateVariables, messagePreview },
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
