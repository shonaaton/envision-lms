import { sendAutomationEmail } from "@/lib/emailAutomation";
import { resolveAudienceEmails } from "@/lib/studentContact";
import { sendWhatsAppAutomationTemplate, whatsappRecipientName } from "@/lib/whatsappAutomationEvents";

/**
 * One send to one family, across both channels.
 *
 * Almost every student-facing notification does the same three things: write
 * one message, put it through `resolveAudienceEmails()` so a shared inbox gets
 * a single copy, and fire the matching WhatsApp template. This is that shape,
 * so a new notification is a message and a template name rather than another
 * twenty lines of plumbing.
 *
 * Delivery failures are swallowed by design — a notification must never break
 * the action that triggered it. The channels report back so callers can count
 * what landed.
 */
export async function messageFamily(input: {
  student: any;
  subject: string;
  message: string;
  /** Alternative wording when the copy is addressed to a parent. */
  parentMessage?: string;
  /** Omit to send email only — useful where the copy is too long for a template. */
  templateName?: string;
  bodyParameters?: unknown[];
  metadata: Record<string, unknown>;
}) {
  const { student } = input;
  const parentMessage = input.parentMessage || input.message;

  const emails = resolveAudienceEmails(
    student?.email ? { to: String(student.email), subject: input.subject, message: input.message, metadata: input.metadata } : null,
    student?.parentEmail
      ? {
          to: String(student.parentEmail),
          subject: input.subject,
          message: parentMessage,
          metadata: { ...input.metadata, recipientType: "parent" },
        }
      : null,
  );

  const emailResults = await Promise.all(
    emails.map((send) => sendAutomationEmail(send).catch(() => ({ delivered: false, skipped: false }))),
  );

  const whatsapp = input.templateName
    ? await sendWhatsAppAutomationTemplate({
        user: student,
        templateName: input.templateName,
        bodyParameters: input.bodyParameters || [],
        metadata: input.metadata,
      }).catch(() => ({ delivered: false, skipped: false }))
    : null;

  return {
    emailsSent: emailResults.filter((result: any) => result?.delivered).length,
    whatsappDelivered: Boolean((whatsapp as any)?.delivered),
  };
}

export { whatsappRecipientName };
