import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { renderWhatsAppTemplatePreview } from "@/lib/whatsappTemplateRegistry";
import { WhatsAppMessage } from "@/models/WhatsApp";
import { Types } from "mongoose";
import { WhatsAppConversation, WhatsAppReadState } from "@/models/WhatsAppConversation";
import { isWhatsAppResolved, needsWhatsAppReply, syncWhatsAppConversations } from "@/lib/whatsappInbox";
import "@/models/User";
import { canAccessFeature } from "@/lib/featureAccess";
import { whatsappSession, whatsappConversationScope, canAccessWhatsAppPhone } from "@/lib/whatsappAccess";

export const dynamic = "force-dynamic";

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const THREAD_MESSAGE_LIMIT = 50;

// rawPayload holds the whole webhook body, which is what made every 5-second poll ship
// megabytes. Only the handful of sub-documents the inbox actually renders are projected.
const MESSAGE_FIELDS = [
  "phoneNumber",
  "contactName",
  "profileName",
  "matchedUser",
  "direction",
  "messageType",
  "text",
  "templateName",
  "status",
  "error",
  "uncertain",
  "rawPayload.errors",
  "metaMessageId",
  "mediaId",
  "mediaMimeType",
  "mediaFilename",
  "reactionTargetMessageId",
  "reactionEmoji",
  "createdAt",
  "sentAt",
  "receivedAt",
  "rawPayload.templateVariables",
  "rawPayload.bodyParameters",
  "rawPayload.image",
  "rawPayload.video",
  "rawPayload.audio",
  "rawPayload.voice",
  "rawPayload.document",
  "rawPayload.sticker",
  "rawPayload.reaction",
].join(" ");

const MEDIA_TYPES = ["image", "video", "audio", "voice", "document", "sticker"] as const;

