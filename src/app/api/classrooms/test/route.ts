import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/featureAccess";
import { dbConnect } from "@/lib/db";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { ClassroomChatMessage, ClassroomSession, LiveQuestion, LiveQuestionResponse } from "@/models/ClassroomLive";

export const dynamic = "force-dynamic";

function clockValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function clearSandboxRecords(classroomId: string) {
  const questions = await LiveQuestion.find({ classroom: classroomId }).select("_id").lean();
  const questionIds = questions.map((question: any) => question._id);
  await Promise.all([
    Attendance.deleteMany({ classroom: classroomId }),
    ClassroomSession.deleteMany({ classroom: classroomId }),
    ClassroomChatMessage.deleteMany({ classroom: classroomId }),
    questionIds.length ? LiveQuestionResponse.deleteMany({ question: { $in: questionIds } }) : Promise.resolve(),
    LiveQuestion.deleteMany({ classroom: classroomId }),
  ]);
}

export async function POST() {
  const session = await requireSuperAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await dbConnect();

  const userId = (session.user as any).id;
  const ownerName = (session.user as any).name || "Super Admin";
  const now = new Date();
  const liveStart = new Date(now.getTime() - 5 * 60 * 1000);
  const nextSession = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const reviewSession = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startTime = clockValue(liveStart);

  let classroom: any = await Classroom.findOne({ isTestClassroom: true, testOwner: userId });
  if (!classroom) {
    classroom = new Classroom({
      isTestClassroom: true,
      testOwner: userId,
    });
  }

  classroom.set({
    title: `Test Classroom - ${ownerName}`,
    description: "Super Admin sandbox for testing live classroom features.",
    classroomType: "series",
    status: "scheduled",
    level: "intermediate",
    levelName: "Sandbox",
    topicName: "Live Classroom Sandbox",
    topicOrder: 0,
    course: undefined,
    courseName: "Sandbox",
    useCustomTopic: true,
    meetingProvider: "meet",
    meetingUrl: "",
    coach: userId,
    instructor: userId,
    students: [],
    batches: [],
    classDate: liveStart,
    startTime,
    durationMinutes: 60,
    startDate: liveStart,
    endDate: reviewSession,
    frequency: "custom",
    sessionsPerWeek: 1,
    repeatEvery: 1,
    daysOfWeek: [{ day: liveStart.getDay(), slots: [{ startTime, durationMinutes: 60 }] }],
    endCondition: "after_n_sessions",
    endAfterSessions: 3,
    sessionPlan: [
      { sessionNumber: 1, topicName: "Live Board Sandbox", topicOrder: 1 },
      { sessionNumber: 2, topicName: "PGN and Quiz Sandbox", topicOrder: 2 },
      { sessionNumber: 3, topicName: "Summary and Attendance Sandbox", topicOrder: 3 },
    ],
    generatedSessions: [
      {
        sessionNumber: 1,
        topicName: "Live Board Sandbox",
        scheduledFor: liveStart,
        startTime,
        durationMinutes: 60,
        status: "scheduled",
        isExtra: false,
      },
      {
        sessionNumber: 2,
        topicName: "PGN and Quiz Sandbox",
        scheduledFor: nextSession,
        startTime: clockValue(nextSession),
        durationMinutes: 60,
        status: "scheduled",
        isExtra: false,
      },
      {
        sessionNumber: 3,
        topicName: "Summary and Attendance Sandbox",
        scheduledFor: reviewSession,
        startTime: clockValue(reviewSession),
        durationMinutes: 60,
        status: "scheduled",
        isExtra: false,
      },
    ],
    feePerMonth: 0,
    isActive: true,
    isSessionInstance: false,
    parentClassroom: undefined,
    sourceSessionId: undefined,
    sessionDate: undefined,
    isTestClassroom: true,
    testOwner: userId,
  });

  await classroom.save();
  await clearSandboxRecords(String(classroom._id));

  return NextResponse.json({
    classroomId: String(classroom._id),
    sessionId: String(classroom.generatedSessions?.[0]?._id || ""),
  });
}
