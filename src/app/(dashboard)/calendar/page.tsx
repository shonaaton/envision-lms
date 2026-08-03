import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { Homework, Submission } from "@/models/Homework";
import { Tournament } from "@/models/Tournament";
import { Attendance } from "@/models/Attendance";
import { User } from "@/models/User";
import {
  deriveScheduledSessionStatus,
  flattenScheduledSessions,
  isJoinWindowOpen,
} from "@/lib/classroomSessions";
import { inactiveStudentMessage } from "@/lib/studentStatus";
import CalendarWorkspace, { type CalendarEvent } from "@/components/calendar/CalendarWorkspace";
import { coachClassroomQuery, limitClassroomToCoachSessions } from "@/lib/classroomCoachAccess";
import { academyDateKey } from "@/lib/academyTime";
import { canAccessFeature } from "@/lib/featureAccess";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function dateKey(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : academyDateKey(date);
}

function formatDuration(minutes: number) {
  if (!minutes) return "Not specified";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function joinNames(items: any[] = [], fallback = "") {
  const names = items.map((item) => item?.name).filter(Boolean);
  return names.length ? names.join(", ") : fallback;
}

function buildClassEvent({
  classroom,
  session,
  role,
  status,
  canJoin,
}: {
  classroom: any;
  session: any;
  role: "student" | "instructor" | "admin" | "sub-admin";
  status: string;
  canJoin: boolean;
}): CalendarEvent {
  const classroomId = objectId(classroom._id);
  const sessionId = String(session._id || `${classroomId}-${session.sessionNumber || "session"}`);
  const coachName = session?.substituteCoach?.name || classroom?.coach?.name || classroom?.instructor?.name || "Assigned coach";
  const batchLabel = joinNames(classroom?.batches, classroom?.batches?.length ? "" : `${classroom?.students?.length || 0} students`);
  const studentLabel = joinNames(classroom?.students, classroom?.students?.length ? "" : "No students assigned");
  const topic = session?.topicName || classroom?.topicName || classroom?.title || "Class session";
  const joinable = canJoin && (status === "ongoing" || isJoinWindowOpen(session));
  const summaryHref = `/classrooms/${classroomId}/summary?session=${sessionId}`;

  return {
    id: `class-${classroomId}-${sessionId}`,
    type: "class",
    status,
    title: classroom?.title || topic,
    subtitle: role === "student" ? `${topic} - ${coachName}` : `${topic} - ${batchLabel || studentLabel}`,
    description: role === "student" ? `Coach ${coachName}` : `${studentLabel}`,
    start: new Date(session.scheduledFor).toISOString(),
    end: new Date(new Date(session.scheduledFor).getTime() + Number(session.durationMinutes || classroom?.durationMinutes || 60) * 60000).toISOString(),
    topic,
    coachName,
    batchLabel,
    studentLabel,
    durationLabel: formatDuration(Number(session.durationMinutes || classroom?.durationMinutes || 60)),
    href: joinable ? `/classrooms/${classroomId}/live?session=${sessionId}` : summaryHref,
    hrefLabel: joinable ? "Join Class" : "View Details",
    meetingUrl: joinable ? classroom?.meetingUrl || undefined : undefined,
  };
}

function buildHomeworkEvent({
  item,
  role,
  submission,
  batchLabel,
}: {
  item: any;
  role: "student" | "instructor" | "admin";
  submission?: any;
  batchLabel?: string;
}): CalendarEvent {
  const dueAt = item?.dueAt ? new Date(item.dueAt) : new Date(item.createdAt || Date.now());
  const now = new Date();
  let status = "upcoming";
  if (submission) status = "completed";
  else if (item?.dueAt && dueAt.getTime() < now.getTime()) status = "pending";

  return {
    id: `homework-${objectId(item._id)}`,
    type: "homework",
    status,
    title: item.title,
    subtitle: role === "student" ? `${item.type?.replaceAll("_", " ") || "assignment"} - ${item.instructor?.name || "Coach"}` : `${(item.activities || []).length || (item.puzzles || []).length} activity items`,
    description: role === "student" ? "Open the assignment and submit within the allowed attempts." : batchLabel || "Assignment scheduled for review and tracking.",
    start: dueAt.toISOString(),
    topic: item.type?.replaceAll("_", " "),
    coachName: item.instructor?.name,
    batchLabel,
    durationLabel: item.timeLimitMinutes ? formatDuration(Number(item.timeLimitMinutes)) : "Flexible",
    href: `/homework/${objectId(item._id)}`,
    hrefLabel: submission ? "View Homework" : "Open Homework",
  };
}

function buildTournamentEvent(item: any): CalendarEvent {
  return {
    id: `tournament-${objectId(item._id)}`,
    type: "tournament",
    status: item.status || "upcoming",
    title: item.name,
    subtitle: `${item.type === "arena" ? "Arena" : "Swiss"} - ${item.timeControlMinutes || 0}+${item.incrementSeconds || 0}`,
    description: item.description || "Tournament schedule and entry details.",
    start: new Date(item.startAt).toISOString(),
    topic: item.type === "arena" ? "Arena event" : "Swiss event",
    durationLabel: item.type === "arena" && item.arenaDurationMinutes ? formatDuration(Number(item.arenaDurationMinutes)) : "Tournament schedule",
    href: `/tournaments/${objectId(item._id)}`,
    hrefLabel: "Open Tournament",
  };
}

function buildAttendanceEvent(row: { classroom: any; session: any }): CalendarEvent {
  return {
    id: `attendance-${objectId(row.classroom._id)}-${String(row.session._id)}`,
    type: "attendance",
    status: "pending",
    title: `Mark attendance • ${row.classroom.title}`,
    subtitle: row.session.topicName || row.classroom.topicName || "Session attendance",
    description: "Attendance is still pending for this session.",
    start: new Date(row.session.scheduledFor).toISOString(),
    topic: row.session.topicName || row.classroom.topicName,
    batchLabel: joinNames(row.classroom.batches),
    studentLabel: joinNames(row.classroom.students, `${row.classroom.students?.length || 0} students`),
    durationLabel: formatDuration(Number(row.session.durationMinutes || row.classroom.durationMinutes || 60)),
    href: "/attendance",
    hrefLabel: "Open Attendance",
  };
}

function buildTaskEvent(item: any): CalendarEvent {
  const base = item?.dueAt ? new Date(item.dueAt) : new Date(item.createdAt || Date.now());
  const now = new Date();
  return {
    id: `task-${objectId(item._id)}`,
    type: "task",
    status: base.getTime() < now.getTime() ? "pending" : "upcoming",
    title: `Review homework • ${item.title}`,
    subtitle: `${(item.activities || []).length || (item.puzzles || []).length} activities`,
    description: "Check submissions, answer quality, and completion data for this homework.",
    start: base.toISOString(),
    topic: item.type?.replaceAll("_", " "),
    durationLabel: item.timeLimitMinutes ? formatDuration(Number(item.timeLimitMinutes)) : "Flexible",
    href: "/homework",
    hrefLabel: "Review Homework",
  };
}

async function getStudentEvents(userId: string, canJoin: boolean) {
  const me: any = await User.findById(userId).populate("batches", "name level").lean();
  if (me?.isActive === false) {
    return {
      title: "Calendar",
      subtitle: inactiveStudentMessage,
      events: [],
    };
  }
  const batchIds = ((me?.batches || []) as any[]).map(objectId);

  const classrooms: any[] = await Classroom.find({
    isActive: { $ne: false },
    isSessionInstance: { $ne: true },
    $or: [{ students: userId }, { batches: { $in: batchIds } }],
  })
    .populate("coach instructor", "name username")
    .populate("generatedSessions.substituteCoach", "name username")
    .populate("batches", "name")
    .populate("students", "name")
    .lean();

  const classroomIds = classrooms.map((item: any) => item._id);
  const [homework, submissions, tournaments, attendance] = await Promise.all([
    Homework.find({
      $or: [
        { assignedStudents: userId },
        { assignedBatches: { $in: batchIds } },
        { classroom: { $in: classroomIds }, assignAllStudents: true },
        { classroom: { $in: classroomIds }, assignedStudents: { $size: 0 }, assignedBatches: { $size: 0 } },
      ],
    }).populate("instructor", "name").sort({ dueAt: 1, createdAt: -1 }).lean(),
    Submission.find({ student: userId }).lean(),
    Tournament.find({
      $or: [
        { "access.users": userId },
        { "access.batches": { $in: batchIds } },
        { "access.allActiveStudents": true },
        { participants: userId },
      ],
    }).sort({ startAt: 1 }).lean(),
    Attendance.find({ classroom: { $in: classroomIds }, "records.student": userId }).lean(),
  ]);

  const attendanceBySession = new Map<string, string>();
  attendance.forEach((item: any) => {
    const record = (item.records || []).find((entry: any) => objectId(entry.student) === userId);
    if (!record) return;
    attendanceBySession.set(`${objectId(item.classroom)}-${dateKey(item.sessionDate)}`, record.status);
  });

  const submissionByHomework = new Map(submissions.map((item: any) => [objectId(item.homework), item]));
  const classEvents = flattenScheduledSessions(classrooms).map(({ classroom, session }: any) => {
    const status = deriveScheduledSessionStatus(session, new Date(), {
      attendanceStatus: attendanceBySession.get(`${objectId(classroom._id)}-${dateKey(session.scheduledFor)}`),
    });
    return buildClassEvent({ classroom, session, role: "student", status, canJoin });
  });

  const homeworkEvents = homework.map((item: any) =>
    buildHomeworkEvent({
      item,
      role: "student",
      submission: submissionByHomework.get(objectId(item._id)),
      batchLabel: joinNames((me?.batches || []) as any[]),
    })
  );

  return {
    title: "Calendar",
    subtitle: "Your classes, homework, tournaments, and deadlines are all organized in one clean schedule.",
    events: [...classEvents, ...homeworkEvents, ...tournaments.map(buildTournamentEvent)],
  };
}

async function getCoachEvents(userId: string, canJoin: boolean) {
  const classroomDocs: any[] = await Classroom.find({ ...coachClassroomQuery(userId), isActive: { $ne: false }, isSessionInstance: { $ne: true } })
    .populate("coach instructor", "name username")
    .populate("generatedSessions.substituteCoach", "name username")
    .populate("batches", "name")
    .populate("students", "name")
    .lean();
  const classrooms = classroomDocs.map((classroom: any) => limitClassroomToCoachSessions(classroom, userId));

  const classroomIds = classrooms.map((item: any) => item._id);
  const [homework, tournaments, attendance] = await Promise.all([
    Homework.find({ instructor: userId }).populate("instructor", "name").sort({ dueAt: 1, createdAt: -1 }).lean(),
    Tournament.find({ status: { $in: ["draft", "upcoming", "live", "completed", "cancelled"] } }).sort({ startAt: 1 }).lean(),
    Attendance.find({ classroom: { $in: classroomIds } }).lean(),
  ]);

  const attendanceKeys = new Set(attendance.map((item: any) => `${objectId(item.classroom)}-${dateKey(item.sessionDate)}`));
  const sessions = flattenScheduledSessions(classrooms);

  const classEvents = sessions.map(({ classroom, session }: any) =>
    buildClassEvent({
      classroom,
      session,
      role: "instructor",
      status: deriveScheduledSessionStatus(session, new Date()),
      canJoin,
    })
  );

  const attendanceEvents = sessions
    .filter(({ session }: any) => {
      const status = deriveScheduledSessionStatus(session, new Date());
      return ["completed", "missed"].includes(status);
    })
    .filter(({ classroom, session }: any) => !attendanceKeys.has(`${objectId(classroom._id)}-${dateKey(session.scheduledFor)}`))
    .map((row: any) => buildAttendanceEvent(row));

  const taskEvents = homework.map((item: any) => buildTaskEvent(item));

  return {
    title: "Calendar",
    subtitle: "See upcoming classes, attendance work, homework review, and tournament commitments without leaving the teaching flow.",
    events: [...classEvents, ...attendanceEvents, ...taskEvents, ...homework.map((item: any) => buildHomeworkEvent({ item, role: "instructor", batchLabel: "Assigned homework" })), ...tournaments.map(buildTournamentEvent)],
  };
}

async function getAdminEvents(canJoin: boolean) {
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

  const classEvents = sessions.map(({ classroom, session }: any) =>
    buildClassEvent({
      classroom,
      session,
      role: "admin",
      status: deriveScheduledSessionStatus(session, new Date()),
      canJoin,
    })
  );

  const attendanceEvents = sessions
    .filter(({ session }: any) => {
      const status = deriveScheduledSessionStatus(session, new Date());
      return ["completed", "missed"].includes(status);
    })
    .filter(({ classroom, session }: any) => !attendanceKeys.has(`${objectId(classroom._id)}-${dateKey(session.scheduledFor)}`))
    .map((row: any) => buildAttendanceEvent(row));

  return {
    title: "Calendar",
    subtitle: "Use the academy calendar as the central schedule for classes, homework, tournaments, reviews, and operational follow-ups.",
    events: [...classEvents, ...attendanceEvents, ...homework.map((item: any) => buildHomeworkEvent({ item, role: "admin", batchLabel: "Academy homework" })), ...homework.map((item: any) => buildTaskEvent(item)), ...tournaments.map(buildTournamentEvent)],
  };
}

export default async function CalendarPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = ((session.user as any)?.role || "student") as "student" | "instructor" | "admin" | "sub-admin";
  const userId = (session?.user as any)?.id;
  const canJoin = await canAccessFeature("classrooms", session.user as any, "join");

  await dbConnect();

  const payload = role === "student" ? await getStudentEvents(userId, canJoin) : role === "instructor" ? await getCoachEvents(userId, canJoin) : await getAdminEvents(canJoin);

  return <CalendarWorkspace role={role} title={payload.title} subtitle={payload.subtitle} events={payload.events} />;
}
