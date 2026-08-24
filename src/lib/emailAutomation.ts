import { resolvePublicAppUrl } from "@/lib/appUrl";
import { notifyFailure } from "@/lib/failureNotifications";

type AutomationEmailInput = {
  to?: string;
  subject: string;
  message: string;
  htmlBody?: string;
  actionUrl?: string;
  actionLabel?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
};

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function actionUrlFromMetadata(metadata: Record<string, unknown>) {
  const directKeys = ["actionUrl", "invoiceUrl", "portalUrl", "assignmentUrl", "homeworkUrl", "messageUrl", "resetUrl", "loginUrl"];
  for (const key of directKeys) {
    const value = String(metadata[key] || "").trim();
    if (isHttpUrl(value)) return value;
  }

  const href = String(metadata.href || "").trim();
  if (isHttpUrl(href)) return href;
  if (href.startsWith("/")) {
    const baseUrl = resolvePublicAppUrl();
    if (baseUrl) return `${baseUrl}${href}`;
  }

  return "";
}

function firstMessageUrl(message: string) {
  const match = message.match(/https?:\/\/[^\s<>"')]+/i);
  return match?.[0]?.replace(/[.,;:!?]+$/, "") || "";
}

function actionLabelFromMessage(message: string, actionUrl: string) {
  const line = message
    .split(/\n+/)
    .map((value) => value.trim())
    .find((value) => value.includes(actionUrl) || /https?:\/\/[^\s<>"')]+/i.test(value));
  const prefix = line?.split(":")[0]?.trim();
  if (prefix && prefix.length <= 40 && !/^https?$/i.test(prefix)) return prefix;
  return "";
}

function actionLabelFromKind(kind?: unknown) {
  const labels: Record<string, string> = {
    ask_coach_unread_message: "Open Conversation",
    attendance_reminder: "Mark Attendance",
    achievement_unlocked: "View Leaderboard",
    class_completed_summary: "Open Homework",
    course_assigned: "Open Classroom",
    credit_reminder: "View Credits",
    homework_assigned: "Open Assignment",
    homework_due_reminder: "Open Homework",
    homework_submitted_confirmation: "Open Homework",
    invoice_overdue_escalation: "View Invoice",
    invoice_reminder: "View Invoice",
    welcome: "Sign In",
  };
  return labels[String(kind || "")] || "Open in LMS";
}

function normalizeAction(input: AutomationEmailInput) {
  const metadata = input.metadata || {};
  const actionUrl = String(input.actionUrl || actionUrlFromMetadata(metadata) || firstMessageUrl(input.message) || "").trim();
  if (!isHttpUrl(actionUrl)) return { actionUrl: "", actionLabel: "" };
  const actionLabel = String(input.actionLabel || metadata.actionLabel || actionLabelFromMessage(input.message, actionUrl) || actionLabelFromKind(metadata.kind)).trim();
  return { actionUrl, actionLabel };
}

function stripActionUrlLines(message: string, actionUrl: string) {
  if (!actionUrl) return message;
  return message
    .split(/\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (trimmed.includes(actionUrl)) return false;
      return !/https?:\/\/[^\s<>"')]+/i.test(trimmed);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildHtmlBody(message: string, actionUrl: string, actionLabel: string) {
  const paragraphs = message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
  const button = actionUrl
    ? `<p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#5a1372;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">${escapeHtml(actionLabel || "Open in LMS")}</a></p>`
    : "";
  return `${paragraphs}${button}`;
}

async function sendEmailToWebhook(input: AutomationEmailInput, webhook?: string) {
  if (!webhook || !input.to) return { ok: false, delivered: false, skipped: true };
  const action = normalizeAction(input);
  const message = stripActionUrlLines(input.message, action.actionUrl);
  const htmlBody = action.actionUrl ? buildHtmlBody(message, action.actionUrl, action.actionLabel) : input.htmlBody || buildHtmlBody(message, "", "");
  const metadata = {
    ...(input.metadata || {}),
    ...(action.actionUrl ? { actionUrl: action.actionUrl, actionLabel: action.actionLabel } : {}),
  };

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        to: input.to,
        subject: input.subject,
        message,
        htmlBody,
        actionUrl: action.actionUrl,
        actionLabel: action.actionLabel,
        replyTo: input.replyTo || process.env.EMAIL_REPLY_TO || "support@envisionchessacademy.com",
        metadata,
      }),
    });
    const payload = await response.json().catch(() => null);
    const delivered = response.ok && payload?.delivered !== false && payload?.ok !== false;
    if (!delivered) {
      console.error("Email automation rejected delivery", { status: response.status, payload });
      if (input.metadata?.kind !== "failure_notification") {
        void notifyFailure({ title: "Email automation rejected delivery", error: `Webhook responded with status ${response.status}`, metadata: { automation: "email_delivery", payload, originalEmail: { to: input.to, subject: input.subject, metadata } } });
      }
    }
    return { ok: delivered, delivered, status: response.status, skipped: false, payload };
  } catch (error) {
    console.error("Email automation failed", error);
    if (input.metadata?.kind !== "failure_notification") {
      void notifyFailure({ title: "Email automation request failed", error, metadata: { automation: "email_delivery", originalEmail: { to: input.to, subject: input.subject, metadata } } });
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