function mediaKind(messageType?: string, mimeType?: string) {
  const type = String(messageType || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  if (type === "sticker") return "sticker";
  if (type === "image" || mime.startsWith("image/")) return "image";
  if (type === "video" || mime.startsWith("video/")) return "video";
  if (type === "audio" || type === "voice" || mime.startsWith("audio/")) return "audio";
  return "document";
}

function mediaOf(message: any) {
  const mediaId = String(message.mediaId || "");
  if (mediaId) {
    return {
      mediaId,
      mediaKind: mediaKind(message.messageType, message.mediaMimeType),
      mediaMimeType: String(message.mediaMimeType || ""),
      mediaFilename: String(message.mediaFilename || ""),
      mediaUrl: `/api/admin/whatsapp/media/${mediaId}`,
    };
  }
  // Messages stored before mediaId existed still carry the ids inside the raw webhook payload.
  for (const type of MEDIA_TYPES) {
    const part = message.rawPayload?.[type];
    if (!part?.id) continue;
    return {
      mediaId: String(part.id),
      mediaKind: mediaKind(type, part.mime_type),
      mediaMimeType: String(part.mime_type || ""),
      mediaFilename: String(part.filename || ""),
      mediaUrl: `/api/admin/whatsapp/media/${part.id}`,
    };
  }
  return null;
}

function reactionTargetOf(message: any) {
  return String(message.reactionTargetMessageId || message.rawPayload?.reaction?.message_id || "");
}

function reactionEmojiOf(message: any) {
  return String(message.reactionEmoji || message.rawPayload?.reaction?.emoji || message.text || "");
}

function isReaction(message: any) {
  return String(message.messageType || "") === "reaction" || Boolean(reactionTargetOf(message));
}

function serializeMessage(message: any) {
  const templateVariables = message.rawPayload?.templateVariables || message.rawPayload?.bodyParameters || [];
  const templatePreview = message.messageType === "template" ? renderWhatsAppTemplatePreview(message.templateName || message.text, templateVariables) : "";
  const text = message.messageType === "template" && (!message.text || message.text === message.templateName) ? templatePreview : message.text;
  return {
    id: message._id.toString(),
    phoneNumber: message.phoneNumber,
    direction: message.direction,
    text,
    messageType: message.messageType,
    templateName: message.templateName,
    status: message.status,
    error: message.error || message.rawPayload?.errors?.[0]?.message || "",
    uncertain: Boolean(message.uncertain),
    metaMessageId: message.metaMessageId,
    createdAt: message.createdAt,
    sentAt: message.sentAt,
    receivedAt: message.receivedAt,
    reactions: [] as { emoji: string; direction: string; at: any }[],
    ...(mediaOf(message) || {}),
  };
}

// Reactions arrive as standalone messages pointing at a target id. Fold them onto the message
// they belong to and drop them from the thread, the way WhatsApp itself renders them.
function buildThread(messages: any[]) {
  const reactionsByTarget = new Map<string, { emoji: string; direction: string; at: any }>();
  for (const message of messages) {
    if (!isReaction(message)) continue;
    const target = reactionTargetOf(message);
    if (!target) continue;
    const at = message.receivedAt || message.sentAt || message.createdAt;
    const current = reactionsByTarget.get(target);
    // A removed reaction is delivered as a later event carrying an empty emoji.
    if (current && new Date(current.at).getTime() > new Date(at).getTime()) continue;
    reactionsByTarget.set(target, { emoji: reactionEmojiOf(message), direction: message.direction, at });
  }

  return messages
    .filter((message) => !isReaction(message))
    .map((message) => {
      const serialized = serializeMessage(message);
      const reaction = message.metaMessageId ? reactionsByTarget.get(String(message.metaMessageId)) : null;
      if (reaction?.emoji) serialized.reactions = [reaction];
      return serialized;
    });
}

function mediaLabel(media: { mediaKind: string; mediaFilename: string }) {
  if (media.mediaKind === "sticker") return "Sticker";
  if (media.mediaKind === "image") return "Photo";
  if (media.mediaKind === "video") return "Video";
  if (media.mediaKind === "audio") return "Voice message";
  return media.mediaFilename || "Document";
}

function previewText(message: any) {
  if (isReaction(message)) {
    const emoji = reactionEmojiOf(message);
    return emoji ? `Reacted ${emoji}` : "Removed a reaction";
  }
  const media = mediaOf(message);
  if (media) {
    const label = mediaLabel(media);
    return message.text ? `${label} · ${message.text}` : label;
  }
  return message.text || (message.messageType === "template" ? renderWhatsAppTemplatePreview(message.templateName || "", message.rawPayload?.templateVariables || message.rawPayload?.bodyParameters || []) : "") || message.templateName || "";
}

function windowState(lastInboundAt: Date | string | null) {
  const lastCustomerMessageAt = lastInboundAt ? new Date(lastInboundAt) : null;
  const windowExpiresAt = lastCustomerMessageAt ? new Date(lastCustomerMessageAt.getTime() + CUSTOMER_SERVICE_WINDOW_MS) : null;
  const remainingSeconds = windowExpiresAt ? Math.max(0, Math.floor((windowExpiresAt.getTime() - Date.now()) / 1000)) : 0;
  const windowOpen = remainingSeconds > 0;
  const expiringSoon = windowOpen && remainingSeconds <= 2 * 60 * 60;
  return {
    last_customer_message_at: lastCustomerMessageAt,
    window_expires_at: windowExpiresAt,
    window_open: windowOpen,
    expiring_soon: expiringSoon,
    remaining_seconds: remainingSeconds,
    free_form_allowed: windowOpen,
    template_required: !windowOpen,
  };
}

function chatPath(phoneNumber: string) {
  return `/admin/whatsapp/${encodeURIComponent(phoneNumber)}`;
}

const UNKNOWN_CONTACT = "Unknown contact";

function serializeMatchedUser(matchedUser: any) {
  if (!matchedUser) return null;
  return {
    id: matchedUser._id.toString(),
    name: matchedUser.name,
    email: matchedUser.email,
    username: matchedUser.username,
    phone: matchedUser.phone,
    role: matchedUser.role,
  };
}

export async function GET(req: Request) {
  const user = await whatsappSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const phoneNumber = params.get("phone") || "";
  await dbConnect();

  if (params.get("view") === "thread") {
    if (!/^\d{7,15}$/.test(phoneNumber)) return NextResponse.json({ error: "A valid phone number is required." }, { status: 400 });
    if (!(await canAccessWhatsAppPhone(user, phoneNumber))) return NextResponse.json({ error: "This conversation is not assigned to you." }, { status: 403 });
    const filter: any = { phoneNumber };
    const before = params.get("before");
    if (before) {
      const [date, id] = before.split("_");
      if (!/^\d+$/.test(date) || !Types.ObjectId.isValid(id || "") || !Number.isFinite(new Date(Number(date)).getTime())) return NextResponse.json({ error: "Invalid history cursor." }, { status: 400 });
      filter.$or = [{ createdAt: { $lt: new Date(Number(date)) } }, { createdAt: new Date(Number(date)), _id: { $lt: new Types.ObjectId(id) } }];
    }
    const query = (params.get("q") || "").trim().slice(0, 200);
    if (query) filter.text = { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const rows: any[] = await WhatsAppMessage.find(filter).select(MESSAGE_FIELDS).sort({ createdAt: -1, _id: -1 }).limit(THREAD_MESSAGE_LIMIT + 1).lean();
    const hasMore = rows.length > THREAD_MESSAGE_LIMIT;
    const page = rows.slice(0, THREAD_MESSAGE_LIMIT);
    const oldest = page[page.length - 1];
    return NextResponse.json({ phoneNumber, messages: buildThread([...page].reverse()), hasMore, nextCursor: hasMore && oldest ? `${new Date(oldest.createdAt).getTime()}_${oldest._id}` : null });
  }

  await syncWhatsAppConversations();
  const [summaries, readStates]: any[][] = await Promise.all([
    WhatsAppConversation.find(whatsappConversationScope(user)).populate([{ path: "matchedUser", select: "name email username phone role" }, { path: "linkedUser", select: "name email username phone role" }, { path: "assignedTo", select: "name role" }]).sort({ lastMessageAt: -1, phoneNumber: 1 }).lean(),
    WhatsAppReadState.find({ actorId: user.id }).lean(),
  ]);
  const reads = new Map(readStates.map((state) => [state.phoneNumber, state.readInboundCount || 0]));
  const conversations = summaries.map((summary) => {
    const whatsapp = windowState(summary.lastInboundAt);
    const resolved = isWhatsAppResolved(summary);
    const matchedUser = summary.linkedManually ? summary.linkedUser : summary.matchedUser;
    return {
      phoneNumber: summary.phoneNumber,
      chatPath: chatPath(summary.phoneNumber),
      contactName: summary.displayName || matchedUser?.name || summary.contactName || summary.profileName || UNKNOWN_CONTACT,
      profileName: summary.profileName,
      matchedUser: serializeMatchedUser(matchedUser),
      assignedTo: summary.assignedTo ? { id: String(summary.assignedTo._id), name: summary.assignedTo.name } : null,
      followUpAt: summary.followUpAt,
      followUpNote: summary.followUpNote || "",
      messages: [],
      lastMessageAt: summary.lastMessageAt,
      lastMessageText: previewText(summary.latest || {}),
      lastInboundAt: summary.lastInboundAt,
      lastInboundId: summary.lastInboundId?.toString() || "",
      sentTemplateCount: summary.sentTemplateCount,
      unreadCount: Math.max(0, (summary.inboundCount || 0) - (reads.get(summary.phoneNumber) || 0)),
      needsReply: needsWhatsAppReply(summary, resolved),
      resolved,
      activeUntil: whatsapp.window_expires_at,
      canReply: whatsapp.free_form_allowed,
      whatsapp,
    };
  });
  return NextResponse.json({ conversations, windowHours: 24 });
}

export async function PATCH(req: Request) {
  const user = await whatsappSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const phoneNumber = String(body.phoneNumber || "");
  if (!/^\d{7,15}$/.test(phoneNumber) || !["read", "resolve", "reopen"].includes(body.action)) return NextResponse.json({ error: "Invalid conversation action." }, { status: 400 });
  if (body.action !== "read" && !(await canAccessFeature("whatsapp", user, "create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  if (!(await canAccessWhatsAppPhone(user, phoneNumber))) return NextResponse.json({ error: "This conversation is not assigned to you." }, { status: 403 });
  if (body.action === "read") {
    if (!Types.ObjectId.isValid(body.lastInboundId || "")) return NextResponse.json({ error: "A read watermark is required." }, { status: 400 });
    const through = new Types.ObjectId(body.lastInboundId);
    const exists = await WhatsAppMessage.exists({ _id: through, phoneNumber, direction: "inbound", messageType: { $ne: "reaction" } });
    if (!exists) return NextResponse.json({ error: "Message not found in this conversation." }, { status: 404 });
    const count = await WhatsAppMessage.countDocuments({ phoneNumber, direction: "inbound", messageType: { $ne: "reaction" }, _id: { $lte: through } });
    await WhatsAppReadState.init();
    await WhatsAppReadState.updateOne({ actorId: user.id, phoneNumber }, { $max: { readInboundCount: count, readThroughInboundId: through } }, { upsert: true });
    return NextResponse.json({ ok: true, readThroughInboundId: through.toString() });
  }
  if (body.action === "resolve" && body.lastInboundId && !Types.ObjectId.isValid(body.lastInboundId)) return NextResponse.json({ error: "Invalid message watermark." }, { status: 400 });
  const result = await WhatsAppConversation.updateOne({ phoneNumber }, body.action === "resolve"
    ? { $set: { resolvedAt: new Date(), resolvedThroughInboundId: body.lastInboundId ? new Types.ObjectId(body.lastInboundId) : null } }
    : { $unset: { resolvedAt: 1, resolvedThroughInboundId: 1 } });
  return NextResponse.json({ ok: Boolean(result.matchedCount) }, { status: result.matchedCount ? 200 : 404 });
}
