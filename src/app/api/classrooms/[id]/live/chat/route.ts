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
  const { message } = await req.json();
  const scheduledSessionId = getRequestedSessionId(req);
  if (!scheduledSessionId) return NextResponse.json({ error: "Scheduled session required" }, { status: 400 });
  const cleanMessage = typeof message === "string" ? message.trim() : "";
  if (!cleanMessage) return NextResponse.json({ error: "Message required" }, { status: 400 });
  await dbConnect();
  const { classroom, allowed } = await getLiveClassroomForUser(params.id, role, userId);
  if (!classroom) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const doc = await ClassroomChatMessage.create({
    classroom: params.id,
    scheduledSessionId,
    sender: userId,
    message: cleanMessage.slice(0, 1000),
  });
  const populated = await ClassroomChatMessage.findById(doc._id).populate("sender", "name username role").lean();
  return NextResponse.json(populated);
}
