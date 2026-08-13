import { notifyFailure } from "@/lib/failureNotifications";

type AutomationEmailInput = {
  to?: string;
  subject: string;
  message: string;
  htmlBody?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
};

async function sendEmailToWebhook(input: AutomationEmailInput, webhook?: string) {
  if (!webhook || !input.to) return { ok: false, delivered: false, skipped: true };
  const htmlBody = input.htmlBody || input.message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("");

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        to: input.to,
        subject: input.subject,
        message: input.message,
        htmlBody,
        replyTo: input.replyTo || process.env.EMAIL_REPLY_TO || "support@envisionchessacademy.com",
        metadata: input.metadata || {},
      }),
    });
    const payload = await response.json().catch(() => null);
    const delivered = response.ok && payload?.delivered !== false && payload?.ok !== false;
    if (!delivered) {
      console.error("Email automation rejected delivery", { status: response.status, payload });
      if (input.metadata?.kind !== "failure_notification") {
        void notifyFailure({ title: "Email automation rejected delivery", error: `Webhook responded with status ${response.status}`, metadata: { automation: "email_delivery", payload, originalEmail: { to: input.to, subject: input.subject, metadata: input.metadata } } });
      }
    }
    return { ok: delivered, delivered, status: response.status, skipped: false, payload };
  } catch (error) {
    console.error("Email automation failed", error);
    if (input.metadata?.kind !== "failure_notification") {
      void notifyFailure({ title: "Email automation request failed", error, metadata: { automation: "email_delivery", originalEmail: { to: input.to, subject: input.subject, metadata: input.metadata } } });
    }
    return { ok: false, delivered: false, skipped: false, error: "webhook_failed" };
  }
}

export async function sendAutomationEmail(input: AutomationEmailInput) {
  return sendEmailToWebhook(
    input,
    process.env.EMAIL_AUTOMATION_WEBHOOK_URL || process.env.ASK_COACH_EMAIL_WEBHOOK_URL
  );
}

export async function sendPasswordResetEmail(input: AutomationEmailInput) {
  return sendEmailToWebhook(input, process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL);
}

export const sendEmailAutomation = sendAutomationEmail;
