import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { deriveScheduledSessionStatus, getSessionEnd, getSessionStart } from "@/lib/classroomSessions";
import { canAccessFeature } from "@/lib/featureAccess";
import { coachClassroomQuery, limitClassroomToCoachSessions } from "@/lib/classroomCoachAccess";
import { academyDateKey, academyDayBounds } from "@/lib/academyTime";

export const dynamic = "force-dynamic";

function sameDay(value: Date, target: Date) {
  return academyDateKey(value) === academyDateKey(target);
}

function objectId(value: any) {
  return value?.toString?.() || String(value || "");
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
            coachAttendanceStatus: classroom.status === "completed" ? "present" : "pending",
          }]
        : [];
    return sessions.map((session: any) => ({ classroom, session }));
  });
}

function findAttendanceSession(classroom: any, attendance: any) {
  const sessionId = String(attendance?.scheduledSessionId || "");
  const generated = Array.isArray(classroom?.generatedSessions) ? classroom.generatedSessions : [];
  const matched = generated.find((item: any) => String(item?._id || "") === sessionId);
  if (matched) return matched;
  if (classroom?.classDate && sessionId === `${objectId(classroom._id)}-single`) {
    return {
      _id: `${classroom._id}-single`,
      sessionNumber: 1,
      topicName: classroom.topicName || classroom.title,
      scheduledFor: classroom.classDate,
      startTime: classroom.startTime,
      durationMinutes: classroom.durationMinutes || 60,
      status: classroom.status || "scheduled",
    };
  }
  return null;
}

function deriveAttendanceState(session: any, attendance: any, now: Date) {
  const lifecycle = deriveScheduledSessionStatus(session, now);
  if (lifecycle === "cancelled" || lifecycle === "rescheduled") return "pending";
  if (attendance) return "marked";
  if (lifecycle === "completed" || lifecycle === "missed") return "missed";
  return "pending";
}

