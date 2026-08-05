import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { Batch } from "@/models/Batch";
import { AskCoachConversation, AskCoachMessage } from "@/models/AskCoach";
import { Notification } from "@/models/Fee";
import { createAskCoachMessage, ensureBatchConversation, ensureDirectConversation, notifyUser } from "@/lib/askCoach";
import {
  cancelAskCoachUnreadEmails,
  processDueAskCoachEmailReminders,
  queueAskCoachUnreadEmail,
} from "@/lib/askCoachEmailReminders";

export const dynamic = "force-dynamic";

type SessionUser = {
  id: string;
  role: "student" | "instructor" | "admin";
};

type AuthSession = {
  user: SessionUser;
};

type PopulatedUserRef = {
  _id: { toString(): string };
  name?: string;
  username?: string;
  email?: string;
  role?: "student" | "instructor" | "admin";
};

type PopulatedBatchRef = {
  _id: { toString(): string };
  name?: string;
  coach?: { toString(): string } | PopulatedUserRef | null;
  students?: Array<{ toString(): string } | PopulatedUserRef>;
};

type ConversationRecord = {
  _id: { toString(): string };
  type: "direct" | "batch";
  participants?: Array<{ toString(): string } | PopulatedUserRef>;
  batch?: string | PopulatedBatchRef | null;
  coach?: string | PopulatedUserRef | null;
  title?: string;
};

function readUserIds(message: any) {
  return new Set(
    (message.readBy || [])
      .map((entry: any) => toId(entry.user))
      .filter(Boolean)
  );
}

function messageDeliveryStatus(message: any, conversation: any, currentUserId: string) {
  if (toId(message.sender) !== currentUserId) return undefined;
  if (message.status !== "sent") return "sent";

  const senderId = toId(message.sender);
  const recipients = (conversation?.participants || [])
    .map((participant: any) => toId(participant))
    .filter((participantId: string) => participantId && participantId !== senderId);
  if (!recipients.length) return "sent";

  const readers = readUserIds(message);
  return recipients.every((participantId: string) => readers.has(participantId)) ? "seen" : "delivered";
}

function userId(session: AuthSession) {
  return session.user.id;
}

function userRole(session: AuthSession) {
  return session.user.role;
}

function toId(value: unknown) {
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? value : "";
  }
  const candidate = value as { _id?: { toString?: () => string }; toString?: () => string };
  return candidate._id?.toString?.() || candidate.toString?.() || "";
}

