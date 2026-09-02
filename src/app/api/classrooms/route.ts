import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Classroom } from "@/models/Classroom";
import { Course } from "@/models/Course";
import { buildGeneratedSessions, buildSessionPlan } from "@/lib/classroomSchedule";
import { syncClassroomSessionInstances } from "@/lib/classroomSessionInstances";
import { canAccessFeature, isSuperAdminSession } from "@/lib/featureAccess";
import { coachClassroomQuery, limitClassroomToCoachSessions } from "@/lib/classroomCoachAccess";
import { User } from "@/models/User";
import { recordActivity } from "@/lib/activity";
import { sendCourseAssignedEmail } from "@/lib/studentCommunicationEmails";
import { normalizeGoogleMeetUrl } from "@/lib/meetingUrl";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessFeature("classrooms", session.user as any, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await dbConnect();
  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const isSuperAdmin = await isSuperAdminSession(session.user as any);
  const visibleClassrooms =
    role === "admin" && isSuperAdmin
      ? { $or: [{ isTestClassroom: { $ne: true } }, { isTestClassroom: true, testOwner: userId }] }
      : { isTestClassroom: { $ne: true } };
  const filter = role === "admin" || role === "sub-admin"
    ? { isSessionInstance: { $ne: true }, ...visibleClassrooms }
    : role === "instructor"
      ? { ...coachClassroomQuery(userId), isSessionInstance: { $ne: true }, ...visibleClassrooms }
      : { students: userId, isSessionInstance: { $ne: true }, ...visibleClassrooms };
  const list = await Classroom.find(filter)
    .populate("coach instructor", "name email username")
    .populate("generatedSessions.substituteCoach", "name email username")
    .populate("students", "name email username isActive")
    .populate("batches", "name")
    .populate("course", "name category level")
    .sort({ classDate: 1, startDate: 1, createdAt: -1 })
    .lean();
  return NextResponse.json(role === "instructor" ? list.map((item: any) => limitClassroomToCoachSessions(item, userId)) : list);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !(await canAccessFeature("classrooms", session.user as any, "create"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await dbConnect();
    const raw = await req.json();
    const actorId = String((session.user as any).id || "");
    if ((session.user as any).role === "instructor" && String(raw.coach || "") !== actorId && !(await canAccessFeature("classrooms", session.user as any, "assign"))) {
      return NextResponse.json({ error: "You can only create a classroom assigned to yourself" }, { status: 403 });
    }
    const body = await normalizeClassroomPayload(raw, actorId);
    const created = await Classroom.create(body);
    await syncClassroomSessionInstances(String(created._id));
    await recordActivity({
      actor: actorId,
      type: "classroom.created",
      label: `Created classroom ${created.title}`,
      entityType: "Classroom",
      entityId: created._id.toString(),
      metadata: {
        title: created.title,
        classroomType: created.classroomType,
        coach: created.coach?.toString?.() || "",
        students: Array.isArray(created.students) ? created.students.length : 0,
        sessions: Array.isArray(created.generatedSessions) ? created.generatedSessions.length : 0,
        courseName: created.courseName || "",
        source: "manual_admin",
      },
    });
    await sendCourseAssignedEmail(created, req).catch((error) => console.error("Course assignment email failed", error));
    return NextResponse.json(created);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}

async function normalizeClassroomPayload(raw: any, actorId: string) {
  const classroomType = raw.classroomType === "series" ? "series" : "single";
  const seriesTopicMode = raw.seriesTopicMode === "selected" ? "selected" : "all";
  const meetingProvider = "meet";
  const title = String(raw.title || "").trim();
  if (!title) throw new Error("Class name is required.");

  const levelName = String(raw.levelName || "").trim();
  let topicName = String(raw.topicName || raw.customTopicName || "").trim();
  const durationMinutes = Math.max(15, Number(raw.durationMinutes || 60));
  const courseId = String(raw.course || "").trim() || undefined;
  const classCount = Math.max(1, Number(raw.classCount || 1));
  const selectedTopicNames = Array.isArray(raw.selectedTopicNames)
    ? raw.selectedTopicNames.map((name: any) => String(name || "").trim()).filter(Boolean)
    : [];
  if (!String(raw.coach || "").trim()) throw new Error("Select a coach for this classroom.");
  if (!(await User.exists({ _id: raw.coach, role: "instructor", isActive: { $ne: false } }))) throw new Error("The selected coach is not active.");
  if (classroomType === "single" && !String(raw.classDate || "").trim()) throw new Error("Select the class date.");
  if (classroomType === "single" && !String(raw.startTime || "").trim()) throw new Error("Select the class start time.");
  if (classroomType === "single" && Number.isNaN(new Date(raw.classDate).getTime())) throw new Error("Select a valid class date.");
  if (classroomType === "single" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw.startTime || ""))) throw new Error("Select a valid class start time.");

  let sessionPlan = Array.isArray(raw.sessionPlan) ? raw.sessionPlan : [];
  let courseName = String(raw.courseName || "").trim();
  let level = ["beginner", "intermediate", "advanced"].includes(raw.level) ? raw.level : "beginner";

  if (classroomType === "series" && !courseId) {
    throw new Error("Select a course and level for this series.");
  }
  if (classroomType === "series" && !levelName) {
    throw new Error("Select a course level for this series.");
  }

  if (courseId) {
    const course: any = await Course.findById(courseId).lean();
    if (classroomType === "series" && !course) {
      throw new Error("Select a valid course for this series.");
    }
    if (course) {
      courseName = course.name;
      level = course.level === "mixed" ? "beginner" : course.level;
      const selectedLevel = (course.levels || []).find((item: any) => String(item.name) === levelName);
      if (classroomType === "series" && !selectedLevel) {
        throw new Error("Select a valid course level for this series.");
      }
      if (selectedLevel && classroomType === "series" && seriesTopicMode === "selected") {
        const namesInOrder = selectedTopicNames.length
          ? selectedTopicNames
          : sessionPlan.map((item: any) => String(item.topicName || "").trim()).filter(Boolean);
        if (namesInOrder.length !== classCount) {
          throw new Error(`Select exactly ${classCount} topic${classCount > 1 ? "s" : ""} for this series.`);
        }
        const selectedTopics = namesInOrder.map((name: string) => {
          const topic = (selectedLevel.topics || []).find((item: any) => String(item.name) === name);
          if (!topic) throw new Error(`Topic "${name}" is not available in ${String(selectedLevel.name || "the selected level")}.`);
          return topic;
        });
        sessionPlan = buildSessionPlan(selectedTopics.map((topic: any, index: number) => ({
          name: topic.name,
          order: index + 1,
        })));
        topicName = `${sessionPlan.length} selected topics`;
      } else if (selectedLevel && !sessionPlan.length) {
        sessionPlan = buildSessionPlan((selectedLevel.topics || []).map((topic: any, index: number) => ({
          name: topic.name,
          order: Number(topic.order ?? index),
        })));
      }
    }
  } else if (classroomType === "series" && seriesTopicMode === "selected") {
    throw new Error("Select a course and level before choosing selected topics.");
  }

  const daysOfWeek = Array.isArray(raw.daysOfWeek)
    ? raw.daysOfWeek
        .map((daySlot: any) => ({
          day: Number(daySlot.day),
          slots: Array.isArray(daySlot.slots)
            ? daySlot.slots
                .filter((slot: any) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(slot.startTime || "").trim()))
                .map((slot: any) => ({
                  startTime: String(slot.startTime || "").trim(),
                  durationMinutes: Math.max(15, Number(slot.durationMinutes || durationMinutes)),
                }))
            : [],
        }))
        .filter((daySlot: any) => Number.isInteger(daySlot.day) && daySlot.day >= 0 && daySlot.day <= 6 && daySlot.slots.length)
    : [];
  if (classroomType === "series" && !String(raw.startDate || "").trim()) throw new Error("Select the series start date.");
  if (classroomType === "series" && Number.isNaN(new Date(raw.startDate).getTime())) throw new Error("Select a valid series start date.");
  if (classroomType === "series" && !daysOfWeek.length) throw new Error("Add at least one day and time slot for the series.");
  if (classroomType === "series" && daysOfWeek.some((day: any) => new Set(day.slots.map((slot: any) => slot.startTime)).size !== day.slots.length)) {
    throw new Error("Remove duplicate time slots from the same day.");
  }
  if (classroomType === "series" && seriesTopicMode === "selected" && !sessionPlan.length) throw new Error("Select a course level with at least one topic for the series.");
  if (classroomType === "series" && !sessionPlan.length && raw.endCondition === "course_complete") {
    raw.endCondition = "after_n_sessions";
  }
  if (classroomType === "series" && raw.endCondition === "on_date" && !String(raw.endDate || "").trim()) throw new Error("Select the series end date.");
  if (classroomType === "series" && raw.endCondition === "on_date" && Number.isNaN(new Date(raw.endDate).getTime())) throw new Error("Select a valid series end date.");
  if (classroomType === "series" && raw.endCondition === "on_date" && new Date(raw.endDate).getTime() < new Date(raw.startDate).getTime()) {
    throw new Error("The series end date must be on or after the start date.");
  }

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
  if (!generatedSessions.length) throw new Error("The classroom schedule did not create any sessions. Check the dates, topics, days, and times.");

  const meetingUrl = String(raw.meetingUrl || "").trim();
  const normalizedMeetingUrl = meetingUrl ? normalizeGoogleMeetUrl(meetingUrl) : "";
  if (meetingUrl && !normalizedMeetingUrl) throw new Error("Add the exact Google Meet room link, not a generic Meet start link.");

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
    meetingUrl: normalizedMeetingUrl,
    coach: raw.coach || undefined,
    instructor: raw.coach || actorId,
    students: Array.isArray(raw.students) ? raw.students.filter(Boolean) : [],
    batches: Array.isArray(raw.batches) ? raw.batches.filter(Boolean) : [],
    classDate: raw.classDate ? new Date(raw.classDate) : undefined,
    startTime: raw.startTime ? String(raw.startTime) : undefined,
    durationMinutes,
    startDate: raw.startDate ? new Date(raw.startDate) : undefined,
    endDate: raw.endDate ? new Date(raw.endDate) : undefined,
    seriesTopicMode,
    frequency: raw.frequency === "custom" ? "custom" : "weekly",
    sessionsPerWeek: daysOfWeek.reduce((total: number, day: any) => total + day.slots.length, 0),
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