function isTrackableAttendanceSession(session: any) {
  const lifecycle = deriveScheduledSessionStatus(session, new Date());
  return lifecycle !== "cancelled" && lifecycle !== "rescheduled";
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();

  const role = (session.user as any).role as "student" | "instructor" | "admin" | "sub-admin";
  const userId = (session.user as any).id;
  if (!(await canAccessFeature("attendance", session.user as any, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const selectedDateValue = url.searchParams.get("date") || new Date();
  const { start: from, end: to } = academyDayBounds(selectedDateValue);
  const selectedDate = from;
  const now = new Date();

  if (role === "student") {
    const attendanceDocs: any[] = await Attendance.find({ "records.student": userId })
      .populate("classroom", "title courseName levelName topicName coach instructor meetingUrl durationMinutes generatedSessions classDate startTime")
      .populate("coach", "name")
      .sort({ sessionDate: -1 })
      .lean();

    const sessionRows = attendanceDocs.flatMap((doc: any) => {
      const record = (doc.records || []).find((row: any) => objectId(row.student) === userId);
      if (!record) return [];
      const classroom = doc.classroom;
      if (!classroom?._id) return [];
      const scheduledSession = findAttendanceSession(classroom, doc);
      if (doc.scheduledSessionId && !scheduledSession) return [];
      const summaryRow = doc.metadata?.summary?.rows?.find((row: any) => objectId(row.student?._id || row.student) === userId) || null;
      const duration = Number(doc.teachingMinutes || scheduledSession?.durationMinutes || classroom.durationMinutes || 0);
      const actualDuration = Number(doc.actualTeachingMinutes || scheduledSession?.actualTeachingMinutes || 0);
      return [{
        id: objectId(doc._id),
        classroomId: objectId(classroom._id),
        title: classroom.title || "Class Session",
        courseName: classroom.courseName || "General",
        levelName: classroom.levelName || "Not set",
        topicName: scheduledSession?.topicName || classroom.topicName || classroom.title || "Session",
        coachName: doc.coach?.name || classroom.coach?.name || classroom.instructor?.name || "Coach",
        sessionDate: doc.sessionDate,
        startTime: scheduledSession?.startTime || classroom.startTime || "",
        durationMinutes: duration,
        actualTeachingMinutes: actualDuration,
        punctualityScore: Number(doc.punctualityScore || scheduledSession?.punctualityScore || 0),
        status: record.status,
        joinedAt: doc.metadata?.summary?.startedAt || null,
        leftAt: doc.metadata?.summary?.endedAt || null,
        totalTimePresentMinutes: summaryRow?.timeMinutes || 0,
      }];
    });

    const attended = sessionRows.filter((row) => row.status === "present");
    const late = sessionRows.filter((row) => row.status === "late");
    const missed = sessionRows.filter((row) => row.status === "absent");
    const attendedMinutes = sessionRows
      .filter((row) => row.status === "present" || row.status === "late")
      .reduce((sum, row) => sum + Number(row.durationMinutes || 0), 0);
    const overall = {
      attendancePercentage: sessionRows.length ? Math.round(((attended.length + late.length) / sessionRows.length) * 100) : 0,
      classesAttended: attended.length,
      classesMissed: missed.length,
      lateEntries: late.length,
      totalTeachingHoursAttended: Number((attendedMinutes / 60).toFixed(1)),
    };

    const courseRows = Array.from(
      sessionRows.reduce((map, row) => {
        const current = map.get(row.courseName) || { courseName: row.courseName, attended: 0, missed: 0, total: 0 };
        current.total += 1;
        if (row.status === "present" || row.status === "late") current.attended += 1;
        if (row.status === "absent") current.missed += 1;
        map.set(row.courseName, current);
        return map;
      }, new Map<string, { courseName: string; attended: number; missed: number; total: number }>())
    ).map(([, row]) => ({
      ...row,
      attendancePercentage: row.total ? Math.round((row.attended / row.total) * 100) : 0,
    }));

    return NextResponse.json({
      role,
      overall,
      courseRows,
      topicRows: sessionRows.map((row) => ({ topicName: row.topicName, dateAttended: row.sessionDate, status: row.status })),
      sessionRows,
    });
  }

  const classroomFilter = role === "admin" || role === "sub-admin"
    ? { isSessionInstance: { $ne: true } }
    : {
        ...coachClassroomQuery(userId),
        isSessionInstance: { $ne: true },
      };

  const classroomDocs: any[] = await Classroom.find(classroomFilter)
    .populate("coach instructor", "name username")
    .populate("generatedSessions.substituteCoach", "name username")
    .populate("students", "name username email")
    .populate("batches", "name")
    .sort({ createdAt: -1 })
    .lean();
  const classrooms = role === "instructor"
    ? classroomDocs.map((classroom: any) => limitClassroomToCoachSessions(classroom, userId))
    : classroomDocs;

  const attendanceDocs: any[] = await Attendance.find({ sessionDate: { $gte: new Date(from.getTime() - 120 * 24 * 60 * 60 * 1000), $lte: to } }).lean();
  const attendanceMap = new Map(attendanceDocs.map((doc: any) => [`${objectId(doc.classroom)}:${String(doc.scheduledSessionId || "")}:${new Date(doc.sessionDate).toISOString()}`, doc]));

  const sessionRows = flattenClassroomSessions(classrooms)
    .filter(({ session }) => {
      const start = getSessionStart(session);
      return start ? sameDay(start, selectedDate) : false;
    })
    .map(({ classroom, session }) => {
      const attendanceKey = `${objectId(classroom._id)}:${String(session._id || "")}:${new Date(session.scheduledFor || classroom.classDate).toISOString()}`;
      const attendance = attendanceMap.get(attendanceKey) || null;
      return {
        id: `${objectId(classroom._id)}:${String(session._id)}`,
        classroomId: objectId(classroom._id),
        sessionId: String(session._id || ""),
        title: classroom.title,
        topicName: session.topicName || classroom.topicName || classroom.title,
        courseName: classroom.courseName || "General",
        levelName: classroom.levelName || "Not set",
        batchNames: (classroom.batches || []).map((batch: any) => batch.name).filter(Boolean),
        coachName: session.substituteCoach?.name || classroom.coach?.name || classroom.instructor?.name || "Coach",
        scheduledFor: session.scheduledFor || classroom.classDate,
        startTime: session.startTime || classroom.startTime || "",
        durationMinutes: Number(session.durationMinutes || classroom.durationMinutes || 60),
        status: deriveScheduledSessionStatus(session, now),
        attendanceState: deriveAttendanceState(session, attendance, now),
        coachStatus: attendance?.coachStatus || session.coachAttendanceStatus || "pending",
        teachingMinutes: Number(attendance?.teachingMinutes || session.durationMinutes || classroom.durationMinutes || 0),
        actualTeachingMinutes: Number(attendance?.actualTeachingMinutes || session.actualTeachingMinutes || 0),
        punctualityScore: Number(attendance?.punctualityScore || session.punctualityScore || 0),
        students: (classroom.students || []).map((student: any) => {
          const saved = (attendance?.records || []).find((row: any) => objectId(row.student) === objectId(student._id));
          return {
            _id: objectId(student._id),
            name: student.name,
            username: student.username,
            email: student.email,
            status: saved?.status || "present",
            note: saved?.note || "",
          };
        }),
        savedAttendance: attendance,
      };
    })
    .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());

  const allPastSessions = flattenClassroomSessions(classrooms)
    .filter(({ session }) => {
      if (!isTrackableAttendanceSession(session)) return false;
      const lifecycle = deriveScheduledSessionStatus(session, now);
      return lifecycle === "completed" || lifecycle === "missed";
    })
    .map(({ classroom, session }) => {
      const attendance = attendanceDocs.find((doc: any) => objectId(doc.classroom) === objectId(classroom._id) && String(doc.scheduledSessionId || "") === String(session._id || ""));
      return { classroom, session, attendance };
    });

  const pastSelectedDaySessions = sessionRows.filter((row) => {
    return row.status === "completed" || row.status === "missed";
  });

  const counts = {
    completedClasses: allPastSessions.length,
    missedAttendanceClasses: allPastSessions.filter((row) => !row.attendance).length,
    attendancePendingClasses: pastSelectedDaySessions.filter((row) => row.attendanceState !== "marked").length,
    previouslyMarkedClasses: allPastSessions.filter((row) => !!row.attendance).length,
  };

  const analytics = {
    studentAttendancePercentage: (() => {
      const rows = attendanceDocs.flatMap((doc: any) => doc.records || []);
      const total = rows.length;
      const present = rows.filter((row: any) => row.status === "present" || row.status === "late").length;
      return total ? Math.round((present / total) * 100) : 0;
    })(),
    coachAttendancePercentage: (() => {
      const valid = attendanceDocs.filter((doc: any) => ["present", "late", "absent"].includes(doc.coachStatus));
      const present = valid.filter((doc: any) => doc.coachStatus === "present" || doc.coachStatus === "late").length;
      return valid.length ? Math.round((present / valid.length) * 100) : 0;
    })(),
  };

  return NextResponse.json({
    role,
    selectedDate,
    counts,
    analytics,
    sessions: sessionRows,
  });
}
