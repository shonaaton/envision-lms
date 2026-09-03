import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { normalizeWhatsAppNumber, normalizeWhatsAppRecipient } from "@/lib/whatsappAutomation";
import { getWhatsAppTemplateDefinition, renderWhatsAppTemplatePreview } from "@/lib/whatsappTemplateRegistry";
import { WhatsAppMessage } from "@/models/WhatsApp";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

const DEFAULT_RECIPIENTS = ["918017996184", "916290349998"];
const USER_RECIPIENT_ROLES = ["student", "instructor", "admin", "sub-admin"];

type RecipientGroup = "manual" | "coaches" | "students" | "users";

function canManageWhatsApp(session: any) {
  return ["admin", "sub-admin"].includes(String(session?.user?.role || ""));
}

function cleanEnv(value?: string) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function normalizeTemplateLanguage(value?: string) {
  const clean = cleanEnv(value || "en");
  if (!clean || clean === "en_US" || clean === "en_GB" || clean === "en_UK") return "en";
  return clean;
}

function uniquePhoneNumbers(values: unknown[]) {
  return Array.from(new Set(
    values
      .map((value) => normalizeWhatsAppRecipient(String(value || "")))
      .filter(Boolean)
  ));
}

function uniqueUserPhoneNumbers(users: any[]) {
  return Array.from(new Set(
    users
      .map((user) => normalizeWhatsAppRecipient(user?.phone, user?.countryCode))
      .filter(Boolean)
  ));
}

function normalizeRecipientGroup(value: unknown): RecipientGroup {
  const clean = String(value || "manual").trim().toLowerCase();
  if (["coach", "coaches", "all_coaches"].includes(clean)) return "coaches";
  if (["student", "students", "all_students"].includes(clean)) return "students";
  if (["user", "users", "all", "all_users"].includes(clean)) return "users";
  return "manual";
}

function errorText(value: any) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value.message || value.error_user_msg || value.error || JSON.stringify(value));
}

function firstMetaMessageId(...values: any[]) {
  for (const value of values) {
    const messageId = String(
      value?.metaMessageId ||
        value?.messages?.[0]?.id ||
        value?.body?.messages?.[0]?.id ||
        value?.data?.messages?.[0]?.id ||
        value?.debug?.rawResponse?.messages?.[0]?.id ||
        value?.debug?.rawResponse?.body?.messages?.[0]?.id ||
        value?.debug?.rawResponse?.data?.messages?.[0]?.id ||
        ""
    ).trim();
    if (messageId) return messageId;
  }
  return "";
}

function n8nResultAccepted(item: any) {
  const rawResponse = item?.debug?.rawResponse || {};
  const explicitOk = item?.ok === true;
  const hasMetaMessageId = Boolean(firstMetaMessageId(item, rawResponse));
  const status = String(item?.status || rawResponse?.messages?.[0]?.message_status || "").toLowerCase();
  const acceptedStatus = ["accepted", "sent", "queued", "delivered", "read"].includes(status);
  return explicitOk || hasMetaMessageId || acceptedStatus;
}

