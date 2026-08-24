import { dbConnect } from "@/lib/db";
import { sendEmailAutomation } from "@/lib/emailAutomation";
import { notifyFailure } from "@/lib/failureNotifications";
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
const TRANSIENT_DB_RETRY_DELAY_MS = 2_000;

function unreadEmailDelayMs() {
  const configured = Number(process.env.ASK_COACH_UNREAD_EMAIL_DELAY_MINUTES || 5);
  const minutes = Number.isFinite(configured) ? Math.min(Math.max(configured, 0.1), 24 * 60) : 5;
  return Math.round(minutes * 60 * 1000);
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientMongoSelectionError(error: unknown) {
  const name = typeof error === "object" && error ? String((error as { name?: unknown }).name || "") : "";
  const message = error instanceof Error ? error.message : String(error || "");
  const reasonType =
    typeof error === "object" && error && "reason" in error
      ? String((error as { reason?: { type?: unknown } }).reason?.type || "")
      : "";
  return name === "MongoServerSelectionError"
    || name === "MongooseServerSelectionError"
    || /MongoServerSelectionError/i.test(message)
    || /server selection timed out/i.test(message)
    || /ReplicaSetNoPrimary/i.test(reasonType)
    || /connection <monitor> .* closed/i.test(message)
    || /connection timed out/i.test(message);
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

  const recipientName = String(reminder.recipientName || "there");
  const messageUrl = `${resolvePublicAppUrl()}${String(reminder.href || "/ask-coach")}`;

  // Recheck immediately before delivery in case the read receipt arrived while this reminder was being prepared.
  const stillClaimed = await AskCoachEmailReminder.exists({ _id: reminder._id, status: "processing" });
  if (!stillClaimed || !(await messageIsUnread(reminder.message, reminder.recipient))) {
    await cancelReminder(reminder._id, "Message was read on the platform before email delivery.");
    return { processed: true, cancelled: true };
  }
  await AskCoachEmailReminder.updateOne(
    { _id: reminder._id },
    { $set: { senderEmail: "", senderName: "", messageBody: "[redacted]" } }
  );

  const result = await sendEmailAutomation({
    to: String(reminder.recipientEmail),
    subject: "Unread Ask Coach message",
    message: `Hello ${recipientName},\n\nYou have an unread Ask Coach message on the academy platform.\n\nFor privacy, message details are only shown inside the LMS.\n\nOpen the conversation: ${messageUrl}`,
    htmlBody: `<p>Hello ${escapeHtml(recipientName)},</p>
      <p>You have an unread Ask Coach message on the academy platform.</p>
      <p>For privacy, message details are only shown inside the LMS.</p>
      <p><a href="${escapeHtml(messageUrl)}">Open the conversation</a></p>`,
    metadata: {
      kind: "ask_coach_unread_message",
      messageId: String(reminder.message),
      conversationId: String(reminder.conversation),
      senderRole: reminder.senderRole,
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
  if (attempts >= MAX_ATTEMPTS) {
    void notifyFailure({
      title: "Ask Coach unread email reminder exhausted retries",
      error: "Email automation did not confirm delivery.",
      metadata: {
        automation: "ask_coach_unread_email",
        reminderId: String(reminder._id || ""),
        recipientEmail: String(reminder.recipientEmail || ""),
        messageId: String(reminder.message || ""),
        attempts,
      },
    });
  } else {
    scheduleReminder(reminder._id, new Date(Date.now() + RETRY_DELAY_MS));
  }
  return { processed: true, failed: attempts >= MAX_ATTEMPTS };
}

function scheduleReminder(reminderId: unknown, dueAt: Date) {
  const waitMs = Math.max(0, dueAt.getTime() - Date.now());
  const timer = setTimeout(() => {
    void processAskCoachEmailReminder(reminderId).catch((error) => {
      console.error("Ask Coach unread email reminder failed", error);
      void notifyFailure({ title: "Ask Coach unread email reminder failed", error, metadata: { automation: "ask_coach_unread_email", reminderId: String(reminderId || "") } });
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
        senderEmail: "",
        senderName: "",
        senderRole: input.sender.role || "admin",
        messageBody: "[redacted]",
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
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
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
    } catch (error) {
      if (!isTransientMongoSelectionError(error)) throw error;
      if (attempt >= 2) return { checked: 0, sent: 0, cancelled: 0, failed: 0, skippedDbUnavailable: true };
      await sleep(TRANSIENT_DB_RETRY_DELAY_MS);
    }
  }

  return { checked: 0, sent: 0, cancelled: 0, failed: 0 };
}
