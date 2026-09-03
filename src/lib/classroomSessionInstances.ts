import { Classroom } from "@/models/Classroom";

function buildSessionInstancePayload(classroom: any, session: any) {
  return {
    title: `${classroom.title} - Session ${session.sessionNumber}`,
    description: classroom.description || "",
    classroomType: "single",
    status: session.status === "ongoing" ? "ongoing" : session.status === "cancelled" ? "cancelled" : session.status === "completed" ? "completed" : "scheduled",
    level: classroom.level,
    levelName: classroom.levelName || "",
    topicName: session.topicName || classroom.topicName || classroom.title,
    topicOrder: classroom.topicOrder || 0,
    course: classroom.course || undefined,
    courseName: classroom.courseName || "",
    useCustomTopic: classroom.useCustomTopic || false,
    meetingProvider: classroom.meetingProvider || "meet",
    meetingUrl: classroom.meetingUrl || "",
    coach: session.substituteCoach || classroom.coach || undefined,
    instructor: session.substituteCoach || classroom.instructor || classroom.coach || undefined,
    students: Array.isArray(session.students) && session.students.length ? session.students : classroom.students || [],
    batches: classroom.batches || [],
    classDate: session.scheduledFor ? new Date(session.scheduledFor) : undefined,
    startTime: session.startTime || classroom.startTime || "",
    durationMinutes: Number(session.durationMinutes || classroom.durationMinutes || 60),
    startDate: undefined,
    endDate: undefined,
    frequency: "weekly",
    sessionsPerWeek: 1,
    repeatEvery: 1,
    daysOfWeek: [],
    endCondition: "after_n_sessions",
    endAfterSessions: 1,
    sessionPlan: [
      {
        sessionNumber: Number(session.sessionNumber || 1),
        topicName: session.topicName || classroom.topicName || classroom.title,
        topicOrder: classroom.topicOrder || 0,
      },
    ],
    generatedSessions: [
      {
        ...session.toObject?.() || session,
      },
    ],
    feePerMonth: classroom.feePerMonth || 0,
    isActive: classroom.isActive !== false,
    isSessionInstance: true,
    parentClassroom: classroom._id,
    sourceSessionId: String(session._id),
    sessionDate: session.scheduledFor ? new Date(session.scheduledFor) : undefined,
  };
}

export async function syncClassroomSessionInstances(classroomId: string) {
  const classroom: any = await Classroom.findById(classroomId);
  if (!classroom || classroom.isSessionInstance) return;

  const sessions = Array.isArray(classroom.generatedSessions) ? classroom.generatedSessions : [];
  const validSessionIds = sessions.map((session: any) => String(session._id));

  for (const session of sessions) {
    const payload = buildSessionInstancePayload(classroom, session);
    await Classroom.findOneAndUpdate(
      { parentClassroom: classroom._id, sourceSessionId: String(session._id), isSessionInstance: true },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  await Classroom.deleteMany({
    parentClassroom: classroom._id,
    isSessionInstance: true,
    sourceSessionId: { $nin: validSessionIds },
  });
}

export async function deleteClassroomSessionInstances(classroomId: string) {
  await Classroom.deleteMany({ parentClassroom: classroomId, isSessionInstance: true });
}
