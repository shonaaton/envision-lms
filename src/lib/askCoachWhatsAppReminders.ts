import { dbConnect } from "@/lib/db";
import { notifyFailure } from "@/lib/failureNotifications";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { ACADEMY_TIME_ZONE, academyDateKey, academyDateTime } from "@/lib/academyTime";
import { AskCoachEmailReminder, AskCoachMessage, AskCoachWhatsAppDigest } from "@/models/AskCoach";

/**
 * WhatsApp side of the Ask Coach unread flow. Two tiers, both driven by the
 * 60s instrumentation tick:
 *
 *  1. A per-message nudge once a message has gone unread for
 *     ASK_COACH_UNREAD_WHATSAPP_DELAY_MINUTES (default 30).
 *  2. A single nightly digest at ASK_COACH_DIGEST_HOUR (default 21:00) for
 *     anything still unread, capped at one message per recipient per day.
 *
 * Both re-check the read receipt immediately before sending, so opening the
 * conversation in the LMS is always enough to stop the notification.
 */

const ROLES_NEEDING_COACH_ACTION = ["instructor", "admin", "sub-admin"];
const DIGEST_LOOKBACK_DAYS = 7;
const STALE_PROCESSING_MS = 2 * 60 * 1000;

/**
 * A recipient who just got a per-message nudge should not also get the nightly
 * digest minutes later, so the digest stands down for this long afterwards.
 */
const DIGEST_QUIET_PERIOD_MS = 2 * 60 * 60 * 1000;

function digestHour() {
  const configured = Number(process.env.ASK_COACH_DIGEST_HOUR || 21);
  if (!Number.isFinite(configured)) return 21;
  return Math.min(Math.max(Math.trunc(configured), 0), 23);
}

function templateForRole(role: unknown) {
  return ROLES_NEEDING_COACH_ACTION.includes(String(role || "").toLowerCase())
    ? "ask_coach_action_required"
    : "ask_coach_unread";
}

async function messageIsUnread(messageId: unknown, recipientId: unknown) {
  return Boolean(await AskCoachMessage.exists({
    _id: messageId,
    status: "sent",
    readBy: { $not: { $elemMatch: { user: recipientId } } },
  }));
}

/**
 * Tier 1 — per-message nudge for anything unread past the delay.
 */
