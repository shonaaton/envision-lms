type EmailAutomationPayload = {
  to: string;
  subject: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export async function sendEmailAutomation(payload: EmailAutomationPayload) {
  const webhook = process.env.ASK_COACH_EMAIL_WEBHOOK_URL || process.env.EMAIL_AUTOMATION_WEBHOOK_URL;
  if (!webhook || !payload.to) return { delivered: false, skipped: true };

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { delivered: response.ok, skipped: false };
  } catch {
    return { delivered: false, skipped: false };
  }
}
