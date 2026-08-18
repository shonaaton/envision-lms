import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Attendance } from "@/models/Attendance";
import { recordActivity } from "@/lib/activity";
import { consumeAttendanceCredit } from "@/lib/fees";
import { Classroom } from "@/models/Classroom";
import { actualSessionMinutes, punctualityBreakdown, scheduledPaymentMinutes } from "@/lib/teachingStats";
import { canAccessFeature } from "@/lib/featureAccess";
import { coachCanAccessClassroomSession, coachClassroomQuery, limitClassroomToCoachSessions } from "@/lib/classroomCoachAccess";
import { academyDateKey } from "@/lib/academyTime";
import {
  notifyCoachNoShowIfThreshold,
  notifyStudentNoShowCreditDeduction,
  normalizeSessionOutcome,
  recalculateFutureSessionTopics,
  ensureTopicContinuationSession,
  topicCompletedForOutcome,
  shouldContinueTopic,
  studentNoShowCountThisMonth,
  STUDENT_NO_SHOW_FREE_ALLOWANCE_PER_MONTH,
} from "@/lib/classroomLifecycle";

export const dynamic = "force-dynamic";

type SessionUser = {
  id: string;
  role: "student" | "instructor" | "admin" | "sub-admin";
};

type AuthSession = {
  user: SessionUser;
};

type AttendanceRecordInput = {
  student?: string;
  status?: "present" | "absent" | "late" | "excused" | "coach_no_show" | "student_no_show" | "technical_issue" | "not_joined" | "coach_no_show_pending";
  note?: string;
};

