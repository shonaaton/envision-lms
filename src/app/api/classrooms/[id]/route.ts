import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { Attendance } from "@/models/Attendance";
import { ClassroomChatMessage, ClassroomSession, LiveQuestion, LiveQuestionResponse } from "@/models/ClassroomLive";
import { buildGeneratedSessions } from "@/lib/classroomSchedule";
import { deleteClassroomSessionInstances, syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";
import { academyDateTime } from "@/lib/academyTime";
import { coachCanAccessClassroomSession, isPrimaryClassroomCoach, limitClassroomToCoachSessions } from "@/lib/classroomCoachAccess";

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

async function sessionHasRecords(classroomId: string, scheduledSessionId: string) {
  const [attendance, liveSession, chat, question] = await Promise.all([
    Attendance.exists({ classroom: classroomId, scheduledSessionId }),
    ClassroomSession.exists({ classroom: classroomId, scheduledSessionId }),
    ClassroomChatMessage.exists({ classroom: classroomId, scheduledSessionId }),
    LiveQuestion.exists({ classroom: classroomId, scheduledSessionId }),
  ]);
  return Boolean(attendance || liveSession || chat || question);
}

function recordId(value: any) {
  return String(value?._id || value || "");
}

async function canAccessRecord(doc: any, user: any, allowSubstitute = false, scheduledSessionId?: string) {
  const role = user?.role;
  const userId = String(user?.id || "");
  if (doc?.isTestClassroom) {
    return role === "admin" && recordId(doc.testOwner) === userId && isSuperAdminSession(user);
  }
  if (role === "admin" || role === "sub-admin") return true;
  if (role === "instructor") return isPrimaryClassroomCoach(doc, userId) || (allowSubstitute && coachCanAccessClassroomSession(doc, userId, scheduledSessionId));
  return (doc?.students || []).some((value: any) => recordId(value) === userId);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
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
  const scheduledSessionId = new URL(req.url).searchParams.get("session") || undefined;
  if (!(await canAccessRecord(doc, session.user as any, true, scheduledSessionId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json((session.user as any).role === "instructor" ? limitClassroomToCoachSessions(doc, String((session.user as any).id || "")) : doc);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const permission = ["cancel_class", "cancel_series", "cancel_session", "delete_session", "delete_series"].includes(body.action)
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
  const reassignedSessionIds: string[] = [];

  if (body.action === "cancel_class" || body.action === "cancel_series") {
    existing.status = "cancelled";
    (existing.generatedSessions || []).forEach((session: any) => {
      if (!session.actualEndedAt && session.status !== "completed") {
        session.status = "cancelled";
        session.coachAttendanceStatus = "cancelled";
      }
    });
  } else if (["update_session", "reschedule_session", "cancel_session", "delete_session"].includes(body.action)) {
    const sessionId = String(body.sessionId || "");
    const target = existing.generatedSessions?.id?.(sessionId) || (existing.generatedSessions || []).find((session: any) => String(session._id) === sessionId);
    if (!target) return NextResponse.json({ error: "Scheduled class not found" }, { status: 404 });

    if (body.action === "delete_session") {
      if (await sessionHasRecords(params.id, sessionId)) {
        return NextResponse.json({ error: "This class already has attendance or live-class records. Cancel it instead of deleting it." }, { status: 409 });
      }
      existing.generatedSessions.pull({ _id: sessionId });
      (existing.generatedSessions || []).forEach((session: any, index: number) => { session.sessionNumber = index + 1; });
    } else if (body.action === "cancel_session") {
      target.status = "cancelled";
      target.coachAttendanceStatus = "cancelled";
    } else {
      const nextStartTime = String(body.startTime || target.startTime || existing.startTime || "00:00");
      if (body.classDate) {
        if (body.action === "reschedule_session" && !target.originalDate) target.originalDate = target.scheduledFor;
        target.scheduledFor = academyDateTime(String(body.classDate), nextStartTime);
      } else if (body.startTime) {
        if (body.action === "reschedule_session" && !target.originalDate) target.originalDate = target.scheduledFor;
        target.scheduledFor = academyDateTime(target.scheduledFor, nextStartTime);
      }
      target.startTime = nextStartTime;
      target.durationMinutes = Math.max(15, Number(body.durationMinutes || target.durationMinutes || existing.durationMinutes || 60));
      if (String(body.topicName || "").trim()) target.topicName = String(body.topicName).trim();
      if (body.action === "reschedule_session") {
        target.status = "scheduled";
        target.coachAttendanceStatus = "pending";
      }
    }
  } else if (body.action === "reschedule_class") {
    existing.classDate = body.classDate ? new Date(body.classDate) : existing.classDate;
    existing.startTime = body.startTime || existing.startTime;
    existing.durationMinutes = Math.max(15, Number(body.durationMinutes || existing.durationMinutes || 60));
    if (Array.isArray(existing.generatedSessions) && existing.generatedSessions[0]) {
      existing.generatedSessions[0].originalDate = existing.generatedSessions[0].scheduledFor;
      existing.generatedSessions[0].scheduledFor = body.classDate ? academyDateTime(body.classDate, body.startTime || existing.generatedSessions[0].startTime) : existing.generatedSessions[0].scheduledFor;
      existing.generatedSessions[0].startTime = body.startTime || existing.generatedSessions[0].startTime;
      existing.generatedSessions[0].durationMinutes = Math.max(15, Number(body.durationMinutes || existing.generatedSessions[0].durationMinutes || 60));
      existing.generatedSessions[0].status = "scheduled";
    }
  } else if (body.action === "substitute_coach") {
    if (!String(body.coach || "").trim()) return NextResponse.json({ error: "Select a substitute coach" }, { status: 400 });
    if (body.scope === "session" && body.sessionId) {
      const target = existing.generatedSessions?.id?.(body.sessionId);
      if (!target) return NextResponse.json({ error: "Scheduled class not found" }, { status: 404 });
      target.substituteCoach = body.coach;
      reassignedSessionIds.push(String(target._id));
    } else {
      existing.coach = body.coach || existing.coach;
      existing.instructor = body.coach || existing.instructor;
      if (body.scope === "future" && Array.isArray(existing.generatedSessions)) {
        existing.generatedSessions.forEach((item: any) => {
          if (item.status === "scheduled") {
            item.substituteCoach = body.coach;
            reassignedSessionIds.push(String(item._id));
          }
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
        scheduledFor: academyDateTime(body.classDate, String(body.startTime || existing.startTime || "16:00")),
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
  if (reassignedSessionIds.length) {
    await Promise.all([
      ClassroomSession.updateMany(
        { classroom: params.id, scheduledSessionId: { $in: reassignedSessionIds } },
        { $set: { coach: body.coach } }
      ),
      Attendance.updateMany(
        { classroom: params.id, scheduledSessionId: { $in: reassignedSessionIds } },
        { $set: { coach: body.coach } }
      ),
    ]);
  }
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
