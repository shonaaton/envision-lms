import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { Attendance } from "@/models/Attendance";
import { ClassroomChatMessage, ClassroomSession, LiveQuestion, LiveQuestionResponse } from "@/models/ClassroomLive";
import { buildGeneratedSessions } from "@/lib/classroomSchedule";
import { deleteClassroomSessionInstances, syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

async function deleteClassroomRecords(classroomId: string) {
  const questions = await LiveQuestion.find({ classroom: classroomId }).select("_id").lean();
  const questionIds = questions.map((question: any) => question._id);
  await Promise.all([
    Attendance.deleteMany({ classroom: classroomId }),
    ClassroomSession.deleteMany({ classroom: classroomId }),
    ClassroomChatMessage.deleteMany({ classroom: classroomId }),
    questionIds.length ? LiveQuestionResponse.deleteMany({ question: { $in: questionIds } }) : Promise.resolve(),
    LiveQuestion.deleteMany({ classroom: classroomId }),
  ]);
}

function recordId(value: any) {
  return String(value?._id || value || "");
}

async function canAccessRecord(doc: any, user: any) {
  const role = user?.role;
  const userId = String(user?.id || "");
  if (doc?.isTestClassroom) {
    return role === "admin" && recordId(doc.testOwner) === userId && isSuperAdminSession(user);
  }
  if (role === "admin" || role === "sub-admin") return true;
  if (role === "instructor") return [doc?.coach, doc?.instructor].some((value) => recordId(value) === userId);
  return (doc?.students || []).some((value: any) => recordId(value) === userId);
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessFeature("classrooms", session.user as any, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbConnect();
  const doc = await Classroom.findById(params.id)
    .populate("instructor coach", "name email username")
    .populate("students", "name email username isActive")
    .populate("batches", "name")
    .populate("course", "name category level")
    .lean();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessRecord(doc, session.user as any))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(doc);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const permission = body.action === "cancel_class" || body.action === "delete_series"
    ? "cancel"
    : body.action === "substitute_coach"
      ? "assign"
      : body.action === "add_extra_class"
        ? "create"
        : "edit";
  if (!(await canAccessFeature("classrooms", session.user as any, permission))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbConnect();
  const existing: any = await Classroom.findById(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessRecord(existing, session.user as any))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
    await deleteClassroomRecords(params.id);
    await deleteClassroomSessionInstances(params.id);
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
  await syncClassroomSessionInstances(params.id);
  const updated = await Classroom.findById(params.id);
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || !(await canAccessFeature("classrooms", session.user as any, "cancel"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbConnect();
  const existing = await Classroom.findById(params.id).select("coach instructor students isTestClassroom testOwner").lean();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessRecord(existing, session.user as any))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await deleteClassroomRecords(params.id);
  await deleteClassroomSessionInstances(params.id);
  await Classroom.findByIdAndDelete(params.id);
  return NextResponse.json({ ok: true });
}