type AttendancePayload = {
  classroom?: string;
  sessionDate?: string;
  sessionId?: string;
  records?: AttendanceRecordInput[];
  coach?: string;
  coachStatus?: string;
  teachingMinutes?: number;
  classOutcome?: string;
  adminOverrideCompletion?: boolean;
  overrideReason?: string;
  metadata?: {
    summary?: {
      actualTeachingMinutes?: number;
      classOutcome?: string;
      adminOverrideCompletion?: boolean;
    };
  };
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const url = new URL(req.url);
  const classroom = url.searchParams.get("classroom");
  const sessionDate = url.searchParams.get("sessionDate");
  const sessionId = url.searchParams.get("sessionId");
  const filter: Record<string, unknown> = {};
  if (classroom) filter.classroom = classroom;
  if (sessionId) filter.scheduledSessionId = sessionId;
  if (sessionDate) filter.sessionDate = new Date(sessionDate);
  const role = (session.user as SessionUser).role;
  const userId = (session.user as SessionUser).id;
  let instructorSessions: Map<string, Set<string>> | null = null;
  if (role === "student") {
    filter["records.student"] = userId;
  } else {
    if (!(await canAccessFeature("attendance", session.user as any, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (role === "instructor") {
      const classroomDocs: any[] = await Classroom.find({ ...coachClassroomQuery(userId), isSessionInstance: { $ne: true } })
        .select("coach instructor generatedSessions")
        .lean();
      instructorSessions = new Map(classroomDocs.map((item: any) => {
        const visible = limitClassroomToCoachSessions(item, userId);
        return [String(item._id), new Set((visible.generatedSessions || []).map((scheduled: any) => String(scheduled._id)))];
      }));
      const classroomIds = classroomDocs.map((item: any) => item._id);
      filter.classroom = classroom ? { $in: classroomIds.filter((id: any) => String(id) === classroom) } : { $in: classroomIds };
    }
  }
  const list = await Attendance.find(filter).sort({ sessionDate: -1 }).limit(100).lean();
  const visibleList = instructorSessions
    ? list.filter((item: any) => instructorSessions?.get(String(item.classroom))?.has(String(item.scheduledSessionId || "")))
    : list;
  return NextResponse.json(visibleList);
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as SessionUser | undefined)?.role;
  if (!session || !role || !["instructor", "admin", "sub-admin"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const classroomAttendanceAccess = await canAccessFeature("classrooms", session.user as any, "attendance");
  const attendanceOverrideAccess = (role === "admin" || role === "sub-admin") && await canAccessFeature("attendance", session.user as any, "edit");
  if (!classroomAttendanceAccess && !attendanceOverrideAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { classroom, sessionDate, sessionId, records, coach, coachStatus, teachingMinutes, classOutcome, adminOverrideCompletion, overrideReason, metadata } = await req.json() as AttendancePayload;
  if (!classroom || !sessionDate) return NextResponse.json({ error: "missing fields" }, { status: 400 });
  await dbConnect();
  await Attendance.collection.dropIndex("classroom_1_sessionDate_1").catch(() => undefined);
  const normalizedDate = new Date(sessionDate);
  if (Number.isNaN(normalizedDate.getTime())) return NextResponse.json({ error: "Invalid session date" }, { status: 400 });
  const classroomDoc = await Classroom.findById(classroom);
  if (!classroomDoc) return NextResponse.json({ error: "Classroom not found" }, { status: 404 });
  const target = sessionId ? classroomDoc?.generatedSessions?.id?.(sessionId) : null;
  if (sessionId && !target) return NextResponse.json({ error: "Scheduled class not found" }, { status: 404 });
  if (target && academyDateKey(normalizedDate) !== academyDateKey(target.scheduledFor)) {
    return NextResponse.json({ error: "Attendance date does not match the scheduled class date" }, { status: 400 });
  }
  if (role === "instructor" && !coachCanAccessClassroomSession(classroomDoc, (session.user as SessionUser).id, sessionId)) {
    return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
  }
  const assignedStudentIds = new Set((classroomDoc.students || []).map((student: any) => String(student?._id || student)));
  if ((records || []).some((record) => !record.student || !assignedStudentIds.has(String(record.student)))) {
    return NextResponse.json({ error: "Attendance includes a student who is not assigned to this classroom" }, { status: 400 });
  }
  const scheduledMinutes = target ? scheduledPaymentMinutes(target, classroomDoc) : Math.max(0, Number(classroomDoc?.durationMinutes || teachingMinutes || 0));
  const actualMinutes = target
    ? Math.max(0, Number(metadata?.summary?.actualTeachingMinutes || teachingMinutes || target.actualTeachingMinutes || actualSessionMinutes(target) || 0))
    : Math.max(0, Number(metadata?.summary?.actualTeachingMinutes || teachingMinutes || 0));
  const requestedOutcome = classOutcome || metadata?.summary?.classOutcome;
  const outcome = normalizeSessionOutcome(requestedOutcome, actualMinutes, Boolean(adminOverrideCompletion || metadata?.summary?.adminOverrideCompletion));
  const topicCompleted = topicCompletedForOutcome(outcome, requestedOutcome);
  const storedOutcome = shouldContinueTopic(requestedOutcome) && outcome === "completed" ? "completed_continue_topic" : outcome;
  const punctualityScore = target ? Number(target.punctualityScore || punctualityBreakdown(target, classroomDoc).punctualityScore) : 0;
  const assignedCoach = target?.substituteCoach || classroomDoc.coach || classroomDoc.instructor || coach;
  const existingAttendance: any = await Attendance.findOne({ classroom, scheduledSessionId: sessionId || "", sessionDate: normalizedDate }).lean();
  const overrideReasonText = String(overrideReason || "").trim();
  const overrideEntry = existingAttendance && attendanceOverrideAccess
    ? {
        at: new Date(),
        actor: (session.user as SessionUser).id,
        role,
        reason: overrideReasonText || "Attendance corrected from attendance workspace",
      }
    : null;
  const nextMetadata = {
    ...(existingAttendance?.metadata || {}),
    ...(metadata || {}),
    classOutcome: storedOutcome,
    topicCompleted,
    creditPolicy: outcome === "completed" ? "charge_present_students" : outcome === "student_no_show" ? "repeat_no_show_policy" : "no_charge",
    scheduledTeachingMinutes: scheduledMinutes,
    actualTeachingMinutes: actualMinutes,
    punctualityScore,
    ...(overrideEntry
      ? {
          attendanceOverride: {
            lastUpdatedAt: overrideEntry.at,
            lastUpdatedBy: overrideEntry.actor,
            lastUpdatedRole: overrideEntry.role,
            reason: overrideEntry.reason,
          },
          overrideHistory: [...(Array.isArray(existingAttendance?.metadata?.overrideHistory) ? existingAttendance.metadata.overrideHistory : []), overrideEntry],
        }
      : {}),
  };
  const doc = await Attendance.findOneAndUpdate(
    { classroom, scheduledSessionId: sessionId || "", sessionDate: normalizedDate },
    {
      records,
      markedBy: (session.user as SessionUser).id,
      scheduledSessionId: sessionId || "",
      coach: assignedCoach,
      coachStatus: coachStatus || (outcome === "coach_no_show" ? "coach_no_show" : "present"),
      teachingMinutes: scheduledMinutes,
      actualTeachingMinutes: actualMinutes,
      punctualityScore,
      metadata: nextMetadata,
    },
    { upsert: true, new: true }
  );
  await recordActivity({
    actor: (session.user as SessionUser).id,
    type: overrideEntry ? "attendance.overridden" : "attendance.marked",
    label: `${overrideEntry ? "Corrected" : "Marked"} attendance for ${records?.length ?? 0} students`,
    entityType: "Attendance",
    entityId: doc._id.toString(),
    metadata: { classroom, sessionDate, sessionId, records: records?.length ?? 0, classOutcome: storedOutcome, overrideReason: overrideEntry?.reason || "" },
  });
  for (const record of records || []) {
    if (!record?.student) continue;
    const recordStatus = String(record.status || "");
    if (outcome === "completed" && (recordStatus === "present" || recordStatus === "late")) {
      await consumeAttendanceCredit(record.student, doc._id.toString());
    } else if (outcome === "student_no_show" && recordStatus === "student_no_show") {
      const count = await studentNoShowCountThisMonth(record.student, normalizedDate);
      if (count > STUDENT_NO_SHOW_FREE_ALLOWANCE_PER_MONTH) {
        await consumeAttendanceCredit(record.student, doc._id.toString(), "Credit deducted for repeated student no-show");
        await notifyStudentNoShowCreditDeduction(record.student, count, { classroom, sessionId, attendance: doc._id.toString() });
      }
    }
  }
  if (sessionId) {
    if (target) {
      target.attendanceMarkedAt = new Date();
      target.coachAttendanceStatus = coachStatus || (outcome === "coach_no_show" ? "coach_no_show" : target.coachAttendanceStatus || "present");
      target.teachingMinutes = scheduledMinutes;
      target.actualTeachingMinutes = actualMinutes;
      target.punctualityScore = punctualityScore;
      target.status = outcome;
      target.summary = {
        ...(target.summary || {}),
        ...(metadata?.summary || {}),
        classOutcome: storedOutcome,
        topicCompleted,
        creditPolicy: outcome === "completed" ? "charge_present_students" : outcome === "student_no_show" ? "repeat_no_show_policy" : "no_charge",
        scheduledTeachingMinutes: scheduledMinutes,
        actualTeachingMinutes: actualMinutes,
        punctualityScore,
      };
      if (shouldContinueTopic(requestedOutcome) && outcome === "completed") {
        await ensureTopicContinuationSession(classroomDoc, target, (session.user as SessionUser).id);
      }
      await recalculateFutureSessionTopics(classroomDoc, (session.user as SessionUser).id);
      await classroomDoc.save();
      if (outcome === "coach_no_show") {
        await notifyCoachNoShowIfThreshold(String(assignedCoach || ""), { classroom, sessionId, attendance: doc._id.toString() });
      }
    }
  }
  return NextResponse.json(doc);
}
