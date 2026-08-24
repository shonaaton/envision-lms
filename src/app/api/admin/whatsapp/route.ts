import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { WhatsAppMessage } from "@/models/WhatsApp";

export const dynamic = "force-dynamic";

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function canManageWhatsApp(session: any) {
  return ["admin", "sub-admin"].includes(String(session?.user?.role || ""));
}

function serializeMessage(message: any) {
  return {
    id: message._id.toString(),
    phoneNumber: message.phoneNumber,
    direction: message.direction,
    text: message.text,
    messageType: message.messageType,
    templateName: message.templateName,
    status: message.status,
    metaMessageId: message.metaMessageId,
    createdAt: message.createdAt,
    sentAt: message.sentAt,
    receivedAt: message.receivedAt,
  };
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
      lastMessageAt: null,
      lastMessageText: "",
      sentTemplateCount: 0,
    };
    current.messages.push(serializeMessage(message));
    current.lastMessageAt = message.createdAt;
    current.lastMessageText = message.text || message.templateName || "";
    if (message.direction === "inbound") current.lastInboundAt = message.receivedAt || message.createdAt;
    if (message.direction === "outbound" && message.messageType === "template") current.sentTemplateCount += 1;
    conversations.set(phoneNumber, current);
  }

  const now = Date.now();
  const data = Array.from(conversations.values())
    .map((conversation) => {
      const lastInboundTime = conversation.lastInboundAt ? new Date(conversation.lastInboundAt).getTime() : 0;
      const activeUntil = lastInboundTime ? new Date(lastInboundTime + CUSTOMER_SERVICE_WINDOW_MS) : null;
      const canReply = Boolean(activeUntil && activeUntil.getTime() > now);
      return { ...conversation, activeUntil, canReply };
    })
    .sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());

  return NextResponse.json({
    conversations: data,
    active: data.filter((conversation) => conversation.canReply),
    sentTemplates: data.filter((conversation) => conversation.sentTemplateCount > 0),
    windowHours: 24,
  });
}
