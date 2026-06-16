import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { Course } from "@/models/Course";
import { buildGeneratedSessions, buildSessionPlan } from "@/lib/classroomSchedule";
import { syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const filter = role === "admin"
    ? { isSessionInstance: { $ne: true } }
    : role === "instructor"
      ? { instructor: userId, isSessionInstance: { $ne: true } }
      : { students: userId, isSessionInstance: { $ne: true } };
  const list = await Classroom.find(filter)
    .populate("coach instructor", "name email username")
    .populate("students", "name email username isActive")
    .populate("batches", "name")
    .populate("course", "name category level")
    .sort({ classDate: 1, startDate: 1, createdAt: -1 })
    .lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "instructor" && role !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await dbConnect();
    const raw = await req.json();
    const body = await normalizeClassroomPayload(raw, (session.user as any).id);
    const created = await Classroom.create(body);
    await syncClassroomSessionInstances(String(created._id));
    return NextResponse.json(created);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}

async function normalizeClassroomPayload(raw: any, actorId: string) {
  const classroomType = raw.classroomType === "series" ? "series" : "single";
  const meetingProvider = "meet";
  const title = String(raw.title || "").trim();
  if (!title) throw new Error("Class name is required.");

  const levelName = String(raw.levelName || "").trim();
  const topicName = String(raw.topicName || raw.customTopicName || "").trim();
  const durationMinutes = Math.max(15, Number(raw.durationMinutes || 60));
  const courseId = String(raw.course || "").trim() || undefined;

  let sessionPlan = Array.isArray(raw.sessionPlan) ? raw.sessionPlan : [];
  let courseName = String(raw.courseName || "").trim();
  let level = ["beginner", "intermediate", "advanced"].includes(raw.level) ? raw.level : "beginner";

  if (courseId) {
    const course: any = await Course.findById(courseId).lean();
    if (course) {
      courseName = course.name;
      level = course.level === "mixed" ? "beginner" : course.level;
      const selectedLevel = (course.levels || []).find((item: any) => String(item.name) === levelName) || course.levels?.[0];
      if (selectedLevel && !sessionPlan.length) {
        sessionPlan = buildSessionPlan((selectedLevel.topics || []).map((topic: any, index: number) => ({
          name: topic.name,
          order: Number(topic.order ?? index),
        })));
      }
    }
  }

  const daysOfWeek = Array.isArray(raw.daysOfWeek)
    ? raw.daysOfWeek
        .map((daySlot: any) => ({
          day: Number(daySlot.day),
          slots: Array.isArray(daySlot.slots)
            ? daySlot.slots
                .filter((slot: any) => String(slot.startTime || "").trim())
                .map((slot: any) => ({
                  startTime: String(slot.startTime || "").trim(),
                  durationMinutes: Math.max(15, Number(slot.durationMinutes || durationMinutes)),
                }))
            : [],
        }))
        .filter((daySlot: any) => Number.isFinite(daySlot.day) && daySlot.slots.length)
    : [];

  const generatedSessions = buildGeneratedSessions({
    classroomType,
    title,
    topicName,
    topicOrder: Number(raw.topicOrder || 0),
    classDate: raw.classDate,
    startTime: raw.startTime,
    durationMinutes,
    startDate: raw.startDate,
    endDate: raw.endDate,
    frequency: raw.frequency === "custom" ? "custom" : "weekly",
    daysOfWeek,
    endCondition: ["on_date", "after_n_sessions", "course_complete", "never"].includes(raw.endCondition) ? raw.endCondition : "on_date",
    endAfterSessions: Number(raw.endAfterSessions || 0) || undefined,
    sessionPlan,
  });

  return {
    title,
    description: "",
    classroomType,
    status: "scheduled",
    level,
    levelName,
    topicName,
    topicOrder: Number(raw.topicOrder || 0),
    course: courseId,
    courseName,
    useCustomTopic: !!raw.useCustomTopic,
    meetingProvider,
    meetingUrl: String(raw.meetingUrl || "").trim(),
    coach: raw.coach || undefined,
    instructor: raw.coach || actorId,
    students: Array.isArray(raw.students) ? raw.students.filter(Boolean) : [],
    batches: Array.isArray(raw.batches) ? raw.batches.filter(Boolean) : [],
    classDate: raw.classDate ? new Date(raw.classDate) : undefined,
    startTime: raw.startTime ? String(raw.startTime) : undefined,
    durationMinutes,
    startDate: raw.startDate ? new Date(raw.startDate) : undefined,
    endDate: raw.endDate ? new Date(raw.endDate) : undefined,
    frequency: raw.frequency === "custom" ? "custom" : "weekly",
    sessionsPerWeek: Math.max(1, Number(raw.sessionsPerWeek || 1)),
    repeatEvery: 1,
    daysOfWeek,
    endCondition: ["on_date", "after_n_sessions", "course_complete", "never"].includes(raw.endCondition) ? raw.endCondition : "on_date",
    endAfterSessions: Number(raw.endAfterSessions || 0) || undefined,
    sessionPlan,
    generatedSessions,
    feePerMonth: 0,
    isActive: true,
  };
}
