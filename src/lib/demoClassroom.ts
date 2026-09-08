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
