import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { WhatsAppMessage } from "@/models/WhatsApp";
import { Types } from "mongoose";
import { WhatsAppConversation, WhatsAppReadState } from "@/models/WhatsAppConversation";
import { isWhatsAppResolved, needsWhatsAppReply, syncWhatsAppConversations } from "@/lib/whatsappInbox";
import "@/models/User";
import { canAccessFeature } from "@/lib/featureAccess";
import { MESSAGE_FIELDS, buildThread, previewText } from "@/lib/whatsappMessageView";
import { whatsappSession, whatsappConversationScope, canAccessWhatsAppPhone, withoutBranchChats } from "@/lib/whatsappAccess";

export const dynamic = "force-dynamic";

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const THREAD_MESSAGE_LIMIT = 50;

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
  const conversations = (await withoutBranchChats(summaries)).map((summary) => {
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
