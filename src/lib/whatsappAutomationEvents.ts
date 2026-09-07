import { normalizeWhatsAppRecipient, resolveWhatsAppCountryCode, sendWhatsAppTemplateMessage, type WhatsAppSendResult } from "@/lib/whatsappAutomation";
import { isWhatsAppAutomationTemplateEnabled } from "@/lib/whatsappAutomationSettings";
import { renderWhatsAppTemplatePreview } from "@/lib/whatsappTemplateRegistry";

export const WHATSAPP_AUTOMATION_LANGUAGE = "en";

export type WhatsAppAutomationRecipient = {
  _id?: unknown;
  id?: unknown;
  name?: string;
  username?: string;
  phone?: string;
  countryCode?: string;
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

function recipientTypePriority(input: Parameters<typeof sendWhatsAppAutomationTemplate>[0]) {
  const recipientType = String(input.metadata?.recipientType || input.metadata?.audience || "").toLowerCase();
  if (recipientType === "parent" || input.templateName.endsWith("_parent")) return 3;
  if (recipientType === "student" || input.templateName.endsWith("_student")) return 2;
  return 1;
}

/**
 * Resolves the dialling code the portal holds for this contact before the number is
 * normalised, so a recipient loaded without `countryCode` is not silently dialled as +91.
 */
async function resolveAutomationRecipient(input: Parameters<typeof sendWhatsAppAutomationTemplate>[0]) {
  const countryCode = await resolveWhatsAppCountryCode({
    countryCode: input.user?.countryCode,
    userId: recipientId(input.user || {}) || input.metadata?.userId,
  });
  return { countryCode, to: normalizeWhatsAppRecipient(input.to || input.user?.phone, countryCode) };
}

function automationDedupKey(input: Parameters<typeof sendWhatsAppAutomationTemplate>[0], to: string) {
  if (!to) return "";
  const metadata = input.metadata || {};
  const explicitKey = String(metadata.notificationDedupKey || metadata.dedupKey || "").trim();
  if (explicitKey) return `${to}::${explicitKey}`;
  const identityParts = [
    metadata.kind,
    metadata.event,
    metadata.userId || recipientId(input.user || {}),
    metadata.studentId,
    metadata.invoiceId,
    metadata.invoiceNumber,
    metadata.bookingId,
    metadata.classroomId,
    metadata.sessionId,
    metadata.homeworkId,
    metadata.achievementId,
    metadata.tournamentId,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  if (identityParts.length > 1) return `${to}::${identityParts.join(":")}`;
  const preview = renderWhatsAppTemplatePreview(input.templateName, input.bodyParameters || []);
  return `${to}::${preview}`;
}

async function dedupeWhatsAppAutomationInputs(inputs: Array<Parameters<typeof sendWhatsAppAutomationTemplate>[0]>) {
  const deduped = new Map<string, Parameters<typeof sendWhatsAppAutomationTemplate>[0]>();
  const withoutPhone: Array<Parameters<typeof sendWhatsAppAutomationTemplate>[0]> = [];
  for (const input of inputs) {
    const { to, countryCode } = await resolveAutomationRecipient(input);
    // Carry the resolved dialling code on the input so the send step does not look it up again.
    const resolved = input.user && countryCode && !input.user.countryCode
      ? { ...input, user: { ...input.user, countryCode } }
      : input;
    const key = automationDedupKey(resolved, to);
    if (!key) {
      withoutPhone.push(resolved);
      continue;
    }
    const existing = deduped.get(key);
    if (!existing || recipientTypePriority(resolved) > recipientTypePriority(existing)) {
      deduped.set(key, resolved);
    }
  }
  return [...Array.from(deduped.values()), ...withoutPhone];
}

export async function sendWhatsAppAutomationTemplate(input: {
  to?: string;
  user?: WhatsAppAutomationRecipient | null;
  templateName: string;
  bodyParameters?: unknown[];
  metadata?: Record<string, unknown>;
}): Promise<WhatsAppSendResult> {
  const enabled = await isWhatsAppAutomationTemplateEnabled(input.templateName).catch((error) => {
    console.error("WhatsApp automation setting lookup failed", { error, templateName: input.templateName });
    return true;
  });
  const { to, countryCode } = await resolveAutomationRecipient(input);
  if (!enabled) {
    return {
      ok: true,
      delivered: false,
      skipped: true,
      recipient: to,
      debug: { reason: "whatsapp_template_automation_disabled", templateName: input.templateName },
    };
  }

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
    countryCode,
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
  const dedupedInputs = await dedupeWhatsAppAutomationInputs(inputs);
  return Promise.all(dedupedInputs.map((input) => sendWhatsAppAutomationTemplate(input).catch((error) => ({
    ok: false,
    delivered: false,
    skipped: false,
    error: error instanceof Error ? error.message : String(error || "whatsapp_automation_failed"),
  }))));
}
