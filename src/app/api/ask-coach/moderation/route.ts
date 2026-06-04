import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { AskCoachMessage } from "@/models/AskCoach";
import { notifyUser } from "@/lib/askCoach";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const adminId = (session.user as any).id;
  await dbConnect();
  const { messageId, action, note } = await req.json();
  const message: any = await AskCoachMessage.findById(messageId);
  if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });

  const update: any = {
    $push: {
      moderationHistory: {
        action,
        by: adminId,
        note,
        at: new Date(),
      },
    },
  };
  if (action === "approve") update.$set = { status: "sent", moderationStatus: "approved", flagged: false };
  if (action === "hide") update.$set = { status: "hidden", moderationStatus: "hidden" };
  if (action === "delete") update.$set = { status: "deleted", moderationStatus: "deleted", body: "[Deleted by admin]" };
  if (action === "review") update.$set = { moderationStatus: "reviewed" };
  if (action === "warn") {
    update.$set = { moderationStatus: "reviewed" };
    await notifyUser(message.sender, "Admin warning", note || "Please avoid sharing restricted or inappropriate content.", { message: message._id });
  }

  const updated = await AskCoachMessage.findByIdAndUpdate(message._id, update, { new: true })
    .populate("sender receiver", "name username email role")
    .populate("batch", "name")
    .lean();
  return NextResponse.json(updated);
}
