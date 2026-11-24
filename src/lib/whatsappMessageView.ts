import { getWhatsAppTemplateDefinition, renderWhatsAppTemplatePreview } from "@/lib/whatsappTemplateRegistry";
import { BROCHURES, BROCHURE_BASE_PATH } from "@/lib/demoLeadWhatsAppRules";

/**
 * How a stored WhatsApp message is shown in an inbox: text, template preview,
 * media, reactions, ticks. Shared by the online inbox (/admin/whatsapp) and the
 * Bowbazar centre's WhatsApp screen, which serve media from their own routes
 * (`mediaBase`), because each checks a different access rule.
 */
export const ADMIN_MEDIA_BASE = "/api/admin/whatsapp/media";

// rawPayload holds the whole webhook body, which is what made every 5-second poll ship
// megabytes. Only the handful of sub-documents the inbox actually renders are projected.
export const MESSAGE_FIELDS = [
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
  "rawPayload.metadata.brochure",
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

export function mediaKind(messageType?: string, mimeType?: string) {
  const type = String(messageType || "").toLowerCase();
  const mime = String(mimeType || "").toLowerCase();
  if (type === "sticker") return "sticker";
  if (type === "image" || mime.startsWith("image/")) return "image";
  if (type === "video" || mime.startsWith("video/")) return "video";
  if (type === "audio" || type === "voice" || mime.startsWith("audio/")) return "audio";
  return "document";
}

export function mediaOf(message: any, mediaBase = ADMIN_MEDIA_BASE) {
  const mediaId = String(message.mediaId || "");
  if (mediaId) {
    return {
      mediaId,
      mediaKind: mediaKind(message.messageType, message.mediaMimeType),
      mediaMimeType: String(message.mediaMimeType || ""),
      mediaFilename: String(message.mediaFilename || ""),
      mediaUrl: `${mediaBase}/${mediaId}`,
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
      mediaUrl: `${mediaBase}/${part.id}`,
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

export function isReaction(message: any) {
  return String(message.messageType || "") === "reaction" || Boolean(reactionTargetOf(message));
}

/**
 * What a template shows the parent besides its text: its buttons, and the PDF
 * a fee-brochure message carried (2026-11-20). The inbox only drew the body,
 * so a welcome with two buttons looked as if it had none.
 */
function templateExtras(message: any) {
  if (message.messageType !== "template") return {};
  const definition: any = getWhatsAppTemplateDefinition(message.templateName);
  const templateButtons = (definition?.buttons || []).map((button: any) => String(button.text));
  const file = String(message.rawPayload?.metadata?.brochure || "");
  const brochure = file ? Object.values(BROCHURES).find((item) => item.file === file) : undefined;
  return {
    ...(templateButtons.length ? { templateButtons } : {}),
    ...(brochure ? { mediaKind: "document" as const, mediaFilename: brochure.filename, mediaUrl: `${BROCHURE_BASE_PATH}/${brochure.file}` } : {}),
  };
}

export function serializeMessage(message: any, mediaBase = ADMIN_MEDIA_BASE) {
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
    ...(mediaOf(message, mediaBase) || {}),
    ...templateExtras(message),
  };
}

// Reactions arrive as standalone messages pointing at a target id. Fold them onto the message
// they belong to and drop them from the thread, the way WhatsApp itself renders them.
export function buildThread(messages: any[], mediaBase = ADMIN_MEDIA_BASE) {
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
      const serialized = serializeMessage(message, mediaBase);
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

export function previewText(message: any) {
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

