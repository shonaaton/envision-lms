export async function sendAutomationEmail(input: {
  to?: string;
  subject: string;
  message: string;
  htmlBody?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}) {
  const webhook = process.env.EMAIL_AUTOMATION_WEBHOOK_URL || process.env.ASK_COACH_EMAIL_WEBHOOK_URL;
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
      body: JSON.stringify({
        to: input.to,
        subject: input.subject,
        message: input.message,
        htmlBody,
        replyTo: input.replyTo || process.env.EMAIL_REPLY_TO || "support@envisionchessacademy.com",
        metadata: input.metadata || {},
      }),
    });
    return { ok: response.ok, delivered: response.ok, status: response.status, skipped: false };
  } catch (error) {
    console.error("Email automation failed", error);
    return { ok: false, delivered: false, skipped: false, error: "webhook_failed" };
  }
}

export const sendEmailAutomation = sendAutomationEmail;
