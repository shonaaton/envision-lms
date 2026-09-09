import { academyTimeOfDay } from "@/lib/academyTime";
import { ensureDemoHomework } from "@/lib/demoHomework";
import { Booking } from "@/models/Booking";
import { Classroom } from "@/models/Classroom";

/**
 * Cancel the demo classroom(s) belonging to closed demo bookings.
 *
 * Closing a demo used to update only the Booking, leaving its classroom sitting
 * in the schedule as an upcoming class for a lead that is no longer active - the
 * coach still saw it, and it still counted as upcoming work. Both close paths
 * (the Demo Center button and a CRM stage change) route through here so they
 * cannot drift apart again.
 *
 * Classrooms are cancelled rather than deleted so the history of what was
 * scheduled survives, and a delivered demo is never retroactively cancelled.
 */
const OPEN_SESSION_STATUSES = ["scheduled", "ongoing", "in_progress"];

/**
 * Whether a demo is booked rather than still waiting on an admin.
 *
 * The Demo Center sorts a booking into Booked/Upcoming on this rule, so editing
 * one has to consult the same rule to decide whether the edit is a reschedule or
 * an assignment. When the two were written out separately, saving a new time
 * pushed a confirmed demo back into Requested and the admin had to approve it a
 * second time to get it back.
 */
export function isConfirmedDemo(booking: { status?: string; demoStatus?: string } | null | undefined) {
  return booking?.demoStatus === "CLASSROOM_CREATED" || booking?.status === "confirmed";
}

export async function cancelDemoClassrooms(input: { bookingIds: Array<unknown>; reason?: string }) {
  const bookingIds = (input.bookingIds || []).filter(Boolean);
  if (!bookingIds.length) return { cancelled: 0 };

  // A demo classroom can be reached either way round: the booking points at the
  // classroom, and the classroom points back at the booking. Older records may
  // only have one of the two, so match on both.
  const bookings: any[] = await Booking.find({ _id: { $in: bookingIds } })
    .select("classroom")
    .lean();
  const classroomIds = bookings.map((booking) => booking.classroom).filter(Boolean);

  const result = await Classroom.updateMany(
    {
      $or: [{ demoBooking: { $in: bookingIds } }, ...(classroomIds.length ? [{ _id: { $in: classroomIds } }] : [])],
      // Never reopen or retroactively cancel a demo that already happened.
      status: { $nin: ["completed", "cancelled"] },
    },
    {
      $set: {
        status: "cancelled",
        isActive: false,
        "generatedSessions.$[session].status": "cancelled",
      },
    },
    { arrayFilters: [{ "session.status": { $in: OPEN_SESSION_STATUSES } }] }
  );

  return { cancelled: result.modifiedCount ?? 0 };
}

/**
 * Point a demo classroom's scheduled session at the approved time.
 *
 * A demo classroom holds one live session at a time, and that session - not the
 * classroom's own date - is what the join window, the live room and attendance
 * are keyed on. So a re-approval either moves the pending session, or, when the
 * previous one was already used, starts a fresh one.
 *
 * Rescheduling a missed demo MUST create a new session rather than revive the
 * old one: the old session's live room is ended and locked, and its attendance
 * record already exists, so reusing its id would hand the student and coach a
 * class they are bounced out of and an assessment that never opens. Reusing it
 * would also erase the record that the demo was missed.
 */
export function syncDemoSession(
  classroom: any,
  { start, startTimeLabel, durationMinutes }: { start: Date; startTimeLabel: string; durationMinutes: number }
) {
  const sessions = Array.isArray(classroom.generatedSessions) ? classroom.generatedSessions : [];
  const pending = sessions.find((item: any) => isPendingDemoSession(item));
  if (pending) {
    pending.scheduledFor = start;
    pending.startTime = startTimeLabel;
    pending.durationMinutes = durationMinutes;
    pending.status = "scheduled";
    return;
  }
  classroom.generatedSessions = [
    ...sessions,
    {
      sessionNumber: sessions.length + 1,
      topicName: "Demo assessment class",
      topicOrder: 0,
      scheduledFor: start,
      startTime: startTimeLabel,
      durationMinutes,
      status: "scheduled",
    },
  ];
}

