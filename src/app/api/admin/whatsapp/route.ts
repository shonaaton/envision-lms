import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { renderWhatsAppTemplatePreview } from "@/lib/whatsappTemplateRegistry";
import { WhatsAppMessage } from "@/models/WhatsApp";

export const dynamic = "force-dynamic";

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CONVERSATION_SCAN_LIMIT = 400;
const THREAD_MESSAGE_LIMIT = 200;

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

function canManageWhatsApp(session: any) {
  return ["admin", "sub-admin"].includes(String(session?.user?.role || ""));
}

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
  return serializeMessage(message).text || message.templateName || "";
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

function messageActivityAt(message: any) {
  return message.direction === "inbound"
    ? message.receivedAt || message.createdAt
    : message.sentAt || message.createdAt;
}

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
  const session = await auth();
  if (!canManageWhatsApp(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedPhone = String(new URL(req.url).searchParams.get("phone") || "").trim();

  await dbConnect();
  const messages: any[] = await WhatsAppMessage.find({})
    .select(MESSAGE_FIELDS)
    .populate("matchedUser", "name email username phone role")
    .sort({ createdAt: -1 })
    .limit(CONVERSATION_SCAN_LIMIT)
    .lean();

  const conversations = new Map<string, any>();
  for (const message of [...messages].reverse()) {
    const phoneNumber = String(message.phoneNumber || "");
    const current = conversations.get(phoneNumber) || {
      phoneNumber,
      chatPath: chatPath(phoneNumber),
      contactName: message.matchedUser?.name || message.contactName || message.profileName || UNKNOWN_CONTACT,
      profileName: message.profileName || "",
      matchedUser: serializeMatchedUser(message.matchedUser),
      messages: [],
      lastInboundAt: null,
      lastBusinessMessageAt: null,
      lastMessageAt: null,
      lastMessageDirection: null,
      lastMessageText: "",
      sentTemplateCount: 0,
    };
    const activityAt = messageActivityAt(message);
    if (!current.lastMessageAt || new Date(activityAt).getTime() >= new Date(current.lastMessageAt).getTime()) {
      current.lastMessageAt = activityAt;
      current.lastMessageDirection = message.direction;
      current.lastMessageText = previewText(message);
    }
    if (message.direction === "inbound") {
      const inboundAt = message.receivedAt || message.createdAt;
      if (!current.lastInboundAt || new Date(inboundAt).getTime() >= new Date(current.lastInboundAt).getTime()) {
        current.lastInboundAt = inboundAt;
      }
    }
    // The thread's name came from whichever message was oldest, so a thread whose first
    // message failed to match a user stayed "Unknown contact" forever. Let any later
    // message that did match supply the name instead.
    if (!current.matchedUser && message.matchedUser) {
      current.matchedUser = serializeMatchedUser(message.matchedUser);
    }
    if (current.contactName === UNKNOWN_CONTACT) {
      current.contactName = message.matchedUser?.name || message.contactName || message.profileName || UNKNOWN_CONTACT;
    }
    if (message.direction === "outbound") current.lastBusinessMessageAt = message.sentAt || message.createdAt;
    if (message.direction === "outbound" && message.messageType === "template") current.sentTemplateCount += 1;
    conversations.set(phoneNumber, current);
  }

  const ordered = Array.from(conversations.values()).sort(
    (a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
  );

  // Only the open thread needs its messages, so the list poll no longer carries every message
  // of every conversation. That thread is read straight off the phoneNumber index.
  const openPhone = requestedPhone || ordered[0]?.phoneNumber || "";
  if (openPhone) {
    const threadMessages: any[] = await WhatsAppMessage.find({ phoneNumber: openPhone })
      .select(MESSAGE_FIELDS)
      .sort({ createdAt: -1 })
      .limit(THREAD_MESSAGE_LIMIT)
      .lean();
    const conversation = conversations.get(openPhone);
    if (conversation) conversation.messages = buildThread([...threadMessages].reverse());
  }

  const data = ordered.map((conversation) => {
    const whatsapp = windowState(conversation.lastInboundAt);
    return { ...conversation, activeUntil: whatsapp.window_expires_at, canReply: whatsapp.free_form_allowed, whatsapp };
  });

  return NextResponse.json({
    conversations: data,
    active: data.filter((conversation) => conversation.canReply),
    closed: data.filter((conversation) => !conversation.canReply),
    sentTemplates: data.filter((conversation) => conversation.sentTemplateCount > 0),
    loadedPhoneNumber: openPhone,
    windowHours: 24,
  });
}
