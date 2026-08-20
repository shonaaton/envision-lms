import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { deriveScheduledSessionStatus, flattenScheduledSessions } from "@/lib/classroomSessions";
import { Classroom } from "@/models/Classroom";
import { Homework } from "@/models/Homework";
import { Tournament } from "@/models/Tournament";
import { Attendance } from "@/models/Attendance";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function dateKey(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function joinNames(items: any[] = [], fallback = "") {
  const names = items.map((item) => item?.name).filter(Boolean);
  return names.length ? names.join(", ") : fallback;
}

function addMinutes(value: Date | string, minutes: number) {
  const date = new Date(value);
  return new Date(date.getTime() + Math.max(1, minutes) * 60000).toISOString();
}

function isInternalMonthlyTournament(tournament: any) {
  const label = [tournament?.name, tournament?.description, tournament?.entryRestrictions].filter(Boolean).join(" ");
  return /internal|monthly/i.test(label);
}

async function requireAdminLike() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return role === "admin" || role === "sub-admin" ? session : null;
}

export async function GET() {
  const session = await requireAdminLike();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const classrooms: any[] = await Classroom.find({ isActive: { $ne: false }, isSessionInstance: { $ne: true } })
    .populate("coach instructor", "name username")
    .populate("generatedSessions.substituteCoach", "name username")
    .populate("batches", "name")
    .populate("students", "name")
    .lean();

  const classroomIds = classrooms.map((item: any) => item._id);
  const [homework, tournaments, attendance] = await Promise.all([
    Homework.find({}).populate("instructor", "name").sort({ dueAt: 1, createdAt: -1 }).lean(),
    Tournament.find({}).sort({ startAt: 1 }).lean(),
    Attendance.find({ classroom: { $in: classroomIds } }).lean(),
  ]);

  const attendanceKeys = new Set(attendance.map((item: any) => `${objectId(item.classroom)}-${dateKey(item.sessionDate)}`));
  const sessions = flattenScheduledSessions(classrooms);

  const classEvents = sessions.map(({ classroom, session }: any) => {
    const classroomId = objectId(classroom._id);
    const sessionId = String(session._id || `${classroomId}-${session.sessionNumber || "session"}`);
    const coachName = session?.substituteCoach?.name || classroom?.coach?.name || classroom?.instructor?.name || "Assigned coach";
    const batchName = joinNames(classroom?.batches, `${classroom?.students?.length || 0} students`);
    const topic = session?.topicName || classroom?.topicName || classroom?.title || "Class session";
    const status = deriveScheduledSessionStatus(session, new Date());
    return {
      id: `class-${classroomId}-${sessionId}`,
      title: `${batchName} - ${topic}`,
      start: new Date(session.scheduledFor).toISOString(),
      end: addMinutes(session.scheduledFor, Number(session.durationMinutes || classroom?.durationMinutes || 60)),
      allDay: false,
      extendedProps: {
        eventType: "class",
        priority: status === "missed" ? "high" : "standard",
        metadata: {
          coach_name: coachName,
          batch_name: batchName,
          platform_link: classroom?.lichessStudyUrl || classroom?.meetingUrl || "",
          attendance_status: attendanceKeys.has(`${classroomId}-${dateKey(session.scheduledFor)}`) ? "completed" : "pending",
          student_count: Number(classroom?.students?.length || 0),
          topic,
        },
        action_url: `/classrooms/${classroomId}/summary?session=${sessionId}`,
      },
    };
  });

  const attendanceEvents = sessions
    .filter(({ session }: any) => ["completed", "missed"].includes(deriveScheduledSessionStatus(session, new Date())))
    .filter(({ classroom, session }: any) => !attendanceKeys.has(`${objectId(classroom._id)}-${dateKey(session.scheduledFor)}`))
    .map(({ classroom, session }: any) => {
      const start = new Date(session.scheduledFor).toISOString();
      return {
        id: `task-attendance-${objectId(classroom._id)}-${String(session._id)}`,
        title: `Mark attendance - ${classroom.title}`,
        start,
        end: addMinutes(start, 30),
        allDay: false,
        extendedProps: {
          eventType: "task",
          priority: "high",
          metadata: {
            coach_name: classroom?.coach?.name || classroom?.instructor?.name || "",
            batch_name: joinNames(classroom?.batches),
            attendance_status: "pending",
            student_count: Number(classroom?.students?.length || 0),
          },
          action_url: "/attendance",
        },
      };
    });

  const homeworkEvents = homework.flatMap((item: any) => {
    const dueAt = item?.dueAt ? new Date(item.dueAt) : new Date(item.createdAt || Date.now());
    const base = {
      id: `homework-${objectId(item._id)}`,
      title: item.title,
      start: dueAt.toISOString(),
      end: addMinutes(dueAt, 30),
      allDay: false,
      extendedProps: {
        eventType: "homework",
        priority: dueAt.getTime() < Date.now() ? "high" : "standard",
        metadata: {
          coach_name: item.instructor?.name || "",
          batch_name: "Academy homework",
          student_count: Number((item.assignedStudents || []).length),
        },
        action_url: `/homework/${objectId(item._id)}`,
      },
    };
    return [
      base,
      {
        ...base,
        id: `task-review-${objectId(item._id)}`,
        title: `Review homework - ${item.title}`,
        extendedProps: {
          ...base.extendedProps,
          eventType: "task",
          action_url: "/homework",
        },
      },
    ];
  });

  const tournamentEvents = tournaments.map((item: any) => {
    const internal = isInternalMonthlyTournament(item);
    return {
      id: `tournament-${objectId(item._id)}`,
      title: item.name,
      start: new Date(item.startAt).toISOString(),
      end: addMinutes(item.startAt, item.type === "arena" ? Number(item.arenaDurationMinutes || 60) : 90),
      allDay: false,
      extendedProps: {
        eventType: "tournament",
        priority: internal ? "high" : "standard",
        metadata: {
          batch_name: item.access?.allActiveStudents ? "All active students" : "Restricted",
          student_count: Number((item.participants || []).length) + Number((item.externalParticipants || []).length),
          platform_link: "",
          tournament_kind: item.type,
          internal_monthly: internal,
        },
        action_url: `/tournaments/${objectId(item._id)}`,
      },
    };
  });

  return NextResponse.json([...classEvents, ...attendanceEvents, ...homeworkEvents, ...tournamentEvents]);
}

