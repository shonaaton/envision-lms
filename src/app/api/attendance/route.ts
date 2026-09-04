import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Attendance } from "@/models/Attendance";
import { recordActivity } from "@/lib/activity";
import { consumeAttendanceCredit } from "@/lib/fees";
import { Classroom } from "@/models/Classroom";
import { Booking } from "@/models/Booking";
import { DemoFeedback } from "@/models/Onboarding";
import { ClassroomSession, LiveQuestionResponse } from "@/models/ClassroomLive";
import { actualSessionMinutes, punctualityBreakdown, scheduledPaymentMinutes } from "@/lib/teachingStats";
import { canAccessFeature } from "@/lib/featureAccess";
import { coachCanAccessClassroomSession, coachClassroomQuery, limitClassroomToCoachSessions } from "@/lib/classroomCoachAccess";
import { academyDateKey } from "@/lib/academyTime";
import { autoAssignHomeworkForSession } from "@/lib/assignmentAutomation";
import { notifyDemoMissed } from "@/lib/demoWorkflow";
import { notifyFailure } from "@/lib/failureNotifications";
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
import { sendClassCompletedSummaryEmail, sendStudentNoShowWarningEmail } from "@/lib/studentCommunicationEmails";

export const dynamic = "force-dynamic";

const TERMINAL_SESSION_OUTCOMES = new Set(["completed", "cancelled", "missed", "abandoned", "absent", "coach_no_show", "student_no_show", "technical_issue"]);
const NON_ATTENDING_RECORD_STATUSES = new Set(["absent", "not_joined", "student_no_show"]);

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

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function minutesBetween(start?: string | Date | null, end?: string | Date | null) {
  if (!start || !end) return 0;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return 0;
  return Math.max(0, Math.round((endTime - startTime) / 60000));
}

function statusFromActivity(minutes: number, submissions: number, isDemoClassroom: boolean) {
  if (isDemoClassroom && (minutes > 0 || submissions > 0)) return "present";
  if (minutes >= 10 || submissions > 0) return "present";
  if (minutes > 0) return "late";
  return "absent";
}

async function activityByStudent({
  classroom,
  sessionId,
  metadata,
}: {
  classroom: string;
  sessionId?: string;
  metadata?: AttendancePayload["metadata"];
}) {
  const activity = new Map<string, { minutes: number; submissions: number }>();
  const add = (studentId: string, values: { minutes?: number; submissions?: number }) => {
    if (!studentId) return;
    const current = activity.get(studentId) || { minutes: 0, submissions: 0 };
    activity.set(studentId, {
      minutes: Math.max(current.minutes, Math.max(0, Number(values.minutes || 0))),
      submissions: Math.max(current.submissions, Math.max(0, Number(values.submissions || 0))),
    });
  };

  const summaryRows = Array.isArray((metadata?.summary as any)?.rows) ? (metadata?.summary as any).rows : [];
  for (const row of summaryRows) {
    add(objectId(row.student?._id || row.student), {
      minutes: Number(row.timeMinutes || 0),
      submissions: Number(row.submissions || 0),
    });
  }

  if (!sessionId) return activity;

  const [liveSession, responseCounts] = await Promise.all([
    ClassroomSession.findOne({ classroom, scheduledSessionId: sessionId })
      .select("participants endedAt")
      .lean<any>(),
    LiveQuestionResponse.aggregate([
      {
        $match: {
          classroom: new Types.ObjectId(classroom),
          scheduledSessionId: sessionId,
        },
      },
      { $group: { _id: "$student", submissions: { $sum: 1 } } },
    ]),
  ]);

  for (const participant of liveSession?.participants || []) {
    if (String(participant.role || "student") !== "student") continue;
    add(objectId(participant.user), {
      minutes: minutesBetween(participant.firstSeenAt, participant.lastSeenAt || liveSession?.endedAt),
    });
  }
  for (const row of responseCounts || []) {
    add(objectId(row._id), { submissions: Number(row.submissions || 0) });
  }

  return activity;
}

