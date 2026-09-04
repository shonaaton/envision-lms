import { Types } from "mongoose";
import { Batch } from "@/models/Batch";
import { AskCoachConversation, AskCoachMessage } from "@/models/AskCoach";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { sendEmailAutomation } from "@/lib/emailAutomation";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";

const badWords = ["abuse", "idiot", "stupid", "shut up", "bloody", "damn"];

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function checkMessageSafety(text: string) {
  const reasons: string[] = [];
  if (/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i.test(text)) reasons.push("email_address");
  if (/(?:\+?\d[\s-]?){8,}/.test(text)) reasons.push("phone_number");
  if (/(whatsapp|telegram|instagram|discord|snapchat|call me|text me)/i.test(text)) reasons.push("external_contact");
  const lower = text.toLowerCase();
  for (const word of badWords) if (lower.includes(word)) reasons.push("restricted_language");
  return { flagged: reasons.length > 0, reasons: Array.from(new Set(reasons)) };
}

export async function notifyUser(
  user: any,
  title: string,
  message: string,
  metadata: any = {},
  options: { sendEmail?: boolean } = {}
) {
  if (!user) return;
  const notification = await Notification.create({ user, type: "ask_coach", title, message, metadata });
  if (options.sendEmail === false) return notification;
  const recipient: { email?: string; name?: string; phone?: string; role?: string } | null = metadata?.email
    ? { email: String(metadata.email), name: String(metadata.recipientName || ""), phone: String(metadata.phone || "") }
    : await User.findById(user).select("email name phone role").lean<{ email?: string; name?: string; phone?: string; role?: string } | null>();
  if (recipient?.email) {
    await sendEmailAutomation({
      to: String(recipient.email),
      subject: title,
      message,
      metadata: {
        ...metadata,
        recipientName: metadata?.recipientName || recipient?.name,
        notificationId: notification._id.toString(),
      },
    });
  }
  const recipientRole = String(recipient?.role || metadata?.recipientRole || "");
  const needsCoachAction = ["instructor", "admin", "sub-admin"].includes(recipientRole);
  await sendWhatsAppAutomationTemplate({
    user: { _id: user, name: recipient?.name || metadata?.recipientName || "", phone: recipient?.phone || metadata?.phone || "" },
    templateName: needsCoachAction ? "ask_coach_action_required" : "ask_coach_unread",
    bodyParameters: [recipient?.name || metadata?.recipientName || "there", metadata?.senderName || metadata?.flaggedBy || "the academy"],
    metadata: { ...metadata, notificationId: notification._id.toString(), kind: needsCoachAction ? "ask_coach_action_required" : "ask_coach_notification" },
  });
  return notification;
}

export async function notifyAdmins(title: string, message: string, metadata: any = {}) {
  const { User } = await import("@/models/User");
  const admins = await User.find({ role: "admin", isActive: true }).select("_id email name").lean();
  const notifications = await Notification.insertMany(
    admins.map((admin: any) => ({ user: admin._id, type: "ask_coach_admin", title, message, metadata }))
  );
  await Promise.all(
    admins.map((admin: any, index: number) =>
      admin.email
        ? sendEmailAutomation({
          to: String(admin.email),
          subject: title,
          message,
          htmlBody: typeof metadata?.htmlBody === "string" ? metadata.htmlBody : undefined,
            metadata: {
              ...metadata,
              recipientName: admin.name,
              notificationId: notifications[index]?._id?.toString?.(),
            },
          })
        : Promise.resolve()
    )
  );
}

export async function canAccessConversation(user: any, conversation: any) {
  if (!conversation || user.role === "admin") return Boolean(conversation);
  const userId = user.id?.toString?.() || user._id?.toString?.();
  if (conversation.type === "direct") {
    return (conversation.participants || []).some((id: any) => id.toString() === userId);
  }
  if (conversation.type === "batch") {
    if (conversation.coach?.toString?.() === userId) return true;
    const batch: any = await Batch.findById(conversation.batch).select("students coach").lean();
    return Boolean(batch?.coach?.toString() === userId || (batch?.students || []).some((id: any) => id.toString() === userId));
  }
  return false;
}

