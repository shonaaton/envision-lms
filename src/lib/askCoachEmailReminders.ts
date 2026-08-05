import { dbConnect } from "@/lib/db";
import { sendEmailAutomation } from "@/lib/emailAutomation";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { AskCoachEmailReminder, AskCoachMessage } from "@/models/AskCoach";

type ReminderUser = {
  _id: unknown;
  email?: string;
  name?: string;
  username?: string;
  role?: "student" | "instructor" | "admin";
};

type QueueReminderInput = {
  messageId: unknown;
  conversationId: unknown;
  messageBody: string;
  href: string;
  sender: ReminderUser;
  recipient: ReminderUser;
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000;

function unreadEmailDelayMs() {
  const configured = Number(process.env.ASK_COACH_UNREAD_EMAIL_DELAY_MINUTES || 5);
  const minutes = Number.isFinite(configured) ? Math.min(Math.max(configured, 0.1), 24 * 60) : 5;
  return Math.round(minutes * 60 * 1000);
}

function roleLabel(role: string) {
  if (role === "instructor") return "Coach";
  if (role === "student") return "Student";
  return "Admin";
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function cancelReminder(reminderId: unknown, reason?: string) {
  await AskCoachEmailReminder.updateOne(
    { _id: reminderId, status: { $in: ["pending", "processing"] } },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
        ...(reason ? { lastError: reason } : {}),
      },
      $unset: { processingStartedAt: 1 },
    }
  );
}

async function messageIsUnread(messageId: unknown, recipientId: unknown) {
  return Boolean(await AskCoachMessage.exists({
    _id: messageId,
    status: "sent",
    readBy: { $not: { $elemMatch: { user: recipientId } } },
  }));
}

export async function processAskCoachEmailReminder(reminderId: unknown) {
  await dbConnect();
  const now = new Date();
  const staleProcessingBefore = new Date(now.getTime() - 2 * 60 * 1000);
  const reminder: any = await AskCoachEmailReminder.findOneAndUpdate(
    {
      _id: reminderId,
      dueAt: { $lte: now },
      $or: [
        { status: "pending" },
        { status: "processing", processingStartedAt: { $lte: staleProcessingBefore } },
      ],
    },
    {
      $set: { status: "processing", processingStartedAt: now },
      $inc: { attempts: 1 },
      $unset: { lastError: 1 },
    },
    { new: true }
  ).lean();
  if (!reminder) return { processed: false };

  if (!(await messageIsUnread(reminder.message, reminder.recipient))) {
    await cancelReminder(reminder._id, "Message was read on the platform before the email deadline.");
    return { processed: true, cancelled: true };
  }

  const senderName = String(reminder.senderName || "A platform user");
  const senderEmail = String(reminder.senderEmail || "");
  const senderType = roleLabel(String(reminder.senderRole || ""));
  const recipientName = String(reminder.recipientName || "there");
  const messageBody = String(reminder.messageBody || "");
  const messageUrl = `${resolvePublicAppUrl()}${String(reminder.href || "/ask-coach")}`;

  // Recheck immediately before delivery in case the read receipt arrived while this reminder was being prepared.
  const stillClaimed = await AskCoachEmailReminder.exists({ _id: reminder._id, status: "processing" });
  if (!stillClaimed || !(await messageIsUnread(reminder.message, reminder.recipient))) {
    await cancelReminder(reminder._id, "Message was read on the platform before email delivery.");
    return { processed: true, cancelled: true };
  }

  const senderDetails = `${senderType}: ${senderName}${senderEmail ? `\nSender email: ${senderEmail}` : ""}`;
  const result = await sendEmailAutomation({
    to: String(reminder.recipientEmail),
    subject: `Unread Ask Coach message from ${senderName}`,
    message: `Hello ${recipientName},\n\nYou have an unread message on the academy platform.\n\nMessage:\n${messageBody}\n\n${senderDetails}\n\nOpen the conversation: ${messageUrl}`,
    htmlBody: `<p>Hello ${escapeHtml(recipientName)},</p>
      <p>You have an unread message on the academy platform.</p>
      <p><strong>Message:</strong></p>
      <blockquote style="margin:12px 0;padding:12px 16px;border-left:4px solid #5a1372;background:#f8f5fa;white-space:pre-wrap">${escapeHtml(messageBody)}</blockquote>
      <p><strong>${escapeHtml(senderType)}:</strong> ${escapeHtml(senderName)}<br />
      ${senderEmail ? `<strong>Sender email:</strong> ${escapeHtml(senderEmail)}` : ""}</p>
      <p><a href="${escapeHtml(messageUrl)}">Open the conversation</a></p>`,
    replyTo: senderEmail || undefined,
    metadata: {
      kind: "ask_coach_unread_message",
      messageId: String(reminder.message),
      conversationId: String(reminder.conversation),
      senderRole: reminder.senderRole,
      senderEmail,
    },
  });

  if (result.delivered) {
    await AskCoachEmailReminder.updateOne(
      { _id: reminder._id, status: "processing" },
      { $set: { status: "sent", sentAt: new Date() }, $unset: { processingStartedAt: 1, lastError: 1 } }
    );
    return { processed: true, sent: true };
  }

  const attempts = Number(reminder.attempts || 1);
  await AskCoachEmailReminder.updateOne(
    { _id: reminder._id, status: "processing" },
    {
      $set: attempts >= MAX_ATTEMPTS
        ? { status: "failed", lastError: "Email automation did not confirm delivery." }
        : { status: "pending", dueAt: new Date(Date.now() + RETRY_DELAY_MS), lastError: "Email delivery will be retried." },
      $unset: { processingStartedAt: 1 },
    }
  );
  if (attempts < MAX_ATTEMPTS) scheduleReminder(reminder._id, new Date(Date.now() + RETRY_DELAY_MS));
  return { processed: true, failed: attempts >= MAX_ATTEMPTS };
}

