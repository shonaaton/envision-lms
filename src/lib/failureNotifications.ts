const FAILURE_EMAIL_TO = "sayantanchandra1999@gmail.com";

type FailureNotificationInput = {
  title: string;
  error?: unknown;
  metadata?: Record<string, unknown>;
};

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || "",
    };
  }
  return {
    name: typeof error,
    message: typeof error === "string" ? error : JSON.stringify(error, null, 2),
    stack: "",
  };
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return String(value || "");
  }
}

export async function notifyFailure(input: FailureNotificationInput) {
  const webhook = process.env.EMAIL_AUTOMATION_WEBHOOK_URL || process.env.ASK_COACH_EMAIL_WEBHOOK_URL;
  if (!webhook) return { ok: false, skipped: true, reason: "email_webhook_not_configured" };

  const details = errorDetails(input.error);
  const metadata = {
    app: "Envision Chess Academy LMS",
    environment: process.env.NODE_ENV || "unknown",
    timestamp: new Date().toISOString(),
    ...input.metadata,
  };
  const message = [
    `Failure: ${input.title}`,
    "",
    `Time: ${metadata.timestamp}`,
    `Environment: ${metadata.environment}`,
    "",
    "What happened:",
    details.message || "No error message was provided.",
    "",
    "Error name:",
    details.name || "-",
    "",
    "Metadata:",
    safeJson(metadata),
    "",
    details.stack ? `Stack:\n${details.stack}` : "Stack: not available",
  ].join("\n");

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        to: FAILURE_EMAIL_TO,
        subject: `[LMS Failure] ${input.title}`,
        message,
        replyTo: process.env.EMAIL_REPLY_TO || "support@envisionchessacademy.com",
        metadata: {
          kind: "failure_notification",
          failureTitle: input.title,
          ...metadata,
        },
      }),
    });
    return { ok: response.ok, skipped: false, status: response.status };
  } catch (notificationError) {
    console.error("Failure notification email failed", notificationError);
    return { ok: false, skipped: false, error: "failure_notification_failed" };
  }
}
