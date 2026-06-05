import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { buildGeneratedSessions } from "@/lib/classroomSchedule";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const doc = await Classroom.findById(params.id)
    .populate("instructor coach", "name email username")
    .populate("students", "name email username isActive")
    .populate("batches", "name")
    .populate("course", "name category level")
    .lean();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "instructor" && role !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const body = await req.json();
  const existing: any = await Classroom.findById(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "cancel_class") {
    existing.status = "cancelled";
  } else if (body.action === "reschedule_class") {
    existing.classDate = body.classDate ? new Date(body.classDate) : existing.classDate;
    existing.startTime = body.startTime || existing.startTime;
    existing.durationMinutes = Math.max(15, Number(body.durationMinutes || existing.durationMinutes || 60));
    if (Array.isArray(existing.generatedSessions) && existing.generatedSessions[0]) {
      existing.generatedSessions[0].originalDate = existing.generatedSessions[0].scheduledFor;
      existing.generatedSessions[0].scheduledFor = body.classDate ? new Date(body.classDate) : existing.generatedSessions[0].scheduledFor;
      existing.generatedSessions[0].startTime = body.startTime || existing.generatedSessions[0].startTime;
      existing.generatedSessions[0].durationMinutes = Math.max(15, Number(body.durationMinutes || existing.generatedSessions[0].durationMinutes || 60));
      existing.generatedSessions[0].status = "rescheduled";
    }
  } else if (body.action === "substitute_coach") {
    if (body.scope === "session" && body.sessionId) {
      const target = existing.generatedSessions?.id?.(body.sessionId);
      if (target) target.substituteCoach = body.coach;
    } else {
      existing.coach = body.coach || existing.coach;
      existing.instructor = body.coach || existing.instructor;
      if (body.scope === "future" && Array.isArray(existing.generatedSessions)) {
        existing.generatedSessions.forEach((item: any) => {
          if (item.status === "scheduled") item.substituteCoach = body.coach;
        });
      }
    }
  } else if (body.action === "add_extra_class") {
    const nextNumber = (existing.generatedSessions?.length || 0) + 1;
    existing.generatedSessions = [
      ...(existing.generatedSessions || []),
      {
        sessionNumber: nextNumber,
        topicName: String(body.topicName || "Extra Class"),
        scheduledFor: new Date(body.classDate),
        startTime: String(body.startTime || existing.startTime || "16:00"),
        durationMinutes: Math.max(15, Number(body.durationMinutes || existing.durationMinutes || 60)),
        status: "scheduled",
        isExtra: true,
      },
    ];
  } else if (body.action === "delete_series") {
    await Classroom.findByIdAndDelete(params.id);
    return NextResponse.json({ ok: true });
  } else {
    const nextDays = Array.isArray(body.daysOfWeek) ? body.daysOfWeek : existing.daysOfWeek || [];
    const nextType = body.classroomType || existing.classroomType || "single";
    existing.set({
      ...body,
      classDate: body.classDate ? new Date(body.classDate) : existing.classDate,
      startDate: body.startDate ? new Date(body.startDate) : existing.startDate,
      endDate: body.endDate ? new Date(body.endDate) : existing.endDate,
      durationMinutes: Math.max(15, Number(body.durationMinutes || existing.durationMinutes || 60)),
    });
    existing.generatedSessions = buildGeneratedSessions({
      classroomType: nextType,
      title: existing.title,
      topicName: existing.topicName || existing.title,
      topicOrder: existing.topicOrder || 0,
      classDate: existing.classDate,
      startTime: existing.startTime,
      durationMinutes: existing.durationMinutes,
      startDate: existing.startDate,
      endDate: existing.endDate,
      frequency: existing.frequency || "weekly",
      daysOfWeek: nextDays,
      endCondition: existing.endCondition || "on_date",
      endAfterSessions: existing.endAfterSessions,
      sessionPlan: existing.sessionPlan || [],
    });
  }

  await existing.save();
  const updated = await Classroom.findById(params.id);
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  await Classroom.findByIdAndDelete(params.id);
  return NextResponse.json({ ok: true });
}
