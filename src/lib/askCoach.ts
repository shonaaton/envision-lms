import { Types } from "mongoose";
import { Batch } from "@/models/Batch";
import { AskCoachConversation, AskCoachMessage } from "@/models/AskCoach";
import { Notification } from "@/models/Fee";

const badWords = ["abuse", "idiot", "stupid", "shut up", "bloody", "damn"];

export function checkMessageSafety(text: string) {
  const reasons: string[] = [];
  if (/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/i.test(text)) reasons.push("email_address");
  if (/(?:\+?\d[\s-]?){8,}/.test(text)) reasons.push("phone_number");
  if (/(whatsapp|telegram|instagram|discord|snapchat|call me|text me)/i.test(text)) reasons.push("external_contact");
  const lower = text.toLowerCase();
  for (const word of badWords) if (lower.includes(word)) reasons.push("restricted_language");
  return { flagged: reasons.length > 0, reasons: Array.from(new Set(reasons)) };
}

export async function notifyUser(user: any, title: string, message: string, metadata: any = {}) {
  if (!user) return;
  await Notification.create({ user, type: "ask_coach", title, message, metadata });
}

export async function notifyAdmins(title: string, message: string, metadata: any = {}) {
  const { User } = await import("@/models/User");
  const admins = await User.find({ role: "admin", isActive: true }).select("_id").lean();
  await Notification.insertMany(admins.map((admin: any) => ({ user: admin._id, type: "ask_coach_admin", title, message, metadata })));
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
}) {
  const safety = checkMessageSafety(input.body);
  const message = await AskCoachMessage.create({
    conversation: input.conversation._id,
    type: input.conversation.type,
    sender: input.sender,
    receiver: input.receiver,
    batch: input.batch,
    body: input.body,
    flagged: safety.flagged,
    flagReasons: safety.reasons,
    status: safety.flagged ? "flagged" : "sent",
    moderationStatus: safety.flagged ? "pending" : "none",
    readBy: [{ user: input.sender, readAt: new Date() }],
  });
  await AskCoachConversation.findByIdAndUpdate(input.conversation._id, {
    lastMessageAt: new Date(),
    lastMessagePreview: input.body.slice(0, 120),
  });
  if (safety.flagged) {
    await notifyAdmins("Ask Coach message flagged", "A message needs moderation review.", {
      conversation: input.conversation._id,
      message: message._id,
      reasons: safety.reasons,
    });
    await notifyUser(input.sender, "Message flagged for review", "Your message was sent for admin review because it may contain restricted content.", {
      message: message._id,
      reasons: safety.reasons,
    });
  }
  return message;
}