function normalizeAttendanceRecords({
  records,
  activity,
  isDemoClassroom,
}: {
  records: AttendanceRecordInput[];
  activity: Map<string, { minutes: number; submissions: number }>;
  isDemoClassroom: boolean;
}) {
  return records.map((record) => {
    const studentId = String(record.student || "");
    const status = String(record.status || "absent") as AttendanceRecordInput["status"];
    const studentActivity = activity.get(studentId) || { minutes: 0, submissions: 0 };
    const hasActivity = studentActivity.minutes > 0 || studentActivity.submissions > 0;
    if (!hasActivity || !NON_ATTENDING_RECORD_STATUSES.has(String(status))) return record;
    const correctedStatus = statusFromActivity(studentActivity.minutes, studentActivity.submissions, isDemoClassroom) as AttendanceRecordInput["status"];
    return {
      ...record,
      status: correctedStatus,
      note: record.note || "Auto-corrected from recorded classroom activity",
    };
  });
}

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
  const isDemoClassroom = classroomDoc.classroomType === "demo";
  const target = sessionId ? classroomDoc?.generatedSessions?.id?.(sessionId) : null;
  if (sessionId && !target) return NextResponse.json({ error: "Scheduled class not found" }, { status: 404 });
  if (target && academyDateKey(normalizedDate) !== academyDateKey(target.scheduledFor)) {
    return NextResponse.json({ error: "Attendance date does not match the scheduled class date" }, { status: 400 });
  }
  if (role === "instructor" && !coachCanAccessClassroomSession(classroomDoc, (session.user as SessionUser).id, sessionId)) {
    return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
  }
  const assignedStudentIds = new Set((classroomDoc.students || []).map((student: any) => String(student?._id || student)));
  const inputRecords = records || [];
  if (inputRecords.some((record) => !record.student || !assignedStudentIds.has(String(record.student)))) {
    return NextResponse.json({ error: "Attendance includes a student who is not assigned to this classroom" }, { status: 400 });
  }
  const recordedActivity = await activityByStudent({ classroom, sessionId, metadata });
  const normalizedRecords = normalizeAttendanceRecords({
    records: inputRecords,
    activity: recordedActivity,
    isDemoClassroom,
  });
  const scheduledMinutes = target ? scheduledPaymentMinutes(target, classroomDoc) : Math.max(0, Number(classroomDoc?.durationMinutes || teachingMinutes || 0));
  const hasAttendingStudent = normalizedRecords.some((record) => ["present", "late"].includes(String(record?.status || "")));
  const summaryActualMinutes = Math.max(
    0,
    Number((metadata?.summary as any)?.actualTeachingMinutes || (metadata?.summary as any)?.durationMinutes || 0)
  );
  const storedActualMinutes = target ? Math.max(0, Number(target.actualTeachingMinutes || actualSessionMinutes(target) || 0)) : 0;
  const submittedActualMinutes = Math.max(0, Number(teachingMinutes || 0));
  const recordedActualMinutes = summaryActualMinutes || storedActualMinutes || submittedActualMinutes;
  const actualMinutes = recordedActualMinutes || (hasAttendingStudent ? scheduledMinutes : 0);
  const requestedOutcome = classOutcome || metadata?.summary?.classOutcome || (hasAttendingStudent ? "completed" : undefined);
  const completionOverride = Boolean(adminOverrideCompletion || metadata?.summary?.adminOverrideCompletion || (hasAttendingStudent && requestedOutcome === "completed"));
  const outcome = isDemoClassroom && requestedOutcome === "completed" ? "completed" : normalizeSessionOutcome(requestedOutcome, actualMinutes, completionOverride);
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
    creditPolicy: isDemoClassroom ? "demo_no_charge" : outcome === "completed" ? "charge_present_students" : outcome === "student_no_show" ? "repeat_no_show_policy" : "no_charge",
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
      records: normalizedRecords,
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
    label: `${overrideEntry ? "Corrected" : "Marked"} attendance for ${normalizedRecords.length} students`,
    entityType: "Attendance",
    entityId: doc._id.toString(),
    metadata: { classroom, sessionDate, sessionId, records: normalizedRecords.length, classOutcome: storedOutcome, overrideReason: overrideEntry?.reason || "" },
  });
  for (const record of normalizedRecords) {
    if (!record?.student) continue;
    if (isDemoClassroom) continue;
    const recordStatus = String(record.status || "");
    if (outcome === "completed" && (recordStatus === "present" || recordStatus === "late")) {
      await consumeAttendanceCredit(record.student, doc._id.toString());
    } else if (outcome === "student_no_show" && recordStatus === "student_no_show") {
      const count = await studentNoShowCountThisMonth(record.student, normalizedDate);
      if (count > STUDENT_NO_SHOW_FREE_ALLOWANCE_PER_MONTH) {
        await consumeAttendanceCredit(record.student, doc._id.toString(), "Credit deducted for repeated student no-show");
        await notifyStudentNoShowCreditDeduction(record.student, count, { classroom, sessionId, attendance: doc._id.toString() });
      }
      if (!existingAttendance) {
        await sendStudentNoShowWarningEmail({
          studentId: record.student,
          classroom: classroomDoc,
          session: target,
          attendanceId: doc._id.toString(),
          noShowCount: count,
          creditsDeducted: count > STUDENT_NO_SHOW_FREE_ALLOWANCE_PER_MONTH,
          request: req,
        }).catch((error) => console.error("Student no-show email failed", error));
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
      if (TERMINAL_SESSION_OUTCOMES.has(outcome)) {
        const finishedAt = target.actualEndedAt || new Date();
        target.actualEndedAt = finishedAt;
        if (!target.actualStartedAt) {
          const fallbackStart = actualMinutes > 0
            ? new Date(finishedAt.getTime() - actualMinutes * 60000)
            : new Date(target.scheduledFor || normalizedDate);
          target.actualStartedAt = fallbackStart;
        }
      }
      target.summary = {
        ...(target.summary || {}),
        ...(metadata?.summary || {}),
        classOutcome: storedOutcome,
        topicCompleted,
        creditPolicy: isDemoClassroom ? "demo_no_charge" : outcome === "completed" ? "charge_present_students" : outcome === "student_no_show" ? "repeat_no_show_policy" : "no_charge",
        scheduledTeachingMinutes: scheduledMinutes,
        actualTeachingMinutes: actualMinutes,
        punctualityScore,
      };
      if (!isDemoClassroom && shouldContinueTopic(requestedOutcome) && outcome === "completed") {
        await ensureTopicContinuationSession(classroomDoc, target, (session.user as SessionUser).id);
      }
      if (TERMINAL_SESSION_OUTCOMES.has(outcome)) {
        const allDone = (classroomDoc.generatedSessions || []).every((item: any) =>
          TERMINAL_SESSION_OUTCOMES.has(String(item.status || "").toLowerCase())
        );
        classroomDoc.status = allDone ? "completed" : "scheduled";
        await ClassroomSession.updateOne(
          { classroom, scheduledSessionId: sessionId },
          {
            $set: {
              status: "ended",
              endedAt: target.actualEndedAt || new Date(),
              locked: true,
              selectedStudents: [],
              boardControlStudents: [],
              challenge: { active: false },
            },
          }
        );
      }
      if (!isDemoClassroom) await recalculateFutureSessionTopics(classroomDoc, (session.user as SessionUser).id);
      await classroomDoc.save();
      if (outcome === "coach_no_show") {
        await notifyCoachNoShowIfThreshold(String(assignedCoach || ""), { classroom, sessionId, attendance: doc._id.toString() });
      }
      if (!isDemoClassroom && outcome === "completed") {
        await autoAssignHomeworkForSession({
          classroomId: classroom,
          scheduledSessionId: sessionId,
          actorId: (session.user as SessionUser).id,
          endedAt: target.actualEndedAt || new Date(),
        }).catch((error) => {
          console.error("Homework auto-assignment failed after attendance save", error);
          void notifyFailure({
            title: "Homework auto-assignment failed after attendance save",
            error,
            metadata: { automation: "homework_auto_assignment", classroomId: classroom, scheduledSessionId: sessionId, actorId: (session.user as SessionUser).id },
          });
        });
      }
      if (isDemoClassroom && !existingAttendance) {
        const demoBooking: any = classroomDoc.demoBooking
          ? await Booking.findById(classroomDoc.demoBooking)
          : await Booking.findOne({ classroom: classroomDoc._id, bookingType: "demo" });
        if (demoBooking) {
          if (outcome === "completed") {
            await DemoFeedback.findOneAndUpdate(
              { booking: demoBooking._id, classroom: classroomDoc._id },
              {
                $setOnInsert: {
                  booking: demoBooking._id,
                  demoUser: recordStudentId(normalizedRecords, classroomDoc.students || []),
                  coach: assignedCoach,
                  classroom: classroomDoc._id,
                  attendance: doc._id,
                  attendanceStatus: "present",
                  status: "draft",
                  extensibleData: { createdFrom: "attendance_completion" },
                },
              },
              { upsert: true, new: true }
            );
            await Booking.findByIdAndUpdate(demoBooking._id, { demoStatus: "ASSESSMENT_PENDING", feedbackStatus: "pending" });
          } else if (outcome === "student_no_show") {
            await Booking.findByIdAndUpdate(demoBooking._id, { status: "pending", approvalStatus: "pending_admin", demoStatus: "STUDENT_NO_SHOW", feedbackStatus: "not_required" });
            await notifyDemoMissed({ booking: demoBooking, classroom: classroomDoc }).catch((error) => console.error("Demo no-show WhatsApp failed", error));
          } else if (outcome === "absent" || outcome === "missed" || outcome === "abandoned") {
            await Booking.findByIdAndUpdate(demoBooking._id, { status: "pending", approvalStatus: "pending_admin", demoStatus: "ABSENT", feedbackStatus: "not_required" });
            await notifyDemoMissed({ booking: demoBooking, classroom: classroomDoc }).catch((error) => console.error("Demo missed WhatsApp failed", error));
          }
        }
      } else if (!isDemoClassroom && outcome === "completed" && !existingAttendance) {
          await sendClassCompletedSummaryEmail({
          classroom: classroomDoc,
          session: target,
          attendance: doc,
          records: normalizedRecords,
          request: req,
          }).catch((error) => console.error("Class completed summary email failed", error));
      }
    }
  }
  return NextResponse.json(doc);
}

function recordStudentId(records: AttendanceRecordInput[], fallbackStudents: any[]) {
  const present = records.find((record) => record.status === "present") || records[0];
  return present?.student || String(fallbackStudents[0]?._id || fallbackStudents[0] || "");
}
