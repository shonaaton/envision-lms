import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { User } from "@/models/User";
import { Batch } from "@/models/Batch";
import { AskCoachConversation, AskCoachMessage } from "@/models/AskCoach";
import { createAskCoachMessage, ensureBatchConversation, ensureDirectConversation, notifyUser } from "@/lib/askCoach";

export const dynamic = "force-dynamic";

function userId(session: any) {
  return (session.user as any).id;
}

async function studentCoach(studentId: string) {
  const batch: any = await Batch.findOne({ students: studentId, coach: { $exists: true, $ne: null }, isActive: true })
    .populate("coach", "name username email")
    .lean();
  return batch?.coach || null;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const role = (session.user as any).role;
  const id = userId(session);
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversation");
  const q = url.searchParams.get("q")?.trim();

  let filter: any = {};
  if (role !== "admin") {
    filter = { participants: id };
  }
  if (conversationId) filter._id = conversationId;

  const conversations = await AskCoachConversation.find(filter)
    .populate("student coach participants", "name username email role")
    .populate("batch", "name")
    .sort({ lastMessageAt: -1 })
    .limit(100)
    .lean();

  const conversationIds = conversations.map((conversation: any) => conversation._id);
  const messageFilter: any = { conversation: { $in: conversationIds } };
  if (q) messageFilter.$text = { $search: q };
  const messages = await AskCoachMessage.find(messageFilter)
    .populate("sender receiver", "name username email role")
    .populate("batch", "name")
    .sort({ createdAt: 1 })
    .limit(500)
    .lean();

  let targets: any = { students: [], coaches: [], batches: [] };
  if (role === "student") {
    const coach = await studentCoach(id);
    const batches = await Batch.find({ students: id, isActive: true }).select("name coach").lean();
    targets = { coach, batches, students: [], coaches: coach ? [coach] : [] };
    if (coach) await ensureDirectConversation(id, coach._id.toString());
    for (const batch of batches as any[]) await ensureBatchConversation(batch._id.toString());
  } else if (role === "instructor") {
    const batches = await Batch.find({ coach: id, isActive: true }).populate("students", "name username email").lean();
    const studentMap = new Map();
    batches.forEach((batch: any) => (batch.students || []).forEach((student: any) => studentMap.set(student._id.toString(), student)));
    targets = { students: Array.from(studentMap.values()), batches, coaches: [] };
  } else {
    targets = {
      students: await User.find({ role: "student", isActive: true }).select("name username email").lean(),
      coaches: await User.find({ role: "instructor", isActive: true }).select("name username email").lean(),
      batches: await Batch.find({ isActive: true }).select("name coach students").lean(),
    };
  }

  return NextResponse.json({ conversations, messages, targets, role });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const role = (session.user as any).role;
  const sender = userId(session);
  const body = await req.json();
  const messageText = String(body.message || "").trim();
  if (!messageText) return NextResponse.json({ error: "Message required" }, { status: 400 });

  let conversation: any;
  let receiver: string | undefined;
  let batchId: string | undefined;
  const requestedConversationId = body.conversationId ? String(body.conversationId) : "";

  if (requestedConversationId) {
    conversation = await AskCoachConversation.findById(requestedConversationId)
      .populate("student coach participants", "name username email role")
      .populate("batch", "name students coach")
      .lean();
    if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    const isParticipant =
      role === "admin" ||
      (conversation.participants || []).some((participant: any) => (participant._id?.toString?.() || participant.toString?.()) === sender);
    if (!isParticipant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (conversation.type === "batch") {
      batchId = conversation.batch?._id?.toString?.() || conversation.batch?.toString?.() || undefined;
    } else {
      const participantIds = (conversation.participants || []).map((participant: any) => participant._id?.toString?.() || participant.toString?.());
      receiver = participantIds.find((id: string) => id && id !== sender);
    }
  } else if (body.batch) {
    batchId = String(body.batch);
    const batch: any = await Batch.findById(batchId).lean();
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    const allowed =
      role === "admin" ||
      (role === "instructor" && batch.coach?.toString() === sender) ||
      (role === "student" && (batch.students || []).some((id: any) => id.toString() === sender));
    if (!allowed || role === "student") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    conversation = await ensureBatchConversation(batchId);
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
      const target: any = await User.findById(receiver).lean();
      if (!target) return NextResponse.json({ error: "Receiver not found" }, { status: 404 });
      if (target.role === "student") {
        const coach = await studentCoach(receiver);
        conversation = await ensureDirectConversation(receiver, coach?._id?.toString?.() || sender);
      } else {
        conversation = await AskCoachConversation.findOneAndUpdate(
          { type: "direct", participants: { $all: [sender, receiver] }, student: { $exists: false } },
          { type: "direct", participants: [sender, receiver], title: "Admin Message" },
          { upsert: true, new: true }
        );
      }
    }
  }

  const created = await createAskCoachMessage({ conversation, sender, receiver, batch: batchId, body: messageText });
  const href = `/ask-coach?conversation=${conversation._id.toString()}`;
  if (receiver) {
    const receiverUser: any = await User.findById(receiver).select("email name").lean();
    await notifyUser(receiver, "New Ask Coach message", "You have received a new message.", {
      conversation: conversation._id,
      message: created._id,
      href,
      email: receiverUser?.email,
      recipientName: receiverUser?.name,
    });
  }
  if (batchId) {
    const batch: any = await Batch.findById(batchId).populate("students", "email name").select("students").lean();
    await Promise.all((batch?.students || [])
      .filter((student: any) => student._id?.toString() !== sender)
      .map((student: any) => notifyUser(student._id, "New batch message", "Your coach sent a new batch message.", {
        conversation: conversation._id,
        message: created._id,
        href,
        email: student?.email,
        recipientName: student?.name,
      })));
  }
  return NextResponse.json(created);
}
