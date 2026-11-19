import { rosterForSession } from "@/lib/classroomStudentExits";
import { isCoachNoShowExpired, notifyCoachNoShowIfThreshold, recalculateFutureSessionTopics } from "@/lib/classroomLifecycle";
import { dbConnect } from "@/lib/db";
import { raiseCoachNoShowRulingTask } from "@/lib/tasks/taskTriggers";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { ClassroomSession } from "@/models/ClassroomLive";

/**
 * Recording a class as a coach no-show when a student came and the coach
 * never did.
 *
 * The live room used to do this only on a poll it received after the grace
 * period (class end + 20 minutes). A student who joined, waited and left
 * before then sent no such poll, so the class sat unmarked and never reached
 * the coach no-show ruling. The sweep below closes those rooms on a timer; the
 * live room still calls the same function when it gets there first.
 */

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

const COACH_ROLES = new Set(["admin", "sub-admin", "instructor"]);

/** Statuses a class can still be in when nobody has recorded what happened. */
const UNRECORDED = new Set(["scheduled", "ongoing", "in_progress"]);

export function liveRoomHadCoach(live: any) {
  return (live?.participants || []).some((participant: any) => COACH_ROLES.has(String(participant.role || "")));
}

export function liveRoomStudentIds(live: any) {
  return new Set<string>(
    (live?.participants || [])
      .filter((participant: any) => participant.role === "student")
      .map((participant: any) => idOf(participant.user))
      .filter(Boolean)
  );
}

/**
 * Should this room be closed as a coach no-show now? Pure, so it is tested.
 * Only when the grace has run out, no coach or admin ever entered, and the
 * class has no outcome yet - a class someone already marked is left alone.
 */
export function isCoachNoShowDue(input: { live: any; scheduledSession: any; now?: Date; requireStudent?: boolean }) {
  const { live, scheduledSession } = input;
  if (!live || live.status === "ended" || !scheduledSession) return false;
  if (!isCoachNoShowExpired(scheduledSession, input.now || new Date())) return false;
  if (liveRoomHadCoach(live)) return false;
  if (input.requireStudent && liveRoomStudentIds(live).size === 0) return false;
  if (scheduledSession.actualEndedAt) return false;
  return UNRECORDED.has(String(scheduledSession.status || "scheduled"));
}

/**
 * Record the class as a coach no-show: the register (students who waited vs
 * did not join), the session outcome (no charge, topic not consumed), the room
 * locked, the monthly threshold alert, and the ruling task for admins.
 * Returns false when the class had already been recorded by someone else.
 */
export async function closeAsCoachNoShow(input: { classroomId: string; liveId: string; scheduledSessionId: string }) {
  const classroomDoc: any = await Classroom.findById(input.classroomId);
  const target = classroomDoc?.generatedSessions?.id?.(input.scheduledSessionId);
  if (!classroomDoc || !target) return false;
  if (target.actualEndedAt || !UNRECORDED.has(String(target.status || "scheduled"))) return false;

  // Claim the room first: of two closers (a sweep and a late poll), only the
  // one that flips it to ended goes on to write the register.
  const claimed = await ClassroomSession.findOneAndUpdate(
    { _id: input.liveId, status: { $ne: "ended" } },
    { $set: { status: "ended", endedAt: new Date(), locked: true } },
    { new: true }
  ).lean();
  if (!claimed) return false;

  const coachId = idOf(target.substituteCoach || classroomDoc.coach || classroomDoc.instructor);
  const joined = liveRoomStudentIds(claimed);
  const sessionDate = new Date(target.scheduledFor);
  await Attendance.findOneAndUpdate(
    { classroom: input.classroomId, scheduledSessionId: input.scheduledSessionId, sessionDate },
    {
      classroom: input.classroomId,
      scheduledSessionId: input.scheduledSessionId,
      sessionDate,
      coach: coachId || undefined,
      coachStatus: "coach_no_show",
      teachingMinutes: 0,
      actualTeachingMinutes: 0,
      punctualityScore: 0,
      records: rosterForSession(classroomDoc, target).map((student: any) => {
        const studentId = idOf(student);
        return {
          student: studentId,
          status: joined.has(studentId) ? "coach_no_show" : "not_joined",
          note: joined.has(studentId) ? "Student waited, coach did not join" : "Student did not join before coach no-show auto-close",
        };
      }),
      metadata: {
        classOutcome: "coach_no_show",
        topicCompleted: false,
        creditPolicy: "no_charge",
        autoClosed: true,
        graceMinutes: 20,
        liveSessionId: input.liveId,
      },
    },
    { upsert: true, new: true }
  );

  target.status = "coach_no_show";
  target.coachAttendanceStatus = "coach_no_show";
  target.actualEndedAt = new Date();
  target.actualTeachingMinutes = 0;
  target.teachingMinutes = 0;
  target.attendanceMarkedAt = new Date();
  target.summary = { ...(target.summary || {}), classOutcome: "coach_no_show", topicCompleted: false, creditPolicy: "no_charge", autoClosed: true };
  await recalculateFutureSessionTopics(classroomDoc);
  await classroomDoc.save();

  await notifyCoachNoShowIfThreshold(coachId, { classroom: input.classroomId, sessionId: input.scheduledSessionId }).catch(() => 0);
  if (classroomDoc.classroomType !== "demo") {
    await raiseCoachNoShowRulingTask({ classroom: classroomDoc, sessionId: input.scheduledSessionId, scheduledFor: target.scheduledFor }).catch(() => null);
  }
  return true;
}

/** How far back the sweep looks. Older rooms were long since dealt with. */
const LOOKBACK_MS = 3 * 24 * 60 * 60_000;
const SWEEP_LIMIT = 200;

/**
 * Close every live room a student entered and no coach ever did, once its
 * class is past the grace period. Demo classes are included: a demo the coach
 * missed is recorded the same way (and is never billed or ruled on).
 */
export async function processCoachNoShowSweep(now = new Date()) {
  await dbConnect();
  const rooms: any[] = await ClassroomSession.find({
    status: { $ne: "ended" },
    createdAt: { $gte: new Date(now.getTime() - LOOKBACK_MS) },
    "participants.role": "student",
  })
    .select("classroom scheduledSessionId status participants.role participants.user")
    .limit(SWEEP_LIMIT)
    .lean();

  let closed = 0;
  for (const live of rooms) {
    if (liveRoomHadCoach(live)) continue;
    const classroom: any = await Classroom.findById(live.classroom)
      .select("generatedSessions._id generatedSessions.status generatedSessions.scheduledFor generatedSessions.startTime generatedSessions.durationMinutes generatedSessions.actualEndedAt classDate startTime durationMinutes")
      .lean();
    const scheduledSession = (classroom?.generatedSessions || []).find((session: any) => idOf(session._id) === String(live.scheduledSessionId));
    if (!isCoachNoShowDue({ live, scheduledSession, now, requireStudent: true })) continue;
    const done = await closeAsCoachNoShow({ classroomId: idOf(live.classroom), liveId: idOf(live._id), scheduledSessionId: String(live.scheduledSessionId) })
      .catch((error) => {
        console.error("Coach no-show auto-close failed", { live: idOf(live._id), error });
        return false;
      });
    if (done) closed += 1;
  }
  return { checked: rooms.length, closed };
}
