import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { deriveScheduledSessionStatus, getSessionStart } from "@/lib/classroomSessions";
import { canAccessFeature } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
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

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role as "student" | "instructor" | "admin" | "sub-admin" | undefined;
  if (!session || !role || !["admin", "sub-admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await canAccessFeature("attendance", session.user as any, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await dbConnect();
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const classroomDocs: any[] = await Classroom.find({ isSessionInstance: { $ne: true } })
    .populate("coach instructor", "name username email")
    .populate("generatedSessions.substituteCoach", "name username email")
    .populate("batches", "name")
    .sort({ createdAt: -1 })
    .lean();

  const attendanceDocs: any[] = await Attendance.find({ sessionDate: { $gte: lookbackStart, $lte: now } })
    .select("classroom scheduledSessionId sessionDate")
    .lean();
  const attendanceKeys = new Set(attendanceDocs.map((doc: any) => `${objectId(doc.classroom)}:${String(doc.scheduledSessionId || "")}`));

  const sessions = flattenClassroomSessions(classroomDocs)
    .filter(({ scheduledSession }) => {
      const start = getSessionStart(scheduledSession);
      if (!start || start < lookbackStart || start > now) return false;
      const lifecycle = deriveScheduledSessionStatus(scheduledSession, now);
      return lifecycle === "completed" || lifecycle === "missed";
    })
    .filter(({ classroom, scheduledSession }) => !attendanceKeys.has(`${objectId(classroom._id)}:${String(scheduledSession._id || "")}`))
    .map(({ classroom, scheduledSession }) => {
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
        status: deriveScheduledSessionStatus(scheduledSession, now),
      };
    })
    .sort((a, b) => new Date(b.scheduledFor).getTime() - new Date(a.scheduledFor).getTime());

  return NextResponse.json({ sessions });
}
