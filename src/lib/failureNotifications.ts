import { importantContactWhatsAppRecipientsByKeys, importantContactEmails } from "@/lib/importantContacts";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";

const FAILURE_EMAIL_TO = "sayantanchandra1999@gmail.com";
const FAILURE_THROTTLE_MS = 60 * 60 * 1000;

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

function truncate(value: unknown, maxLength: number) {
  const text = String(value || "").trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
}

function failureReference(input: FailureNotificationInput, metadata: Record<string, unknown>) {
  return truncate(
    metadata.reference ||
      metadata.referenceId ||
      metadata.reminderId ||
      metadata.invoiceId ||
      metadata.bookingId ||
      metadata.classroomId ||
      metadata.scheduledSessionId ||
      metadata.automation ||
      input.title,
    120
  );
}

function shouldThrottleFailureAlert(now = Date.now()) {
  const state = globalThis as typeof globalThis & { __lmsFailureAlertLastSentAt?: number };
  const lastSentAt = Number(state.__lmsFailureAlertLastSentAt || 0);
  if (lastSentAt && now - lastSentAt < FAILURE_THROTTLE_MS) {
    return true;
  }
  state.__lmsFailureAlertLastSentAt = now;
  return false;
}

export async function notifyFailure(input: FailureNotificationInput) {
  if (shouldThrottleFailureAlert()) return { ok: true, skipped: true, reason: "failure_alert_throttled" };

  const details = errorDetails(input.error);
  const metadata = {
    app: "Envision Chess Academy LMS",
    environment: process.env.NODE_ENV || "unknown",
    timestamp: new Date().toISOString(),
    ...input.metadata,
  };
  const webhook = process.env.EMAIL_AUTOMATION_WEBHOOK_URL || process.env.ASK_COACH_EMAIL_WEBHOOK_URL;
  const adminRecipient = importantContactWhatsAppRecipientsByKeys(["primary"])[0];
  const failureEmailTo = adminRecipient?.email || importantContactEmails("admin")[0] || FAILURE_EMAIL_TO;
  const reference = failureReference(input, metadata);
  const shortErrorLog = truncate([
    details.message || "No error message was provided.",
    details.stack ? `Stack: ${details.stack}` : "",
    `Metadata: ${safeJson(metadata)}`,
  ].filter(Boolean).join("\n"), 900);
  const message = [
    `Failure: ${input.title}`,
    "",
    `Reference: ${reference}`,
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

  const emailResult = webhook
    ? await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          to: failureEmailTo,
          subject: `[LMS Failure] ${input.title}`,
          message,
          replyTo: process.env.EMAIL_REPLY_TO || "support@envisionchessacademy.com",
          metadata: {
            kind: "failure_notification",
            failureTitle: input.title,
            reference,
            ...metadata,
          },
        }),
      }).then((response) => ({ ok: response.ok, skipped: false, status: response.status }))
        .catch((notificationError) => {
          console.error("Failure notification email failed", notificationError);
          return { ok: false, skipped: false, error: "failure_notification_email_failed" };
        })
    : { ok: false, skipped: true, reason: "email_webhook_not_configured" };

  const whatsappResult = adminRecipient
    ? await sendWhatsAppAutomationTemplate({
        user: adminRecipient,
        templateName: "lms_failure_alert_admin",
        bodyParameters: [
          adminRecipient.name || "Admin",
          truncate(input.title, 120),
          reference,
          shortErrorLog,
          String(metadata.environment || "unknown"),
          String(metadata.timestamp || ""),
        ],
        metadata: {
          kind: "failure_notification",
          failureTitle: input.title,
          reference,
          channel: "whatsapp",
          notificationDedupKey: `failure:${Math.floor(Date.now() / FAILURE_THROTTLE_MS)}`,
          ...metadata,
        },
      }).catch((notificationError) => {
        console.error("Failure notification WhatsApp failed", notificationError);
        return { ok: false, skipped: false, error: "failure_notification_whatsapp_failed" };
      })
    : { ok: false, skipped: true, reason: "admin_whatsapp_contact_not_configured" };

  return { ok: Boolean(emailResult.ok || whatsappResult.ok), skipped: false, email: emailResult, whatsapp: whatsappResult };
}
