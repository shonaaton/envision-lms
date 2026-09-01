import { notifyFailure } from "@/lib/failureNotifications";
import { dbConnect } from "@/lib/db";
import { renderWhatsAppTemplatePreview } from "@/lib/whatsappTemplateRegistry";
import { WhatsAppMessage } from "@/models/WhatsApp";
import { User } from "@/models/User";

export type WhatsAppSendResult = {
  ok: boolean;
  delivered: boolean;
  skipped: boolean;
  status?: number;
  payload?: any;
  debug?: Record<string, unknown>;
  error?: string;
  errorMessage?: string;
  testMode?: boolean;
  recipient?: string;
  metaMessageId?: string;
};

type WhatsAppReminderInput = {
  to?: string;
  message: string;
  templateText?: string;
  templateName?: string;
  language?: string;
  templateVariables?: string[];
  metadata?: Record<string, unknown>;
};

type WhatsAppTemplateInput = {
  to?: string;
  templateName: string;
  language?: string;
  bodyParameters?: string[];
  templateVariables?: string[];
  metadata?: Record<string, unknown>;
  testMode?: boolean;
  bypassN8n?: boolean;
};

type WhatsAppTextInput = {
  to?: string;
  text: string;
  previewUrl?: boolean;
  metadata?: Record<string, unknown>;
  testMode?: boolean;
  bypassN8n?: boolean;
};

export function normalizeWhatsAppNumber(value?: string) {
  return String(value || "").replace(/[^\d]/g, "");
}

