import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { ClassroomChatMessage } from "@/models/ClassroomLive";
import { getRequestedSessionId } from "@/lib/classroomLiveSession";
import { getLiveClassroomForUser, type AppRole } from "@/lib/liveClassroomAccess";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: AppRole }).role;
  const userId = (session.user as { id?: string }).id || "";
  if (!role || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { message, recipient } = await req.json();
  const scheduledSessionId = getRequestedSessionId(req);
  if (!scheduledSessionId) return NextResponse.json({ error: "Scheduled session required" }, { status: 400 });
  const cleanMessage = typeof message === "string" ? message.trim() : "";
  if (!cleanMessage) return NextResponse.json({ error: "Message required" }, { status: 400 });
  await dbConnect();
  const { classroom, allowed } = await getLiveClassroomForUser(params.id, role, userId, scheduledSessionId);
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const recipientId = typeof recipient === "string" && recipient !== "group" ? recipient.trim() : "";
  const classroomDoc = classroom as Record<string, any>;
  const canSendPrivate = role === "admin" || role === "instructor";
  if (recipientId && !canSendPrivate) return NextResponse.json({ error: "Only coaches can send private classroom messages" }, { status: 403 });
  if (recipientId) {
    const studentIds = (classroomDoc.students || []).map((student: any) => String(student?._id || student));
    if (!studentIds.includes(recipientId)) return NextResponse.json({ error: "Recipient is not in this classroom" }, { status: 400 });
  }
  const doc = await ClassroomChatMessage.create({
    classroom: params.id,
    scheduledSessionId,
    sender: userId,
    ...(recipientId ? { recipient: recipientId } : {}),
    message: cleanMessage.slice(0, 1000),
  });
  const populated = await ClassroomChatMessage.findById(doc._id).populate("sender recipient", "name username role").lean();
  return NextResponse.json(populated);
}