function scheduleReminder(reminderId: unknown, dueAt: Date) {
  const waitMs = Math.max(0, dueAt.getTime() - Date.now());
  const timer = setTimeout(() => {
    void processAskCoachEmailReminder(reminderId).catch((error) => {
      console.error("Ask Coach unread email reminder failed", error);
      scheduleReminder(reminderId, new Date(Date.now() + RETRY_DELAY_MS));
    });
  }, waitMs);
  timer.unref?.();
}

export async function queueAskCoachUnreadEmail(input: QueueReminderInput) {
  const recipientEmail = String(input.recipient.email || "").trim();
  if (!recipientEmail) return null;

  const dueAt = new Date(Date.now() + unreadEmailDelayMs());
  const reminder: any = await AskCoachEmailReminder.findOneAndUpdate(
    { message: input.messageId, recipient: input.recipient._id },
    {
      $setOnInsert: {
        message: input.messageId,
        conversation: input.conversationId,
        recipient: input.recipient._id,
        recipientEmail,
        recipientName: input.recipient.name || input.recipient.username || "",
        sender: input.sender._id,
        senderEmail: input.sender.email || "",
        senderName: input.sender.name || input.sender.username || "",
        senderRole: input.sender.role || "admin",
        messageBody: input.messageBody,
        href: input.href,
        dueAt,
        status: "pending",
      },
    },
    { upsert: true, new: true }
  ).lean();
  if (reminder?.status === "pending") scheduleReminder(reminder._id, new Date(reminder.dueAt));
  return reminder;
}

export async function cancelAskCoachUnreadEmails(conversationId: unknown, recipientId: unknown) {
  await AskCoachEmailReminder.updateMany(
    {
      conversation: conversationId,
      recipient: recipientId,
      status: { $in: ["pending", "processing"] },
    },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
        lastError: "Message was read on the platform before email delivery.",
      },
      $unset: { processingStartedAt: 1 },
    }
  );
}

export async function processDueAskCoachEmailReminders(limit = 50) {
  await dbConnect();
  const now = new Date();
  const staleProcessingBefore = new Date(now.getTime() - 2 * 60 * 1000);
  const due = await AskCoachEmailReminder.find({
    dueAt: { $lte: now },
    $or: [
      { status: "pending" },
      { status: "processing", processingStartedAt: { $lte: staleProcessingBefore } },
    ],
  })
    .select("_id")
    .sort({ dueAt: 1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .lean();

  const results = [];
  for (const reminder of due) results.push(await processAskCoachEmailReminder(reminder._id));
  return {
    checked: due.length,
    sent: results.filter((result) => result.sent).length,
    cancelled: results.filter((result) => result.cancelled).length,
    failed: results.filter((result) => result.failed).length,
  };
}
