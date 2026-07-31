import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { sendEmailAutomation } from "@/lib/emailAutomation";
import { requireAdminApiAccess } from "@/lib/adminApiAccess";
import { Announcement } from "@/models/Announcement";
import { Batch } from "@/models/Batch";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

const targetLabels: Record<string, string> = {
  batch: "Batch",
  all_students: "All students",
  student: "Student",
  all_coaches: "All coaches",
  coach: "Coach",
};

function uniqueIds(ids: any[]) {
  return Array.from(new Set(ids.filter(Boolean).map((id) => id.toString())));
}

function formatEditedAt(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

async function resolveRecipients(targetType: string, targetId?: string) {
  if (targetType === "all_students") {
    const users = await User.find({ role: "student", isActive: { $ne: false } }, { _id: 1, email: 1, name: 1 }).lean();
    return { recipients: uniqueIds(users.map((user: any) => user._id)), recipientUsers: users, targetBatch: undefined, targetUser: undefined };
  }

  if (targetType === "all_coaches") {
    const users = await User.find({ role: "instructor", isActive: { $ne: false } }, { _id: 1, email: 1, name: 1 }).lean();
    return { recipients: uniqueIds(users.map((user: any) => user._id)), recipientUsers: users, targetBatch: undefined, targetUser: undefined };
  }

  if (targetType === "batch") {
    if (!targetId) throw new Error("Please select a batch.");
    const batch: any = await Batch.findById(targetId).populate("students", "email name").lean();
    if (!batch) throw new Error("Batch not found.");
    return {
      recipients: uniqueIds((batch.students || []).map((student: any) => student._id)),
      recipientUsers: (batch.students || []).map((student: any) => ({ _id: student._id, email: student.email, name: student.name })),
      targetBatch: batch._id,
      targetUser: undefined,
    };
  }

  if (targetType === "student" || targetType === "coach") {
    if (!targetId) throw new Error(`Please select a ${targetType}.`);
    const role = targetType === "student" ? "student" : "instructor";
    const user: any = await User.findOne({ _id: targetId, role, isActive: { $ne: false } }, { _id: 1, email: 1, name: 1 }).lean();
    if (!user) throw new Error(`${targetLabels[targetType]} not found.`);
    return { recipients: [user._id.toString()], recipientUsers: [user], targetBatch: undefined, targetUser: user._id };
  }

  throw new Error("Please select a valid audience.");
}

export async function GET(req: Request) {
  const session = await requireAdminApiAccess(req, "view");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const list = await Announcement.find({})
    .populate("createdBy", "name email")
    .populate("editedBy", "name email")
    .populate("targetBatch", "name")
    .populate("targetUser", "name email role")
    .sort({ sentAt: -1 })
    .limit(100)
    .lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await requireAdminApiAccess(req, "create");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;

  const body = await req.json();
  const title = String(body.title || "").trim();
  const message = String(body.message || "").trim();
  const targetType = String(body.targetType || "");
  const targetId = body.targetId ? String(body.targetId) : undefined;
  const priority = body.priority === "high" ? "high" : "normal";

  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });

  try {
    await dbConnect();
    const resolved = await resolveRecipients(targetType, targetId);
    if (!resolved.recipients.length) return NextResponse.json({ error: "No active recipients were found for this audience." }, { status: 400 });

    const announcement = await Announcement.create({
      title,
      message,
      priority,
      targetType,
      targetBatch: resolved.targetBatch,
      targetUser: resolved.targetUser,
      recipients: resolved.recipients,
      recipientCount: resolved.recipients.length,
      createdBy: actorId,
      sentAt: new Date(),
    });

    await Notification.insertMany(
      resolved.recipients.map((user) => ({
        user,
        type: "announcement",
        title,
        message,
        metadata: { announcement: announcement._id, targetType, priority },
      }))
    );

    await Promise.all(
      (resolved.recipientUsers || [])
        .filter((user: any) => user?.email)
        .map((user: any) =>
          sendEmailAutomation({
            to: String(user.email),
            subject: title,
            message,
            metadata: {
              kind: "announcement",
              priority,
              recipientName: user.name,
              announcementId: announcement._id.toString(),
            },
          })
        )
    );

    await recordActivity({
      actor: actorId,
      type: "announcement.sent",
      label: `Sent announcement "${title}" to ${targetLabels[targetType] || "audience"}`,
      entityType: "Announcement",
      entityId: announcement._id.toString(),
      metadata: { targetType, recipientCount: resolved.recipients.length, priority },
    });

    const populated = await Announcement.findById(announcement._id)
      .populate("createdBy", "name email")
      .populate("editedBy", "name email")
      .populate("targetBatch", "name")
      .populate("targetUser", "name email role")
      .lean();

    return NextResponse.json(populated);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not send announcement." }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const session = await requireAdminApiAccess(req, "edit");
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as any).id;

  const body = await req.json();
  const id = String(body.id || "");
  const title = String(body.title || "").trim();
  const message = String(body.message || "").trim();
  const priority = body.priority === "high" ? "high" : "normal";

  if (!id) return NextResponse.json({ error: "Announcement is required." }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });

  try {
    await dbConnect();
    const announcement: any = await Announcement.findById(id);
    if (!announcement) return NextResponse.json({ error: "Announcement not found." }, { status: 404 });

    const editedAt = new Date();
    const previousTitle = announcement.title;
    const previousMessage = announcement.message;
    const previousPriority = announcement.priority;

    announcement.title = title;
    announcement.message = message;
    announcement.priority = priority;
    announcement.editedAt = editedAt;
    announcement.editedBy = actorId;
    announcement.editCount = Number(announcement.editCount || 0) + 1;
    announcement.editHistory = [
      ...(announcement.editHistory || []),
      { editedAt, editedBy: actorId, previousTitle, previousMessage, previousPriority },
    ];
    await announcement.save();

    const editedStamp = formatEditedAt(editedAt);
    await Notification.updateMany(
      { type: "announcement", "metadata.announcement": announcement._id },
      {
        $set: {
          title: `${title} (edited)`,
          message: `${message}\n\nEdited on ${editedStamp}`,
          metadata: {
            announcement: announcement._id,
            targetType: announcement.targetType,
            priority,
            editedAt: editedAt.toISOString(),
            editCount: announcement.editCount,
          },
        },
        $unset: { readAt: "" },
      }
    );

    await recordActivity({
      actor: actorId,
      type: "announcement.edited",
      label: `Edited announcement "${title}"`,
      entityType: "Announcement",
      entityId: announcement._id.toString(),
      metadata: { targetType: announcement.targetType, recipientCount: announcement.recipientCount, priority, editedAt },
    });

    const populated = await Announcement.findById(announcement._id)
      .populate("createdBy", "name email")
      .populate("editedBy", "name email")
      .populate("targetBatch", "name")
      .populate("targetUser", "name email role")
      .lean();

    return NextResponse.json(populated);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not update announcement." }, { status: 400 });
  }
}
