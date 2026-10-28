import { WhatsAppMessage } from "@/models/WhatsApp";
import { findWhatsAppUserByPhone } from "./whatsappAutomation";
import { renderTemplateBody, type LibraryTemplate } from "./whatsappTemplateRules";
import { sendGraphMessage, WhatsAppMetaError } from "./whatsappMeta";

export async function sendLibraryTemplate(input: { template: LibraryTemplate; phoneNumber: string; values: string[]; actorId: string; campaignRecipient?: unknown }) {
  const { template, phoneNumber, values } = input;
  if (!template.sendable) throw new WhatsAppMetaError("This template is not approved for sending.", 409);
  if (!/^\d{7,15}$/.test(phoneNumber)) throw new WhatsAppMetaError("A valid international phone number is required.", 400);
  if (values.length !== template.variables.length || values.some((value) => !value.trim() || value.length > 1024)) throw new WhatsAppMetaError("Fill every template variable before sending.", 400);
  if (values.some((value) => /[\r\n\t]| {5,}/.test(value))) throw new WhatsAppMetaError("Template fields must use one line, without tabs or more than four consecutive spaces.", 400);
  const contact: any = await findWhatsAppUserByPhone(phoneNumber);
  let outcome: { ok: boolean; status: string; metaMessageId?: string; payload?: unknown; error?: string; uncertain?: boolean };
  try {
    const result = await sendGraphMessage({ to: phoneNumber, type: "template", template: { name: template.name, language: { code: template.language }, ...(values.length ? { components: [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }] } : {}) } });
    outcome = { ok: true, ...result };
  } catch (error) {
    if (!(error instanceof WhatsAppMetaError)) throw error;
    outcome = { ok: false, status: error.uncertain ? "queued" : "failed", error: error.message, uncertain: error.uncertain };
  }
  const text = [template.header, renderTemplateBody(template.body, values), template.footer].filter(Boolean).join("\n");
  const message = await WhatsAppMessage.create({ phoneNumber, contactName: contact?.name || "", matchedUser: contact?._id, direction: "outbound", messageType: "template", templateName: template.name, templateLanguage: template.language, text, status: outcome.status, metaMessageId: outcome.metaMessageId || undefined, error: outcome.error || "", uncertain: Boolean(outcome.uncertain), rawPayload: { response: outcome.payload, templateVariables: values, templateId: template.id }, sentBy: input.actorId, campaignRecipient: input.campaignRecipient, sentAt: new Date() });
  return { ok: outcome.ok, phoneNumber, status: outcome.status, error: outcome.error || "", uncertain: Boolean(outcome.uncertain), retryable: !outcome.uncertain, messageId: String(message._id), metaMessageId: outcome.metaMessageId || "" };
}
