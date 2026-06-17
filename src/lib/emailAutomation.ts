type EmailAutomationPayload = {
  to: string;
  subject: string;
  message: string;
  fromEmail?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
};

export async function sendEmailAutomation(payload: EmailAutomationPayload) {
  const webhook =
    process.env.EMAIL_AUTOMATION_WEBHOOK_URL ||
    process.env.ASK_COACH_EMAIL_WEBHOOK_URL ||
    process.env.N8N_WEBHOOK_BASE;
  if (!webhook || !payload.to) return { delivered: false, skipped: true };

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const responseText = await response.text().catch(() => "");
    return {
      delivered: response.ok,
      skipped: false,
      status: response.status,
      responseText,
    };
  } catch {
    return { delivered: false, skipped: false, status: 0, responseText: "" };
  }
}
