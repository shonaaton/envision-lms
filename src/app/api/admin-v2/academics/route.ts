import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { deriveScheduledSessionStatus, flattenScheduledSessions } from "@/lib/classroomSessions";
import { Classroom } from "@/models/Classroom";
import { Course } from "@/models/Course";
import { AssignmentTemplate } from "@/models/AssignmentTemplate";
import { Attendance } from "@/models/Attendance";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

async function requireAdminLike() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  return role === "admin" || role === "sub-admin" ? session : null;
}

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function dateKey(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function sessionStart(classroom: any, session: any) {
  return session?.scheduledFor || classroom?.classDate || classroom?.startDate || classroom?.createdAt;
}

export async function GET() {
  const session = await requireAdminLike();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();
  const [classrooms, courses, templates, attendance, students, coaches] = await Promise.all([
    Classroom.find({ isSessionInstance: { $ne: true } })
      .populate("coach instructor", "name email username")
      .populate("generatedSessions.substituteCoach", "name email username")
      .populate("students", "name email username")
      .populate("batches", "name level")
      .populate("course", "name category level")
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean(),
    Course.find({ isActive: { $ne: false } }).sort({ name: 1 }).limit(300).lean(),
    AssignmentTemplate.find({ isActive: { $ne: false } })
      .populate("course", "name")
      .populate("defaultBatches", "name")
      .sort({ updatedAt: -1 })
      .limit(300)
      .lean(),
    Attendance.find({}).sort({ sessionDate: -1 }).limit(1000).lean(),
    User.find({ role: "student", isActive: { $ne: false } }, { name: 1, email: 1, username: 1 }).sort({ name: 1 }).limit(1000).lean(),
    User.find({ role: "instructor", isActive: { $ne: false } }, { name: 1, email: 1, username: 1 }).sort({ name: 1 }).limit(500).lean(),
  ]);

  const attendanceBySession = new Set(attendance.map((item: any) => `${objectId(item.classroom)}-${String(item.scheduledSessionId || "")}-${dateKey(item.sessionDate)}`));
  const classroomRows = classrooms.map((classroom: any) => {
    const sessions = flattenScheduledSessions([classroom]).sort((a: any, b: any) => new Date(sessionStart(a.classroom, a.session)).getTime() - new Date(sessionStart(b.classroom, b.session)).getTime());
    const upcoming = sessions.find(({ session }: any) => !["completed", "cancelled", "missed", "rescheduled"].includes(deriveScheduledSessionStatus(session, new Date()))) || sessions[0];
    const selectedSession = upcoming?.session || classroom.generatedSessions?.[0] || {};
    const sessionId = String(selectedSession?._id || "");
    const scheduledFor = sessionStart(classroom, selectedSession);
    const attendanceKey = `${objectId(classroom._id)}-${sessionId}-${dateKey(scheduledFor)}`;
    return {
      classroom_id: objectId(classroom._id),
      title: classroom.title,
      topic: selectedSession?.topicName || classroom.topicName || classroom.title,
      batch_id: objectId(classroom.batches?.[0]?._id),
      batch_name: classroom.batches?.map((batch: any) => batch.name).filter(Boolean).join(", ") || "-",
      status: deriveScheduledSessionStatus(selectedSession, new Date()) || classroom.status,
      start_time: scheduledFor ? new Date(scheduledFor).toISOString() : "",
      session_id: sessionId,
      live_url: `/classrooms/${objectId(classroom._id)}/live${sessionId ? `?session=${sessionId}` : ""}`,
      summary_url: `/classrooms/${objectId(classroom._id)}/summary${sessionId ? `?session=${sessionId}` : ""}`,
      coach_name: selectedSession?.substituteCoach?.name || classroom.coach?.name || classroom.instructor?.name || "Unassigned",
      student_count: Number((classroom.students || []).length),
      students: (classroom.students || []).map((student: any) => ({ student_id: objectId(student._id), name: student.name, email: student.email })),
      attendance_status: attendanceBySession.has(attendanceKey) ? "completed" : "pending",
      meeting_url: classroom.meetingUrl || "",
    };
  });

  const batchCountsByCourse = new Map<string, Set<string>>();
  classrooms.forEach((classroom: any) => {
    const courseId = objectId(classroom.course?._id || classroom.course);
    if (!courseId) return;
    const set = batchCountsByCourse.get(courseId) || new Set<string>();
    (classroom.batches || []).forEach((batch: any) => set.add(objectId(batch._id)));
    batchCountsByCourse.set(courseId, set);
  });

  const courseCards = courses.map((course: any) => ({
    course_id: objectId(course._id),
    name: course.name,
    category: course.category || "General",
    level: course.level,
    total_sessions: Number(course.totalSessions || (course.levels || []).reduce((sum: number, level: any) => sum + Number(level.sessionCount || level.topics?.length || 0), 0)),
    level_count: Number((course.levels || []).length),
    topic_count: Number((course.levels || []).reduce((sum: number, level: any) => sum + Number((level.topics || []).length), 0)),
    linked_batches: batchCountsByCourse.get(objectId(course._id))?.size || 0,
  }));

  const templateCards = templates.map((template: any) => ({
    template_id: objectId(template._id),
    title: template.title,
    course_level: template.levelName || template.level || "",
    course_name: template.course?.name || template.courseName || "",
    topic_name: template.topicName,
    pgn_source: template.source?.kind === "pgn_import" ? (template.source?.fileNames || []).join(", ") || "PGN import" : "",
    source_kind: template.source?.kind || "manual",
    auto_assign_policy: template.autoAssign ? "Auto assign on" : "Manual only",
    link_status: template.linkStatus || "unlinked",
    activities_count: Number((template.activities || []).length + (template.puzzles || []).length),
    updated_at: template.updatedAt ? new Date(template.updatedAt).toISOString() : "",
    edit_url: `/admin/homework-templates/${objectId(template._id)}/edit`,
    preview_url: `/admin/homework-templates/${objectId(template._id)}/preview`,
  }));

  return NextResponse.json({
    classrooms: classroomRows,
    courses: courseCards,
    templates: templateCards,
    students: students.map((student: any) => ({ student_id: objectId(student._id), name: student.name, email: student.email })),
    coaches: coaches.map((coach: any) => ({ coach_id: objectId(coach._id), name: coach.name, email: coach.email })),
  });
}