async function studentCoach(studentId: string) {
  const batch = await Batch.findOne({ students: studentId, coach: { $exists: true, $ne: null }, isActive: true })
    .populate("coach", "name username email")
    .lean<{ coach?: PopulatedUserRef | null } | null>();
  return batch?.coach || null;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  void processDueAskCoachEmailReminders().catch((error) => {
    console.error("Ask Coach unread email processing failed", error);
  });
  const role = userRole(session as AuthSession);
  const id = userId(session);
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversation");
  const q = url.searchParams.get("q")?.trim();
  if (url.searchParams.get("summary") === "1") {
    const summaryFilter: Record<string, unknown> = role !== "admin" ? { participants: id } : {};
    const conversationIds = await AskCoachConversation.find(summaryFilter).distinct("_id");
    const unreadCount = conversationIds.length
      ? await AskCoachMessage.countDocuments({
        conversation: { $in: conversationIds },
        sender: { $ne: id },
        status: "sent",
        readBy: { $not: { $elemMatch: { user: id } } },
      })
      : 0;
    return NextResponse.json({ unreadCount });
  }

  let targets: { students: unknown[]; coaches: unknown[]; batches: unknown[]; coach?: PopulatedUserRef | null } = { students: [], coaches: [], batches: [] };
  if (role === "student") {
    const coach = await studentCoach(id);
    const batches = await Batch.find({ students: id, isActive: true }).select("name coach").lean();
    targets = { coach, batches, students: [], coaches: coach ? [coach] : [] };
    if (coach) await ensureDirectConversation(id, coach._id.toString());
    for (const batch of batches) await ensureBatchConversation(toId(batch));
  } else if (role === "instructor") {
    const batches = await Batch.find({ coach: id, isActive: true }).populate("students", "name username email").lean();
    const studentMap = new Map<string, PopulatedUserRef>();
    batches.forEach((batch) => ((batch as { students?: PopulatedUserRef[] }).students || []).forEach((student) => studentMap.set(student._id.toString(), student)));
    targets = { students: Array.from(studentMap.values()), batches, coaches: [] };
  } else {
    targets = {
      students: await User.find({ role: "student", isActive: true }).select("name username email").lean(),
      coaches: await User.find({ role: "instructor", isActive: true }).select("name username email").lean(),
      batches: await Batch.find({ isActive: true }).select("name coach students").lean(),
    };
  }

  const filter: Record<string, unknown> = role !== "admin" ? { participants: id } : {};

  let conversations: any[] = await AskCoachConversation.find(filter)
    .populate("student coach participants", "name username email role")
    .populate("batch", "name")
    .sort({ lastMessageAt: -1 })
    .limit(50)
    .lean();

  if (conversationId && !conversations.some((conversation) => conversation._id?.toString?.() === conversationId)) {
    const requestedConversation = await AskCoachConversation.findById(conversationId)
      .populate("student coach participants", "name username email role")
      .populate("batch", "name")
      .lean() as any;
    const canAccess =
      requestedConversation &&
      (role === "admin" || (requestedConversation.participants || []).some((participant: any) => toId(participant) === id));
    if (canAccess) conversations = [requestedConversation, ...conversations];
  }

  const activeConversationId =
    (conversationId && conversations.some((conversation) => conversation._id?.toString?.() === conversationId) ? conversationId : "") ||
    conversations[0]?._id?.toString?.() ||
    "";
  const conversationIds = conversations.map((conversation) => conversation._id);
  const messageFilter: Record<string, unknown> = q
    ? { conversation: { $in: conversationIds }, $text: { $search: q } }
    : activeConversationId
      ? { conversation: activeConversationId }
      : { conversation: { $in: [] } };
  if (role !== "admin") messageFilter.status = "sent";
  const messages = await AskCoachMessage.find(messageFilter)
    .populate("sender receiver", "name username email role")
    .populate("batch", "name")
    .sort({ createdAt: 1 })
    .limit(q ? 100 : 150)
    .lean();

  const unreadCounts = await Promise.all(
    conversations.map(async (conversation) => {
      const unreadCount = await AskCoachMessage.countDocuments({
        conversation: conversation._id,
        sender: { $ne: id },
        status: "sent",
        readBy: { $not: { $elemMatch: { user: id } } },
      });
      return [conversation._id.toString(), unreadCount] as const;
    })
  );
  const unreadByConversation = new Map(unreadCounts);
  const conversationsById = new Map(conversations.map((conversation) => [conversation._id.toString(), conversation]));

  const conversationsWithStatus = conversations.map((conversation) => {
    const unreadCount = unreadByConversation.get(conversation._id.toString()) || 0;
    return {
      ...conversation,
      unreadCount,
      currentStatus: unreadCount > 0 ? `${unreadCount} unread` : "Up to date",
    };
  });

  const messagesWithStatus = messages.map((message: any) => {
    const conversationKey = toId(message.conversation);
    const conversation = conversationsById.get(conversationKey);
    const readers = readUserIds(message);
    const senderId = toId(message.sender);
    const recipientCount = (conversation?.participants || []).filter((participant: any) => {
      const participantId = toId(participant);
      return participantId && participantId !== senderId;
    }).length;
    return {
      ...message,
      deliveryStatus: messageDeliveryStatus(message, conversation, id),
      readByCount: readers.size,
      recipientCount,
    };
  });

  return NextResponse.json({
    conversations: conversationsWithStatus,
    messages: messagesWithStatus,
    targets,
    role,
    currentUser: { id, role },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const role = userRole(session as AuthSession);
  const sender = userId(session);
  const body = await req.json();
  const messageText = String(body.message || "").trim();
  if (!messageText) return NextResponse.json({ error: "Message required" }, { status: 400 });

  let conversation: ConversationRecord | null = null;
  let receiver: string | undefined;
  let batchId: string | undefined;
  const requestedConversationId = body.conversationId ? String(body.conversationId) : "";

  if (requestedConversationId) {
    conversation = await AskCoachConversation.findById(requestedConversationId)
      .populate("student coach participants", "name username email role")
      .populate("batch", "name students coach")
      .lean<ConversationRecord | null>();
    if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    const isParticipant =
      role === "admin" ||
      (conversation.participants || []).some((participant) => toId(participant) === sender);
    if (!isParticipant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (conversation.type === "batch") {
      batchId = toId(conversation.batch) || undefined;
    } else {
      const participantIds = (conversation.participants || []).map((participant) => toId(participant));
      receiver = participantIds.find((id: string) => id && id !== sender);
    }
  } else if (body.batch) {
    batchId = String(body.batch);
    const batch = await Batch.findById(batchId).lean<{ coach?: { toString(): string } | null; students?: Array<{ toString(): string }> } | null>();
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    const allowed =
      role === "admin" ||
      (role === "instructor" && batch.coach?.toString() === sender) ||
      (role === "student" && (batch.students || []).some((id) => id.toString() === sender));
    if (!allowed || role === "student") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    conversation = (await ensureBatchConversation(batchId)).toObject() as ConversationRecord;
  } else {
    if (role === "student") {
      const coach = await studentCoach(sender);
      if (!coach) return NextResponse.json({ error: "No assigned coach found" }, { status: 400 });
      const coachId = coach._id.toString();
      receiver = coachId;
      conversation = await ensureDirectConversation(sender, coachId);
    } else if (role === "instructor") {
      receiver = String(body.receiver || "");
      const batch = await Batch.findOne({ coach: sender, students: receiver }).lean();
      if (!batch) return NextResponse.json({ error: "Student is not assigned to this coach" }, { status: 403 });
      conversation = await ensureDirectConversation(receiver, sender);
    } else {
      receiver = String(body.receiver || "");
      const target = await User.findById(receiver).lean<{ role?: "student" | "instructor" | "admin" } | null>();
      if (!target) return NextResponse.json({ error: "Receiver not found" }, { status: 404 });
      if (target.role === "student") {
        const coach = await studentCoach(receiver);
        conversation = (await ensureDirectConversation(receiver, coach?._id?.toString?.() || sender)).toObject() as ConversationRecord;
      } else {
        conversation = await AskCoachConversation.findOneAndUpdate(
          { type: "direct", participants: { $all: [sender, receiver] }, student: { $exists: false } },
          { type: "direct", participants: [sender, receiver], title: "Admin Message" },
          { upsert: true, new: true, lean: true }
        ) as ConversationRecord | null;
      }
    }
  }

  if (!conversation) {
    return NextResponse.json({ error: "Conversation could not be created" }, { status: 500 });
  }

  const created = await createAskCoachMessage({ conversation, sender, receiver, batch: batchId, body: messageText });
  const href = `/ask-coach?conversation=${conversation._id.toString()}`;
  const senderUser = !created.flagged
    ? await User.findById(sender).select("_id email name username role").lean<PopulatedUserRef | null>()
    : null;
  if (receiver && !created.flagged) {
    const receiverUser = await User.findById(receiver).select("_id email name username role").lean<PopulatedUserRef | null>();
    await notifyUser(receiver, "New Ask Coach message", "You have received a new message.", {
      conversation: conversation._id,
      message: created._id,
      href,
    }, { sendEmail: false });
    if (senderUser && receiverUser) {
      await queueAskCoachUnreadEmail({
        messageId: created._id,
        conversationId: conversation._id,
        messageBody: messageText,
        href,
        sender: senderUser,
        recipient: receiverUser,
      });
    }
  }
  if (batchId && !created.flagged) {
    const batch = await Batch.findById(batchId).populate("students", "email name username role").select("students").lean<{ students?: PopulatedUserRef[] } | null>();
    await Promise.all((batch?.students || [])
      .filter((student) => student._id?.toString() !== sender)
      .map(async (student) => {
        await notifyUser(student._id, "New batch message", "Your coach sent a new batch message.", {
          conversation: conversation._id,
          message: created._id,
          href,
        }, { sendEmail: false });
        if (senderUser) {
          await queueAskCoachUnreadEmail({
            messageId: created._id,
            conversationId: conversation._id,
            messageBody: messageText,
            href,
            sender: senderUser,
            recipient: student,
          });
        }
      }));
  }
  return NextResponse.json(created);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const role = userRole(session as AuthSession);
  const id = userId(session as AuthSession);
  const body = await req.json().catch(() => ({}));
  const conversationId = String(body.conversationId || "");
  if (!conversationId) return NextResponse.json({ error: "Conversation required" }, { status: 400 });

  const conversation = await AskCoachConversation.findById(conversationId).select("participants").lean() as any;
  const canAccess =
    conversation &&
    (role === "admin" || (conversation.participants || []).some((participant: any) => toId(participant) === id));
  if (!canAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const readAt = new Date();
  await AskCoachMessage.updateMany(
    {
      conversation: conversationId,
      sender: { $ne: id },
      status: "sent",
      readBy: { $not: { $elemMatch: { user: id } } },
    },
    { $push: { readBy: { user: id, readAt } } }
  );
  await Notification.updateMany(
    {
      user: id,
      readAt: { $exists: false },
      type: { $in: ["ask_coach", "ask_coach_admin"] },
      $or: [{ "metadata.conversation": conversationId }, { "metadata.conversation": conversation._id }],
    },
    { readAt }
  );
  await cancelAskCoachUnreadEmails(conversation._id, id);

  return NextResponse.json({ ok: true, readAt });
}
