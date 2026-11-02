import "server-only";

import { academyDayBounds } from "@/lib/academyTime";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { isMissedOutcome, missedMessage, summaryMessage } from "@/lib/retention/familyRules";
import { resolveStudentContact } from "@/lib/studentContact";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { templateUnavailable } from "@/lib/whatsappTemplateErrors";
import { FamilyCall } from "@/models/FamilyCall";

export const FAMILY_CALL_SUMMARY_TEMPLATE = "family_call_summary";
export const FAMILY_CALL_MISSED_TEMPLATE = "family_call_missed";

type MessageState = "sent" | "skipped" | "failed" | "template_pending";

/**
 * After a call: a thank-you with what was agreed when it connected, or "we
 * tried to reach you" when nobody picked up (at most once a day per family).
 * Sent to the family's one phone and inbox, addressed to the parent. Nothing
 * here throws - the call is already saved; the result is written on the call.
 */
export async function sendFamilyCallMessage(input: {
  call: any;
  primary: any;
  parentName: string;
  children: string;
  callerName: string;
  discussed: string[];
}) {
  const { call } = input;
  const kind = call.outcome === "connected" ? "summary" : isMissedOutcome(call.outcome) ? "missed" : null;
  if (!kind) return null;

  if (kind === "missed") {
    const { start } = academyDayBounds(new Date(call.at));
    const alreadyToday = await FamilyCall.exists({ _id: { $ne: call._id }, familyKey: call.familyKey, "message.kind": "missed", "message.at": { $gte: start } });
    if (alreadyToday) return record(call, { kind, whatsapp: "skipped", email: "skipped", error: "Already told the family about a missed call today." });
  }

  const contact = resolveStudentContact(input.primary);
  const content = kind === "summary"
    ? summaryMessage({ parentName: input.parentName, callerName: input.callerName, children: input.children, parentSummary: call.parentSummary || "", discussed: input.discussed })
    : missedMessage({ parentName: input.parentName, children: input.children });
  const metadata = { kind: `family_call_${kind}`, callId: String(call._id), recipientType: "parent" };

  const [whatsapp, email] = await Promise.all([
    sendWhatsAppAutomationTemplate({
      user: input.primary,
      templateName: kind === "summary" ? FAMILY_CALL_SUMMARY_TEMPLATE : FAMILY_CALL_MISSED_TEMPLATE,
      bodyParameters: content.whatsappParams,
      metadata: { ...metadata, notificationDedupKey: `family_call:${call._id}` },
    }).catch((error: unknown) => ({ ok: false, delivered: false, skipped: false, error: error instanceof Error ? error.message : String(error) }) as any),
    contact.email
      ? sendAutomationEmail({ to: contact.email, subject: content.subject, message: content.email, metadata: { ...metadata, recipientType: contact.emailSource } })
        .catch(() => ({ ok: false, delivered: false, skipped: false }))
      : Promise.resolve({ ok: false, delivered: false, skipped: true }),
  ]);

  const whatsappState: MessageState = whatsapp.delivered ? "sent" : whatsapp.skipped ? "skipped" : templateUnavailable(whatsapp) ? "template_pending" : "failed";
  const emailState: MessageState = (email as any).delivered ? "sent" : (email as any).skipped ? "skipped" : "failed";
  const error = whatsappState === "failed" ? String((whatsapp as any).errorMessage || (whatsapp as any).error || "WhatsApp send failed").slice(0, 300) : "";
  return record(call, { kind, whatsapp: whatsappState, email: emailState, error });
}

async function record(call: any, message: { kind: "summary" | "missed"; whatsapp: MessageState; email: MessageState; error?: string }) {
  const value = { ...message, at: new Date(), error: message.error || "" };
  await FamilyCall.updateOne({ _id: call._id }, { $set: { message: value } }).catch((error: unknown) => console.error("[retention] could not record the call message", error));
  return value;
}