function displayStatusForN8nResult(item: any) {
  const rawResponse = item?.debug?.rawResponse || {};
  const rawStatus = String(item?.status || rawResponse?.messages?.[0]?.message_status || "").toLowerCase();
  if (["accepted", "sent", "queued", "delivered", "read", "failed"].includes(rawStatus)) return rawStatus;
  if (firstMetaMessageId(item, rawResponse)) return "accepted";
  return item?.ok ? "accepted" : "failed";
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

async function resolveRecipients(body: any, recipientGroup: RecipientGroup) {
  if (recipientGroup !== "manual") {
    const roles = recipientGroup === "coaches"
      ? ["instructor"]
      : recipientGroup === "students"
        ? ["student"]
        : USER_RECIPIENT_ROLES;
    const users = await User.find({
      role: { $in: roles },
      isActive: { $ne: false },
      phone: { $exists: true, $nin: ["", null] },
    }).select("phone countryCode").lean();
    return uniqueUserPhoneNumbers(users);
  }

  const rawRecipients = Array.isArray(body.recipients) && body.recipients.length ? body.recipients : body.to ? [body.to] : DEFAULT_RECIPIENTS;
  return uniquePhoneNumbers(rawRecipients);
}

async function sendViaN8n(input: { templateName: string; language: string; recipients: string[]; templateVariables: string[] }) {
  const webhookUrl = cleanEnv(process.env.WHATSAPP_N8N_SEND_TEMPLATE_WEBHOOK_URL || process.env.WHATSAPP_N8N_SEND_WEBHOOK_URL);
  if (!webhookUrl) {
    return {
      response: null,
      payload: { ok: false, error: "n8n WhatsApp send webhook is not configured." },
    };
  }
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
      metadata: { kind: "manual_template_send", source: "whatsapp_admin", templateName: input.templateName },
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
  const language = normalizeTemplateLanguage(body.language || body.language_code || definition?.language || "en");
  const templateVariables = extractTemplateVariables(body);
  const messagePreview = renderWhatsAppTemplatePreview(templateName, templateVariables);
  const recipientGroup = normalizeRecipientGroup(body.recipientGroup || body.recipientMode);

  await dbConnect();
  const recipients = await resolveRecipients(body, recipientGroup);
  if (!recipients.length) {
    return NextResponse.json({
      ok: false,
      error: "No WhatsApp recipients found for this selection.",
      templateName,
      language,
      recipientGroup,
      results: [],
    }, { status: 400 });
  }

  const n8nSend = await sendViaN8n({ templateName, language, recipients, templateVariables }).catch((error) => ({
    response: null,
    payload: { ok: false, error: error instanceof Error ? error.message : String(error || "n8n request failed") },
  }));
  const n8nResults = Array.isArray(n8nSend.payload?.results) ? n8nSend.payload.results : [];
  const results = [];
  for (const item of n8nResults) {
    const phoneNumber = normalizeWhatsAppNumber(String(item.phoneNumber || item.to || ""));
    const matchedUser: any = await findUserByPhone(phoneNumber);
    const accepted = n8nResultAccepted(item);
    const metaMessageId = firstMetaMessageId(item);
    await WhatsAppMessage.create({
      phoneNumber,
      contactName: matchedUser?.name || "",
      matchedUser: matchedUser?._id,
      direction: "outbound",
      messageType: "template",
      text: messagePreview,
      templateName,
      templateLanguage: language,
      status: accepted ? displayStatusForN8nResult(item) : "failed",
      metaMessageId: metaMessageId || undefined,
      error: accepted ? "" : errorText(item.error || item.metaError),
      rawPayload: { ...item, templateVariables, messagePreview },
      sentAt: new Date(),
    });
    results.push({
      phoneNumber,
      name: matchedUser?.name || "",
      ok: accepted,
      skipped: false,
      status: accepted ? displayStatusForN8nResult(item) : item.status,
      error: accepted ? "" : errorText(item.error || item.metaError),
      metaError: accepted ? null : item.metaError || null,
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
      return NextResponse.json({ ok: true, templateName, language, recipientGroup, recipientCount: recipients.length, sender: "n8n", results: queuedResults });
    }
    const errorMessage = errorText(n8nSend.payload?.error || n8nSend.payload?.message) || `n8n returned HTTP ${n8nSend.response?.status || "unknown"}`;
    return NextResponse.json({
      ok: false,
      error: errorMessage,
      templateName,
      language,
      recipientGroup,
      recipientCount: recipients.length,
      sender: "n8n",
      results: [{
        phoneNumber: recipients.join(", "),
        ok: false,
        error: errorMessage,
        debug: { sender: "n8n", webhookUrlConfigured: Boolean(n8nSend.response), status: n8nSend.response?.status || null, payload: n8nSend.payload },
      }],
    }, { status: n8nSend.response?.ok ? 200 : 502 });
  }

  return NextResponse.json({ ok: results.every((item) => item.ok), templateName, language, recipientGroup, recipientCount: recipients.length, sender: "n8n", results });
}
