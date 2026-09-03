import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { sendManualHomeworkReminder } from "@/lib/homeworkEmailReminders";
import { Homework } from "@/models/Homework";
import { recordActivity } from "@/lib/activity";
import { canAccessFeature } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const canSendReminder = role === "instructor" || (session ? (
    await canAccessFeature("homework", session.user as any, "assign") ||
    await canAccessFeature("homework", session.user as any, "edit")
  ) : false);
  if (!session || !canSendReminder) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await dbConnect();
  const homework: any = await Homework.findById(params.id).select("instructor title").lean();
  if (!homework) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (role === "instructor" && homework.instructor?.toString?.() !== (session.user as any).id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await sendManualHomeworkReminder(params.id, req);
  await recordActivity({
    actor: (session.user as any).id,
    type: "homework.reminder_sent",
    label: `Sent homework reminder for ${homework.title || "homework"}`,
    entityType: "Homework",
    entityId: params.id,
    metadata: { ...result, source: "manual_coach_admin" },
  });
  return NextResponse.json({ ok: true, ...result });
}
