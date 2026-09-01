import { sendWhatsAppTemplateMessage, type WhatsAppSendResult } from "@/lib/whatsappAutomation";

export const WHATSAPP_AUTOMATION_LANGUAGE = "en";

export type WhatsAppAutomationRecipient = {
  _id?: unknown;
  id?: unknown;
  name?: string;
  username?: string;
  phone?: string;
  role?: string;
};

function recipientId(user: WhatsAppAutomationRecipient) {
  return String((user as any)?._id || user.id || "");
}

export function whatsappRecipientName(user: WhatsAppAutomationRecipient, fallback = "there") {
  return String(user.name || user.username || fallback).trim() || fallback;
}

export function canSendWhatsAppTo(user?: WhatsAppAutomationRecipient | null) {
  return Boolean(String(user?.phone || "").replace(/[^\d]/g, ""));
}

export async function sendWhatsAppAutomationTemplate(input: {
  to?: string;
  user?: WhatsAppAutomationRecipient | null;
  templateName: string;
  bodyParameters?: unknown[];
  metadata?: Record<string, unknown>;
}): Promise<WhatsAppSendResult> {
  const to = String(input.to || input.user?.phone || "").trim();
  if (!to) {
    return {
      ok: false,
      delivered: false,
      skipped: true,
      recipient: "",
      debug: { reason: "missing_whatsapp_phone", templateName: input.templateName },
    };
  }

  return sendWhatsAppTemplateMessage({
    to,
    templateName: input.templateName,
    language: WHATSAPP_AUTOMATION_LANGUAGE,
    bodyParameters: (input.bodyParameters || []).map((value) => String(value || "").trim()).filter(Boolean),
    metadata: {
      ...(input.metadata || {}),
      userId: input.user ? recipientId(input.user) : input.metadata?.userId,
      channel: "whatsapp",
      templateName: input.templateName,
    },
  });
}

export async function sendWhatsAppAutomationTemplates(inputs: Array<Parameters<typeof sendWhatsAppAutomationTemplate>[0]>) {
  return Promise.all(inputs.map((input) => sendWhatsAppAutomationTemplate(input).catch((error) => ({
    ok: false,
    delivered: false,
    skipped: false,
    error: error instanceof Error ? error.message : String(error || "whatsapp_automation_failed"),
  }))));
}
