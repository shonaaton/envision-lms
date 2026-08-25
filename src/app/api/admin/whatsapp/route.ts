import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { renderWhatsAppTemplatePreview } from "@/lib/whatsappTemplateRegistry";
import { WhatsAppMessage } from "@/models/WhatsApp";

export const dynamic = "force-dynamic";

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function canManageWhatsApp(session: any) {
  return ["admin", "sub-admin"].includes(String(session?.user?.role || ""));
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
  };
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

export async function GET() {
  const session = await auth();
  if (!canManageWhatsApp(session)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const messages: any[] = await WhatsAppMessage.find({})
    .populate("matchedUser", "name email username phone role")
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const conversations = new Map<string, any>();
  for (const message of [...messages].reverse()) {
    const phoneNumber = String(message.phoneNumber || "");
    const current = conversations.get(phoneNumber) || {
      phoneNumber,
      chatPath: chatPath(phoneNumber),
      contactName: message.matchedUser?.name || message.contactName || message.profileName || "Unknown contact",
      profileName: message.profileName || "",
      matchedUser: message.matchedUser
        ? {
            id: message.matchedUser._id.toString(),
            name: message.matchedUser.name,
            email: message.matchedUser.email,
            username: message.matchedUser.username,
            phone: message.matchedUser.phone,
            role: message.matchedUser.role,
          }
        : null,
      messages: [],
      lastInboundAt: null,
      lastBusinessMessageAt: null,
      lastMessageAt: null,
      lastMessageDirection: null,
      lastMessageText: "",
      sentTemplateCount: 0,
    };
    const serialized = serializeMessage(message);
    current.messages.push(serialized);
    current.lastMessageAt = message.createdAt;
    current.lastMessageDirection = message.direction;
    current.lastMessageText = serialized.text || message.templateName || "";
    if (message.direction === "inbound") current.lastInboundAt = message.receivedAt || message.createdAt;
    if (message.direction === "outbound") current.lastBusinessMessageAt = message.sentAt || message.createdAt;
    if (message.direction === "outbound" && message.messageType === "template") current.sentTemplateCount += 1;
    conversations.set(phoneNumber, current);
  }

  const data = Array.from(conversations.values())
    .map((conversation) => {
      const whatsapp = windowState(conversation.lastInboundAt);
      return { ...conversation, activeUntil: whatsapp.window_expires_at, canReply: whatsapp.free_form_allowed, whatsapp };
    })
    .sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());

  return NextResponse.json({
    conversations: data,
    active: data.filter((conversation) => conversation.canReply),
    sentTemplates: data.filter((conversation) => conversation.sentTemplateCount > 0),
    windowHours: 24,
  });
}
