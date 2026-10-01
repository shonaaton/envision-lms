import "server-only";

import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppAutomationTemplates } from "@/lib/whatsappAutomationEvents";
import { Notification } from "@/models/Fee";
import type { LeaveRecipient } from "./leaveRecipients";

type Channels = { inApp?: boolean; email?: boolean; whatsapp?: boolean };

export type LeaveNotice = {
  /** Stable per event; each recipient gets at most one in-app row per key. */
  dedupKey: string;
  title: string;
  /** Plain text, without the greeting - it is added per person. */
  message: (recipient: LeaveRecipient) => string;
  href: string;
  leaveId: string;
  event: string;
  channels: Channels;
  templateName?: string;
  bodyParameters?: (recipient: LeaveRecipient) => unknown[];
};

/**
 * WhatsApp template parameters may not carry newlines, tabs or long runs of
 * spaces (Meta rejects the send), so every value is flattened and capped.
 */
export function whatsappParam(value: unknown, max = 300) {
  const flat = String(value ?? "").replace(/\s+/g, " ").trim();
  return (flat.length > max ? `${flat.slice(0, max - 1)}…` : flat) || "-";
}

async function inApp(recipient: LeaveRecipient, notice: LeaveNotice) {
  if (!recipient.userId) return;
  await Notification.updateOne(
    { user: recipient.userId, "metadata.dedupKey": notice.dedupKey },
    {
      $setOnInsert: {
        user: recipient.userId,
        type: `leave.${notice.event}`,
        title: notice.title,
        message: notice.message(recipient),
        metadata: { href: notice.href, dedupKey: notice.dedupKey, leaveId: notice.leaveId, event: notice.event },
      },
    },
    { upsert: true }
  );
}

/**
 * One leave event to a list of people, on the channels it asks for. Each
 * channel fails on its own: a notice is never allowed to undo the leave action
 * it reports.
 */
export async function notifyLeave(recipients: LeaveRecipient[], notice: LeaveNotice) {
  if (!recipients.length) return;
  const jobs: Promise<unknown>[] = [];
  if (notice.channels.inApp) {
    jobs.push(...recipients.map((recipient) => inApp(recipient, notice).catch((error) => console.error("[leave] in-app notice failed", error))));
  }
  if (notice.channels.email) {
    jobs.push(...recipients.filter((recipient) => recipient.email).map((recipient) => sendAutomationEmail({
      to: recipient.email,
      subject: notice.title,
      message: [`Hello ${recipient.name || "there"},`, "", notice.message(recipient), "", "Team Envision Chess Academy"].join("\n"),
      actionLabel: "Open Leave",
      metadata: { kind: "staff_leave", event: notice.event, leaveId: notice.leaveId, href: notice.href, dedupKey: `${notice.dedupKey}:email` },
    }).catch((error) => console.error("[leave] email failed", error))));
  }
  if (notice.channels.whatsapp && notice.templateName) {
    const templateName = notice.templateName;
    jobs.push(sendWhatsAppAutomationTemplates(recipients.filter((recipient) => recipient.phone).map((recipient) => ({
      user: { _id: recipient.userId || undefined, name: recipient.name, phone: recipient.phone, countryCode: recipient.countryCode || undefined, role: "staff" },
      templateName,
      bodyParameters: (notice.bodyParameters?.(recipient) || []).map((value) => whatsappParam(value)),
      metadata: {
        kind: "staff_leave",
        event: notice.event,
        leaveId: notice.leaveId,
        href: notice.href,
        recipientType: "staff",
        notificationDedupKey: `${notice.dedupKey}:${recipient.userId || recipient.phone}`,
      },
    }))).catch((error) => console.error("[leave] WhatsApp failed", error)));
  }
  await Promise.all(jobs);
}