export async function processDueAskCoachWhatsAppReminders(limit = 50) {
  await dbConnect();
  const now = new Date();
  const staleProcessingBefore = new Date(now.getTime() - STALE_PROCESSING_MS);

  const due: any[] = await AskCoachEmailReminder.find({
    whatsappDueAt: { $lte: now },
    recipientPhone: { $nin: ["", null] },
    $or: [
      { whatsappStatus: "pending" },
      { whatsappStatus: "processing", updatedAt: { $lte: staleProcessingBefore } },
    ],
  })
    .select("_id recipient recipientName recipientPhone recipientCountryCode recipientRole senderName message conversation href")
    .sort({ whatsappDueAt: 1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .lean();

  let sent = 0;
  let cancelled = 0;
  let failed = 0;

  for (const reminder of due) {
    // Claim the row so a second tick (or a second instance) cannot double-send.
    const claimed = await AskCoachEmailReminder.findOneAndUpdate(
      { _id: reminder._id, whatsappStatus: { $in: ["pending", "processing"] } },
      { $set: { whatsappStatus: "processing" } },
      { new: true }
    ).lean();
    if (!claimed) continue;

    if (!(await messageIsUnread(reminder.message, reminder.recipient))) {
      await AskCoachEmailReminder.updateOne(
        { _id: reminder._id },
        { $set: { whatsappStatus: "cancelled", whatsappError: "Message was read before the WhatsApp nudge." } }
      );
      cancelled += 1;
      continue;
    }

    try {
      const result = await sendWhatsAppAutomationTemplate({
        user: {
          _id: reminder.recipient,
          name: reminder.recipientName || "",
          phone: reminder.recipientPhone || "",
          countryCode: reminder.recipientCountryCode || "",
          role: reminder.recipientRole || "",
        },
        templateName: templateForRole(reminder.recipientRole),
        bodyParameters: [reminder.recipientName || "there", reminder.senderName || "the academy"],
        metadata: {
          kind: "ask_coach_unread_whatsapp",
          messageId: String(reminder.message || ""),
          conversationId: String(reminder.conversation || ""),
          recipientName: reminder.recipientName || "",
        },
      });

      if (result.ok && !result.skipped) {
        await AskCoachEmailReminder.updateOne(
          { _id: reminder._id },
          { $set: { whatsappStatus: "sent", whatsappSentAt: new Date() }, $unset: { whatsappError: 1 } }
        );
        sent += 1;
      } else {
        // A skip is a configuration or eligibility outcome, not a transient
        // fault, so it is terminal rather than retried forever.
        const reason = String(result.error || (result.debug as any)?.reason || "whatsapp_send_skipped");
        await AskCoachEmailReminder.updateOne(
          { _id: reminder._id },
          { $set: { whatsappStatus: result.skipped ? "skipped" : "failed", whatsappError: reason } }
        );
        failed += result.skipped ? 0 : 1;
      }
    } catch (error) {
      await AskCoachEmailReminder.updateOne(
        { _id: reminder._id },
        { $set: { whatsappStatus: "failed", whatsappError: error instanceof Error ? error.message : String(error || "") } }
      );
      failed += 1;
    }
  }

  return { checked: due.length, sent, cancelled, failed };
}

type DigestGroup = {
  recipient: unknown;
  recipientName: string;
  recipientPhone: string;
  recipientCountryCode: string;
  recipientRole: string;
  senderName: string;
  messageIds: unknown[];
  lastWhatsAppAt: Date | null;
};

/**
 * Tier 2 — one nightly digest per recipient for anything still unread.
 *
 * Runs from the same 60s tick, so it fires on the first tick at or after the
 * digest hour. The unique (recipient, dateKey) index on AskCoachWhatsAppDigest
 * is what makes that safe: only the writer that wins the upsert sends.
 */
export async function processAskCoachNightlyDigest() {
  await dbConnect();
  const now = new Date();
  const dateKey = academyDateKey(now);
  const digestAt = academyDateTime(dateKey, `${String(digestHour()).padStart(2, "0")}:00`);
  if (now < digestAt) return { skipped: true as const, reason: "before_digest_hour", dateKey };

  const since = new Date(now.getTime() - DIGEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const candidates: any[] = await AskCoachEmailReminder.find({
    createdAt: { $gte: since },
    recipientPhone: { $nin: ["", null] },
  })
    .select("recipient recipientName recipientPhone recipientCountryCode recipientRole senderName message whatsappSentAt")
    .lean();

  const groups = new Map<string, DigestGroup>();
  for (const row of candidates) {
    const key = String(row.recipient || "");
    if (!key) continue;
    const group: DigestGroup = groups.get(key) || {
      recipient: row.recipient,
      recipientName: row.recipientName || "",
      recipientPhone: row.recipientPhone || "",
      recipientCountryCode: row.recipientCountryCode || "",
      recipientRole: row.recipientRole || "",
      senderName: row.senderName || "",
      messageIds: [],
      lastWhatsAppAt: null,
    };
    group.messageIds.push(row.message);
    if (row.whatsappSentAt) {
      const at = new Date(row.whatsappSentAt);
      if (!group.lastWhatsAppAt || at > group.lastWhatsAppAt) group.lastWhatsAppAt = at;
    }
    groups.set(key, group);
  }

  let sent = 0;
  let skipped = 0;

  for (const group of Array.from(groups.values())) {
    if (group.lastWhatsAppAt && now.getTime() - group.lastWhatsAppAt.getTime() < DIGEST_QUIET_PERIOD_MS) {
      skipped += 1;
      continue;
    }

    const unread = await AskCoachMessage.countDocuments({
      _id: { $in: group.messageIds },
      status: "sent",
      readBy: { $not: { $elemMatch: { user: group.recipient } } },
    });
    if (!unread) {
      skipped += 1;
      continue;
    }

    // Win the day's slot before sending; a loser here already sent it.
    const claim = await AskCoachWhatsAppDigest.updateOne(
      { recipient: group.recipient, dateKey },
      { $setOnInsert: { recipient: group.recipient, dateKey, messageCount: unread } },
      { upsert: true }
    );
    if (!claim.upsertedCount) {
      skipped += 1;
      continue;
    }

    try {
      const result = await sendWhatsAppAutomationTemplate({
        user: {
          _id: group.recipient,
          name: group.recipientName,
          phone: group.recipientPhone,
          countryCode: group.recipientCountryCode,
          role: group.recipientRole,
        },
        templateName: templateForRole(group.recipientRole),
        bodyParameters: [group.recipientName || "there", group.senderName || "the academy"],
        metadata: {
          kind: "ask_coach_unread_digest",
          dateKey,
          unreadCount: unread,
          recipientName: group.recipientName,
        },
      });
      await AskCoachWhatsAppDigest.updateOne(
        { recipient: group.recipient, dateKey },
        result.ok && !result.skipped
          ? { $set: { sentAt: new Date(), messageCount: unread }, $unset: { lastError: 1 } }
          : { $set: { lastError: String(result.error || (result.debug as any)?.reason || "whatsapp_send_skipped") } }
      );
      if (result.ok && !result.skipped) sent += 1;
      else skipped += 1;
    } catch (error) {
      await AskCoachWhatsAppDigest.updateOne(
        { recipient: group.recipient, dateKey },
        { $set: { lastError: error instanceof Error ? error.message : String(error || "") } }
      );
      void notifyFailure({
        title: "Ask Coach nightly WhatsApp digest failed",
        error,
        metadata: { automation: "ask_coach_whatsapp_digest", recipient: String(group.recipient || ""), dateKey },
      });
      skipped += 1;
    }
  }

  return { skipped: false as const, dateKey, timeZone: ACADEMY_TIME_ZONE, recipients: groups.size, sent, skippedRecipients: skipped };
}
