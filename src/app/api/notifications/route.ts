import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Notification } from "@/models/Fee";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const userId = (session.user as any).id;
  const notifications = await Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(25).lean();
  const unreadCount = await Notification.countDocuments({ user: userId, readAt: { $exists: false } });
  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  await Notification.updateMany({ user: (session.user as any).id, readAt: { $exists: false } }, { readAt: new Date() });
  return NextResponse.json({ ok: true });
}
