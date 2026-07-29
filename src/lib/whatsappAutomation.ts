type WhatsAppReminderInput = {
  to?: string;
  message: string;
  templateText?: string;
  metadata?: Record<string, unknown>;
};

function normalizeWhatsAppNumber(value?: string) {
  return String(value || "").replace(/[^\d]/g, "");
}

function configuredGraphVersion() {
  return process.env.WHATSAPP_GRAPH_VERSION || "v25.0";
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

export async function sendWhatsAppReminder(input: WhatsAppReminderInput) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const testMode = process.env.WHATSAPP_TEST_MODE !== "false";
  const testRecipient = normalizeWhatsAppNumber(process.env.WHATSAPP_TEST_RECIPIENT);
  const recipient = testMode ? testRecipient : normalizeWhatsAppNumber(input.to);

  if (!accessToken || !phoneNumberId || !recipient) {
    return { ok: false, delivered: false, skipped: true, testMode, recipient };
  }

  const mode = String(process.env.WHATSAPP_MESSAGE_MODE || "template").toLowerCase();
  const message = String(input.message || "").trim().slice(0, 4000);
  const templateText = String(input.templateText || message || "Student").trim().slice(0, 1024);
  const bodyParameters = templateBodyParameters(input, message, templateText);
  const body =
    mode === "text"
      ? {
          messaging_product: "whatsapp",
          to: recipient,
          type: "text",
          text: { preview_url: true, body: message },
        }
      : {
          messaging_product: "whatsapp",
          to: recipient,
          type: "template",
          template: {
            name: process.env.WHATSAPP_TEMPLATE_NAME || "jaspers_market_plain_text_v1",
            language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US" },
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

  try {
    const response = await fetch(`https://graph.facebook.com/${configuredGraphVersion()}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    const delivered = response.ok && Boolean(payload?.messages?.[0]?.id);
    const errorMessage = delivered ? "" : String(payload?.error?.message || payload?.error?.error_user_msg || "");
    if (!delivered) {
      console.error("WhatsApp reminder failed", { status: response.status, payload, metadata: input.metadata });
    }
    return { ok: delivered, delivered, skipped: false, status: response.status, payload, errorMessage, testMode, recipient };
  } catch (error) {
    console.error("WhatsApp reminder request failed", error);
    return { ok: false, delivered: false, skipped: false, error: "whatsapp_failed", testMode, recipient };
  }
}
