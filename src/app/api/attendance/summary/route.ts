import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { deriveScheduledSessionStatus, getSessionStart } from "@/lib/classroomSessions";
import { canAccessFeature } from "@/lib/featureAccess";
import { academyDateKey, academyDayBounds } from "@/lib/academyTime";

export const dynamic = "force-dynamic";

type SummaryKind = "completed" | "missed" | "pending" | "marked";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function sameDay(value: Date, target: Date) {
  return academyDateKey(value) === academyDateKey(target);
}

function flattenClassroomSessions(classrooms: any[]) {
  return classrooms.flatMap((classroom: any) => {
    const sessions = Array.isArray(classroom.generatedSessions) && classroom.generatedSessions.length
      ? classroom.generatedSessions
      : classroom.classDate
        ? [{
            _id: `${classroom._id}-single`,
            sessionNumber: 1,
            topicName: classroom.topicName || classroom.title,
            scheduledFor: classroom.classDate,
            startTime: classroom.startTime,
            durationMinutes: classroom.durationMinutes || 60,
            status: classroom.status || "scheduled",
          }]
        : [];
    return sessions.map((scheduledSession: any) => ({ classroom, scheduledSession }));
  });
}

function coachForSession(classroom: any, scheduledSession: any) {
  return scheduledSession.substituteCoach || classroom.coach || classroom.instructor || null;
}

function titleForKind(kind: SummaryKind) {
  if (kind === "completed") return "Completed Classes";
  if (kind === "missed") return "Missed Attendance";
  if (kind === "pending") return "Pending Classes";
  return "Marked Classes";
}

function descriptionForKind(kind: SummaryKind) {
  if (kind === "completed") return "Classes that are over and ready for attendance review.";
  if (kind === "missed") return "Sessions that are over but still do not have attendance marked.";
  if (kind === "pending") return "Classes on the selected day where attendance is still pending.";
  return "Classes where attendance has already been marked.";
}

export async function GET(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as "student" | "instructor" | "admin" | "sub-admin" | undefined;
  if (!session || !role || !["admin", "sub-admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await canAccessFeature("attendance", session.user as any, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const kind = String(url.searchParams.get("kind") || "missed") as SummaryKind;
  if (!["completed", "missed", "pending", "marked"].includes(kind)) {
    return NextResponse.json({ error: "Invalid summary type" }, { status: 400 });
  }

  await dbConnect();
  const now = new Date();
  const selectedDateValue = url.searchParams.get("date") || new Date();
  const { start: selectedDateStart, end: selectedDateEnd } = academyDayBounds(selectedDateValue);
  const lookbackStart = kind === "pending"
    ? selectedDateStart
    : new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const attendanceEnd = kind === "pending" ? selectedDateEnd : now;

  const classroomDocs: any[] = await Classroom.find({ isSessionInstance: { $ne: true } })
    .populate("coach instructor", "name username email")
    .populate("generatedSessions.substituteCoach", "name username email")
    .populate("batches", "name")
    .sort({ createdAt: -1 })
    .lean();

  const attendanceDocs: any[] = await Attendance.find({ sessionDate: { $gte: lookbackStart, $lte: attendanceEnd } })
    .select("classroom scheduledSessionId sessionDate coachStatus records markedBy createdAt")
    .lean();
  const attendanceBySession = new Map(attendanceDocs.map((doc: any) => [`${objectId(doc.classroom)}:${String(doc.scheduledSessionId || "")}`, doc]));

  const rows = flattenClassroomSessions(classroomDocs)
    .map(({ classroom, scheduledSession }) => {
      const start = getSessionStart(scheduledSession);
      const lifecycle = deriveScheduledSessionStatus(scheduledSession, now);
      const attendance = attendanceBySession.get(`${objectId(classroom._id)}:${String(scheduledSession._id || "")}`) || null;
      const isPastTrackable = lifecycle === "completed" || lifecycle === "missed";
      const isSelectedDay = start ? sameDay(start, selectedDateStart) : false;

      if (kind === "completed" && !isPastTrackable) return null;
      if (kind === "missed" && (!isPastTrackable || attendance)) return null;
      if (kind === "pending" && (!isSelectedDay || !isPastTrackable || attendance)) return null;
      if (kind === "marked" && (!isPastTrackable || !attendance)) return null;

      const coach = coachForSession(classroom, scheduledSession);
      return {
        id: `${objectId(classroom._id)}:${String(scheduledSession._id || "")}`,
        classroomId: objectId(classroom._id),
        sessionId: String(scheduledSession._id || ""),
        title: classroom.title || "Class Session",
        topicName: scheduledSession.topicName || classroom.topicName || classroom.title || "Session",
        courseName: classroom.courseName || "General",
        levelName: classroom.levelName || "Not set",
        batchNames: (classroom.batches || []).map((batch: any) => batch.name).filter(Boolean),
        coachName: coach?.name || coach?.username || "Coach",
        coachEmail: coach?.email || "",
        scheduledFor: scheduledSession.scheduledFor || classroom.classDate,
        startTime: scheduledSession.startTime || classroom.startTime || "",
        durationMinutes: Number(scheduledSession.durationMinutes || classroom.durationMinutes || 60),
        status: lifecycle,
        attendanceState: attendance ? "marked" : "missed",
        coachStatus: attendance?.coachStatus || scheduledSession.coachAttendanceStatus || "pending",
        studentRecords: Array.isArray(attendance?.records) ? attendance.records.length : 0,
        markedAt: attendance?.createdAt || null,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime());

  return NextResponse.json({
    kind,
    title: titleForKind(kind),
    description: descriptionForKind(kind),
    selectedDate: selectedDateStart,
    sessions: rows,
  });
}