export async function ensureDirectConversation(studentId: string, coachId: string) {
  const participants = [new Types.ObjectId(studentId), new Types.ObjectId(coachId)];
  return AskCoachConversation.findOneAndUpdate(
    { type: "direct", student: studentId, coach: coachId },
    { type: "direct", student: studentId, coach: coachId, participants, title: "Ask Coach" },
    { upsert: true, new: true }
  );
}

export async function ensureBatchConversation(batchId: string) {
  const batch: any = await Batch.findById(batchId).populate("coach", "name").lean();
  if (!batch) throw new Error("Batch not found");
  const participants = [batch.coach, ...(batch.students || [])].filter(Boolean);
  return AskCoachConversation.findOneAndUpdate(
    { type: "batch", batch: batchId },
    { type: "batch", batch: batchId, coach: batch.coach, participants, title: batch.name },
    { upsert: true, new: true }
  );
}

export async function createAskCoachMessage(input: {
  conversation: any;
  sender: string;
  receiver?: string;
  batch?: string;
  body: string;
  messageType?: "direct" | "batch";
}) {
  const safety = checkMessageSafety(input.body);
  const message = await AskCoachMessage.create({
    conversation: input.conversation._id,
    type: input.messageType || input.conversation.type,
    sender: input.sender,
    receiver: input.receiver,
    batch: input.batch,
    body: input.body,
    flagged: safety.flagged,
    flagReasons: safety.reasons,
    status: safety.flagged ? "hidden" : "sent",
    moderationStatus: safety.flagged ? "pending" : "none",
    readBy: [{ user: input.sender, readAt: new Date() }],
  });
  await AskCoachConversation.findByIdAndUpdate(input.conversation._id, {
    lastMessageAt: new Date(),
    lastMessagePreview: safety.flagged ? "Message pending admin review" : input.body.slice(0, 120),
  });
  if (safety.flagged) {
    const sender: any = await User.findById(input.sender).select("name username email role").lean();
    const coachId = input.conversation.coach || (sender?.role === "instructor" ? input.sender : input.receiver);
    const coach: any = coachId
      ? await User.findById(coachId).select("name username email").lean()
      : null;
    const href = `/ask-coach?conversation=${input.conversation._id.toString()}&message=${message._id.toString()}`;
    const reviewUrl = `${resolvePublicAppUrl()}${href}`;
    const context = input.batch
      ? `Batch conversation: ${input.conversation.title || input.batch}`
      : `Conversation: ${input.conversation.title || "Direct message"}`;
    await notifyAdmins("Ask Coach message flagged", `${sender?.name || "A user"} sent a message that requires moderation.`, {
      conversation: input.conversation._id,
      message: message._id,
      reasons: safety.reasons,
      href,
      flaggedBy: sender?.name || sender?.username || "Unknown user",
      flaggedByEmail: sender?.email || "",
      coachName: coach?.name || coach?.username || "Not assigned",
      coachEmail: coach?.email || "",
      flaggedContent: input.body,
      classroomDetails: context,
      htmlBody: `<p><strong>User:</strong> ${escapeHtml(sender?.name || sender?.username || "Unknown user")}</p>
        <p><strong>Coach:</strong> ${escapeHtml(coach?.name || coach?.username || "Not assigned")}</p>
        <p><strong>Context:</strong> ${escapeHtml(context)}</p>
        <p><strong>Reasons:</strong> ${escapeHtml(safety.reasons.join(", "))}</p>
        <p><strong>Flagged message:</strong></p><blockquote>${escapeHtml(input.body)}</blockquote>
        <p><a href="${reviewUrl}">Review the flagged message</a></p>`,
    });
    await notifyUser(input.sender, "Message flagged for review", "Your message was hidden and sent for admin review because it may contain restricted content.", {
      message: message._id,
      reasons: safety.reasons,
      href: `/ask-coach?conversation=${input.conversation._id.toString()}`,
    });
  }
  return message;
}