/**
 * A session that has not been taught, attended or written off yet - the only
 * kind that can simply be moved to a new time.
 */
function isPendingDemoSession(session: any) {
  if (!session) return false;
  if (!["scheduled", "ongoing", "in_progress"].includes(String(session.status || ""))) return false;
  return !session.actualStartedAt && !session.actualEndedAt && !session.attendanceMarkedAt;
}

/**
 * Create or move the demo classroom that backs a demo booking.
 *
 * Both the student and the coach reach a demo class through a Classroom, not
 * through the Booking - the join button, the live room, attendance and the demo
 * homework all hang off it. It used to be built only when an admin approved the
 * demo, so assigning a coach left both sides with nothing to open, and changing
 * the time afterwards moved the booking while the classroom kept pointing at the
 * old slot. Every path that fixes a coach and a time for a demo now goes through
 * here instead, so the classroom always matches the booking.
 */
export async function upsertDemoClassroom(input: {
  booking: any;
  coachId: unknown;
  studentId: unknown;
  start: Date;
  durationMinutes: number;
  meetingUrl?: string;
  studentName?: string;
  levelName?: string;
  withHomework?: boolean;
}) {
  const { booking, coachId, studentId, start, durationMinutes } = input;
  if (!booking?._id || !coachId || !studentId || Number.isNaN(start.getTime())) return null;
  // Classroom.startTime is read back as academy wall-clock time, so it has to be
  // written in academy time - toTimeString() would record the server's timezone
  // and shift the student's join window by the server offset.
  const startTimeLabel = academyTimeOfDay(start);
  const meetingUrl = String(input.meetingUrl || "").trim();
  const studentName = input.studentName || booking.student?.name || "Student";

  let classroom: any = booking.classroom ? await Classroom.findById(booking.classroom) : null;
  if (!classroom) classroom = await Classroom.findOne({ demoBooking: booking._id });

  if (!classroom) {
    classroom = await Classroom.create({
      title: `${studentName} - Demo Class`,
      description: booking.notes || "Demo class.",
      classroomType: "demo",
      demoBooking: booking._id,
      status: "scheduled",
      level: "beginner",
      levelName: input.levelName || booking.level || booking.student?.studentLevel || "Demo",
      topicName: "Demo assessment class",
      meetingProvider: "meet",
      meetingUrl,
      coach: coachId,
      instructor: coachId,
      students: [studentId],
      classDate: start,
      startTime: startTimeLabel,
      durationMinutes,
      generatedSessions: [{
        sessionNumber: 1,
        topicName: "Demo assessment class",
        topicOrder: 0,
        scheduledFor: start,
        startTime: startTimeLabel,
        durationMinutes,
        status: "scheduled",
      }],
      isActive: true,
    });
  } else {
    classroom.classroomType = "demo";
    classroom.demoBooking = booking._id;
    // Revive it if closing the demo had cancelled it - scheduling here means the
    // class is going ahead again.
    classroom.status = "scheduled";
    classroom.isActive = true;
    classroom.coach = coachId;
    classroom.instructor = coachId;
    classroom.classDate = start;
    classroom.startTime = startTimeLabel;
    classroom.durationMinutes = durationMinutes;
    if (meetingUrl) classroom.meetingUrl = meetingUrl;
    if (!(classroom.students || []).some((student: any) => String(student) === String(studentId))) {
      classroom.students = [...(classroom.students || []), studentId];
    }
    // The scheduled session is what the join window is built from, so it has to
    // follow the new time too - otherwise the classroom shows the new time while
    // the join button still tracks the old one.
    syncDemoSession(classroom, { start, startTimeLabel, durationMinutes });
    await classroom.save();
  }

  if (input.withHomework !== false) {
    // The demo student should meet homework the same way an enrolled student
    // does, so the starter assignment follows the classroom rather than waiting
    // for a coach to build one before the demo.
    await ensureDemoHomework({
      classroomId: classroom._id,
      coachId,
      studentId,
      dueAt: new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000),
    }).catch((error) => console.error("Demo homework seeding failed", error));
  }

  return classroom;
}
