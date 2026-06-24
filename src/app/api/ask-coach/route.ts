import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { Batch } from "@/models/Batch";
import { AskCoachConversation, AskCoachMessage } from "@/models/AskCoach";
import { createAskCoachMessage, ensureBatchConversation, ensureDirectConversation, notifyUser } from "@/lib/askCoach";

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
  const role = userRole(session as AuthSession);
  const id = userId(session);
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversation");
  const q = url.searchParams.get("q")?.trim();

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
  if (conversationId) filter._id = conversationId;

  const conversations = await AskCoachConversation.find(filter)
    .populate("student coach participants", "name username email role")
    .populate("batch", "name")
    .sort({ lastMessageAt: -1 })
    .limit(50)
    .lean();

  const activeConversationId = conversationId || conversations[0]?._id?.toString?.() || "";
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

  return NextResponse.json({ conversations, messages, targets, role });
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
  if (receiver && !created.flagged) {
    const receiverUser = await User.findById(receiver).select("email name").lean<{ email?: string; name?: string } | null>();
    await notifyUser(receiver, "New Ask Coach message", "You have received a new message.", {
      conversation: conversation._id,
      message: created._id,
      href,
      email: receiverUser?.email,
      recipientName: receiverUser?.name,
    });
  }
  if (batchId && !created.flagged) {
    const batch = await Batch.findById(batchId).populate("students", "email name").select("students").lean<{ students?: PopulatedUserRef[] } | null>();
    await Promise.all((batch?.students || [])
      .filter((student) => student._id?.toString() !== sender)
      .map((student) => notifyUser(student._id, "New batch message", "Your coach sent a new batch message.", {
        conversation: conversation._id,
        message: created._id,
        href,
        email: student?.email,
        recipientName: student?.name,
      })));
  }
  return NextResponse.json(created);
}
