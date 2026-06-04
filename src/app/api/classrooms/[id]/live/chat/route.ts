import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { ClassroomChatMessage } from "@/models/ClassroomLive";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { message } = await req.json();
  const cleanMessage = typeof message === "string" ? message.trim() : "";
  if (!cleanMessage) return NextResponse.json({ error: "Message required" }, { status: 400 });
  await dbConnect();
  const doc = await ClassroomChatMessage.create({
    classroom: params.id,
    sender: (session.user as any).id,
    message: cleanMessage.slice(0, 1000),
  });
  const populated = await ClassroomChatMessage.findById(doc._id).populate("sender", "name username role").lean();
  return NextResponse.json(populated);
}