function configuredGraphVersion() {
  const value = String(process.env.WHATSAPP_GRAPH_VERSION || "v25.0").trim().replace(/^["']|["']$/g, "");
  return value.startsWith("v") ? value : `v${value}`;
}

function resolveRecipient(inputTo?: string, testModeOverride?: boolean) {
  const testMode = testModeOverride ?? process.env.WHATSAPP_TEST_MODE !== "false";
  const testRecipient = normalizeWhatsAppNumber(process.env.WHATSAPP_TEST_RECIPIENT);
  const recipient = testMode && testRecipient ? testRecipient : normalizeWhatsAppNumber(inputTo);
  return { testMode, recipient };
}

function whatsappConfig() {
  return {
    accessToken: String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim().replace(/^["']|["']$/g, ""),
    phoneNumberId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim().replace(/^["']|["']$/g, ""),
  };
}

function cleanEnv(value?: string) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function normalizeTemplateLanguage(value?: string) {
  const clean = cleanEnv(value || "en");
  if (!clean || clean === "en_US" || clean === "en_GB" || clean === "en_UK") return "en";
  return clean;
}

function n8nWebhookUrl() {
  return cleanEnv(process.env.WHATSAPP_N8N_SEND_TEMPLATE_WEBHOOK_URL || process.env.WHATSAPP_N8N_SEND_WEBHOOK_URL);
}

function firstMetaMessageId(...values: any[]) {
  for (const value of values) {
    const messageId = String(
      value?.metaMessageId ||
        value?.messages?.[0]?.id ||
        value?.body?.messages?.[0]?.id ||
        value?.data?.messages?.[0]?.id ||
        value?.payload?.messages?.[0]?.id ||
        value?.payload?.results?.[0]?.metaMessageId ||
        value?.payload?.results?.[0]?.messages?.[0]?.id ||
        ""
    ).trim();
    if (messageId) return messageId;
  }
  return "";
}

function outboundStatus(result: WhatsAppSendResult) {
  const rawStatus = String((result.payload?.results?.[0]?.status || result.payload?.messages?.[0]?.message_status || "")).toLowerCase();
  if (["accepted", "sent", "queued", "delivered", "read", "failed"].includes(rawStatus)) return rawStatus;
  return result.ok ? "accepted" : "failed";
}

function contactNameFromMetadata(metadata?: Record<string, unknown>) {
  return String(
    metadata?.recipientName ||
      metadata?.studentName ||
      metadata?.coachName ||
      metadata?.adminName ||
      metadata?.name ||
      ""
  ).trim();
}

async function findMatchedUser(input: { userId?: unknown; phoneNumber: string }) {
  const userId = String(input.userId || "").trim();
  if (userId) {
    const user = await User.findById(userId).select("_id name phone email username role").lean();
    if (user) return user;
  }
  const variants = Array.from(new Set([
    input.phoneNumber,
    input.phoneNumber.replace(/^91/, ""),
    `+${input.phoneNumber}`,
    `+${input.phoneNumber.replace(/^91/, "")}`,
  ]));
  return User.findOne({ phone: { $in: variants } }).select("_id name phone email username role").lean();
}

async function recordOutboundTemplateMessage(input: WhatsAppTemplateInput, result: WhatsAppSendResult, bodyParameters: string[]) {
  const phoneNumber = normalizeWhatsAppNumber(result.recipient || input.to);
  if (!phoneNumber || result.skipped) return;
  try {
    await dbConnect();
    const matchedUser: any = await findMatchedUser({ userId: input.metadata?.userId, phoneNumber });
    await WhatsAppMessage.create({
      phoneNumber,
      contactName: matchedUser?.name || contactNameFromMetadata(input.metadata),
      matchedUser: matchedUser?._id,
      direction: "outbound",
      messageType: "template",
      text: renderWhatsAppTemplatePreview(input.templateName, bodyParameters),
      templateName: input.templateName,
      templateLanguage: normalizeTemplateLanguage(input.language),
      status: outboundStatus(result),
      metaMessageId: firstMetaMessageId(result) || undefined,
      error: result.ok ? "" : String(result.errorMessage || result.error || ""),
      rawPayload: {
        sender: result.debug?.sender || (input.bypassN8n ? "meta" : "whatsapp"),
        metadata: input.metadata || {},
        response: result.payload || null,
        templateVariables: bodyParameters,
        testMode: result.testMode,
      },
      sentAt: new Date(),
    });
  } catch (error) {
    console.error("WhatsApp outbound template log failed", { error, templateName: input.templateName, phoneNumber });
  }
}

async function sendViaN8n(input: {
  to?: string;
  type?: "template" | "text";
  templateName: string;
  language: string;
  bodyParameters?: string[];
  templateVariables?: string[];
  message?: string;
  metadata?: Record<string, unknown>;
  testMode?: boolean;
}): Promise<WhatsAppSendResult | null> {
  const webhookUrl = n8nWebhookUrl();
  if (!webhookUrl) return null;
  const { testMode, recipient } = resolveRecipient(input.to, input.testMode);
  if (!recipient) {
    return {
      ok: false,
      delivered: false,
      skipped: true,
      testMode,
      recipient,
      debug: { sender: "n8n", webhookUrlConfigured: true, reason: "missing_recipient" },
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-lms-whatsapp-secret": cleanEnv(process.env.WHATSAPP_N8N_FORWARD_SECRET),
      },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        type: input.type || "template",
        templateName: input.templateName,
        language: normalizeTemplateLanguage(input.language),
        recipients: [recipient],
        bodyParameters: input.bodyParameters || input.templateVariables || [],
        templateVariables: input.templateVariables || input.bodyParameters || [],
        message: input.message || "",
        metadata: input.metadata || {},
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const first = Array.isArray(payload?.results) ? payload.results[0] : null;
    const ok = Boolean(response.ok && (payload?.ok !== false) && (first ? first.ok !== false : true));
    return {
      ok,
      delivered: ok,
      skipped: false,
      status: response.status,
      payload,
      testMode,
      recipient,
      metaMessageId: first?.metaMessageId || "",
      errorMessage: first?.error || payload?.error || "",
      debug: {
        sender: "n8n",
        webhookUrlConfigured: true,
        type: input.type || "template",
        templateName: input.templateName,
        templateLanguage: normalizeTemplateLanguage(input.language),
        recipient,
        n8nStatus: response.status,
      },
    };
  } catch (error) {
    console.error("WhatsApp n8n request failed", { error, metadata: input.metadata });
    void notifyFailure({ title: "WhatsApp n8n request failed", error, metadata: { automation: "whatsapp_n8n", reminderMetadata: input.metadata, recipient } });
    return {
      ok: false,
      delivered: false,
      skipped: false,
      error: "whatsapp_n8n_failed",
      testMode,
      recipient,
      debug: { sender: "n8n", webhookUrlConfigured: true, error: error instanceof Error ? error.message : String(error || "") },
    };
  }
}

async function postWhatsAppMessage(body: Record<string, unknown>, metadata?: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const { accessToken, phoneNumberId } = whatsappConfig();
  const recipient = String(body.to || "");
  const graphVersion = configuredGraphVersion();
  const endpoint = `https://graph.facebook.com/${graphVersion}/${phoneNumberId || "[missing-phone-number-id]"}/messages`;
  const debug = {
    endpoint,
    graphVersion,
    phoneNumberIdPresent: Boolean(phoneNumberId),
    accessTokenPresent: Boolean(accessToken),
    recipient,
    messageType: body.type,
    templateName: typeof body.template === "object" && body.template ? (body.template as any).name : undefined,
    templateLanguage: typeof body.template === "object" && body.template ? (body.template as any).language?.code : undefined,
  };
  if (!accessToken || !phoneNumberId || !recipient) {
    return { ok: false, delivered: false, skipped: true, recipient, debug };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    const metaMessageId = String(payload?.messages?.[0]?.id || "");
    const delivered = response.ok && Boolean(metaMessageId);
    const errorMessage = delivered ? "" : String(payload?.error?.message || payload?.error?.error_user_msg || "");
    if (!delivered) {
      console.error("WhatsApp delivery failed", { status: response.status, payload, metadata, debug });
      void notifyFailure({
        title: "WhatsApp delivery failed",
        error: errorMessage || "WhatsApp API did not confirm delivery",
        metadata: { automation: "whatsapp", status: response.status, payload, reminderMetadata: metadata, debug },
      });
    }
    return { ok: delivered, delivered, skipped: false, status: response.status, payload, debug, errorMessage, recipient, metaMessageId };
  } catch (error) {
    console.error("WhatsApp request failed", { error, debug });
    void notifyFailure({ title: "WhatsApp request failed", error, metadata: { automation: "whatsapp", reminderMetadata: metadata, debug } });
    return { ok: false, delivered: false, skipped: false, error: "whatsapp_failed", recipient, debug };
  }
}

function resolveTemplateParam(raw: string, input: WhatsAppReminderInput, message: string, templateText: string) {
  const metadata = input.metadata || {};
  const replacements: Record<string, unknown> = {
    message,
    templateText,
    student: templateText,
    studentName: templateText,
    ...metadata,
  };

  return raw.replace(/\{([^}]+)\}/g, (_match, key) => {
    const value = replacements[String(key).trim()];
    return value === undefined || value === null ? "" : String(value);
  }).trim();
}

function templateBodyParameters(input: WhatsAppReminderInput, message: string, templateText: string) {
  const configuredParams = process.env.WHATSAPP_TEMPLATE_BODY_PARAMS;
  if (configuredParams !== undefined) {
    return configuredParams
      .split("|")
      .map((param) => resolveTemplateParam(param, input, message, templateText).slice(0, 1024))
      .filter(Boolean);
  }

  if (process.env.WHATSAPP_TEMPLATE_HAS_BODY_PARAM === "true") {
    return [templateText];
  }

  return [];
}

export async function sendWhatsAppTemplateMessage(input: WhatsAppTemplateInput) {
  const { testMode, recipient } = resolveRecipient(input.to, input.testMode);
  const bodyParameters = (input.bodyParameters || input.templateVariables || []).map((text) => String(text || "").slice(0, 1024)).filter(Boolean);
  if (!input.bypassN8n) {
    const n8nResult = await sendViaN8n({
      to: input.to,
      templateName: input.templateName,
      language: normalizeTemplateLanguage(input.language),
      bodyParameters,
      templateVariables: bodyParameters,
      metadata: input.metadata,
      testMode: input.testMode,
    });
    if (n8nResult) {
      await recordOutboundTemplateMessage(input, n8nResult, bodyParameters);
      return n8nResult;
    }
  }

  const body = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: normalizeTemplateLanguage(input.language) },
      ...(bodyParameters.length
        ? {
            components: [
              {
                type: "body",
                parameters: bodyParameters.map((text) => ({ type: "text", text })),
              },
            ],
          }
        : {}),
    },
  };
  const result = await postWhatsAppMessage(body, input.metadata);
  const output = { ...result, testMode, recipient };
  await recordOutboundTemplateMessage(input, output, bodyParameters);
  return output;
}

export async function sendWhatsAppTextMessage(input: WhatsAppTextInput) {
  const { testMode, recipient } = resolveRecipient(input.to, input.testMode);
  if (!input.bypassN8n) {
    const n8nResult = await sendViaN8n({
      to: input.to,
      type: "text",
      templateName: "",
      language: "",
      message: String(input.text || "").trim().slice(0, 4000),
      metadata: input.metadata,
      testMode: input.testMode,
    });
    if (n8nResult) return n8nResult;
  }

  const body = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "text",
    text: { preview_url: input.previewUrl ?? true, body: String(input.text || "").trim().slice(0, 4000) },
  };
  const result = await postWhatsAppMessage(body, input.metadata);
  return { ...result, testMode, recipient };
}

export async function sendWhatsAppReminder(input: WhatsAppReminderInput) {
  const mode = String(process.env.WHATSAPP_MESSAGE_MODE || "template").toLowerCase();
  const message = String(input.message || "").trim().slice(0, 4000);
  if (mode === "text") {
    return sendWhatsAppTextMessage({ to: input.to, text: message, metadata: input.metadata });
  }

  const templateText = String(input.templateText || message || "Student").trim().slice(0, 1024);
  return sendWhatsAppTemplateMessage({
    to: input.to,
    templateName: input.templateName || process.env.WHATSAPP_TEMPLATE_NAME || "jaspers_market_plain_text_v1",
    language: normalizeTemplateLanguage(input.language || process.env.WHATSAPP_TEMPLATE_LANGUAGE),
    bodyParameters: input.templateVariables || templateBodyParameters(input, message, templateText),
    templateVariables: input.templateVariables,
    metadata: input.metadata,
  });
}
