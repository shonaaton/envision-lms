import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Attendance } from "@/models/Attendance";
import { recordActivity } from "@/lib/activity";
import { consumeAttendanceCredit } from "@/lib/fees";
import { Classroom } from "@/models/Classroom";
import { actualSessionMinutes, punctualityBreakdown, scheduledPaymentMinutes } from "@/lib/teachingStats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const url = new URL(req.url);
  const classroom = url.searchParams.get("classroom");
  const sessionDate = url.searchParams.get("sessionDate");
  const sessionId = url.searchParams.get("sessionId");
  const filter: any = {};
  if (classroom) filter.classroom = classroom;
  if (sessionId) filter.scheduledSessionId = sessionId;
  if (sessionDate) filter.sessionDate = new Date(sessionDate);
  const list = await Attendance.find(filter).sort({ sessionDate: -1 }).limit(100).lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session || (role !== "instructor" && role !== "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { classroom, sessionDate, sessionId, records, coach, coachStatus, teachingMinutes, metadata } = await req.json();
  if (!classroom || !sessionDate) return NextResponse.json({ error: "missing fields" }, { status: 400 });
  await dbConnect();
  await Attendance.collection.dropIndex("classroom_1_sessionDate_1").catch(() => undefined);
  const normalizedDate = new Date(sessionDate);
  const classroomDoc: any = await Classroom.findById(classroom);
  const target = sessionId ? classroomDoc?.generatedSessions?.id?.(sessionId) : null;
  const scheduledMinutes = target ? scheduledPaymentMinutes(target, classroomDoc) : Math.max(0, Number(classroomDoc?.durationMinutes || teachingMinutes || 0));
  const actualMinutes = target
    ? Number(target.actualTeachingMinutes || actualSessionMinutes(target))
    : Math.max(0, Number(metadata?.summary?.actualTeachingMinutes || 0));
  const punctualityScore = target ? Number(target.punctualityScore || punctualityBreakdown(target, classroomDoc).punctualityScore) : 0;
  const doc = await Attendance.findOneAndUpdate(
    { classroom, scheduledSessionId: sessionId || "", sessionDate: normalizedDate },
    {
      records,
      markedBy: (session.user as any).id,
      scheduledSessionId: sessionId || "",
      coach,
      coachStatus: coachStatus || "pending",
      teachingMinutes: scheduledMinutes,
      actualTeachingMinutes: actualMinutes,
      punctualityScore,
      metadata: {
        ...(metadata || {}),
        scheduledTeachingMinutes: scheduledMinutes,
        actualTeachingMinutes: actualMinutes,
        punctualityScore,
      },
    },
    { upsert: true, new: true }
  );
  await recordActivity({
    actor: (session.user as any).id,
    type: "attendance.marked",
    label: `Marked attendance for ${records?.length ?? 0} students`,
    entityType: "Attendance",
    entityId: doc._id.toString(),
    metadata: { classroom, sessionDate, sessionId, records: records?.length ?? 0 },
  });
  for (const record of records || []) {
    if (record?.student && (record.status === "present" || record.status === "late")) {
      await consumeAttendanceCredit(record.student, doc._id.toString());
    }
  }
  if (sessionId) {
    if (target) {
      target.attendanceMarkedAt = new Date();
      target.coachAttendanceStatus = coachStatus || target.coachAttendanceStatus || "present";
      target.teachingMinutes = scheduledMinutes;
      target.actualTeachingMinutes = actualMinutes;
      target.punctualityScore = punctualityScore;
      target.summary = {
        ...(target.summary || {}),
        ...(metadata?.summary || {}),
        scheduledTeachingMinutes: scheduledMinutes,
        actualTeachingMinutes: actualMinutes,
        punctualityScore,
      };
      await classroomDoc.save();
    }
  }
  return NextResponse.json(doc);
}
