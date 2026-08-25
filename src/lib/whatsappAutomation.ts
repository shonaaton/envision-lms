import { notifyFailure } from "@/lib/failureNotifications";

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
  metadata?: Record<string, unknown>;
};

type WhatsAppTemplateInput = {
  to?: string;
  templateName: string;
  language?: string;
  bodyParameters?: string[];
  metadata?: Record<string, unknown>;
  testMode?: boolean;
};

type WhatsAppTextInput = {
  to?: string;
  text: string;
  previewUrl?: boolean;
  metadata?: Record<string, unknown>;
  testMode?: boolean;
};

export function normalizeWhatsAppNumber(value?: string) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  return digits;
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
  const bodyParameters = (input.bodyParameters || []).map((text) => String(text || "").slice(0, 1024)).filter(Boolean);
  const body = {
    messaging_product: "whatsapp",
    to: recipient,
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.language || "en_US" },
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
  return { ...result, testMode, recipient };
}

export async function sendWhatsAppTextMessage(input: WhatsAppTextInput) {
  const { testMode, recipient } = resolveRecipient(input.to, input.testMode);
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
    templateName: process.env.WHATSAPP_TEMPLATE_NAME || "jaspers_market_plain_text_v1",
    language: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US",
    bodyParameters: templateBodyParameters(input, message, templateText),
    metadata: input.metadata,
  });
}
