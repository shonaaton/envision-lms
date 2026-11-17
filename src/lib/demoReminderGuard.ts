/**
 * Whether a demo is still going ahead, for the two sweeps that remind people
 * about it: the demo reminders (`processDueDemoReminders`, 1 day / 1 hour /
 * 30 / 15 minutes) and the generic class-start reminders
 * (`processDueClassSessionReminders`, T-30 / T-10), which also see demo
 * classrooms.
 *
 * A demo lives in two records - the Booking and the Classroom that backs it -
 * and it can be cancelled through either:
 *
 *   - Demo Center "Close" / CRM stage / archive  -> Booking (then the classroom)
 *   - classroom page "Cancel class" / "Cancel session" / outcome "Cancelled"
 *                                                -> Classroom only
 *
 * The demo sweep used to read only the Booking, so a demo cancelled from the
 * classroom page left the booking "confirmed" and the coach kept getting
 * reminders for a class that was no longer on. Archiving left the booking
 * "confirmed" too. Each sweep now asks both records before it sends.
 *
 * Pure on purpose - no model imports - so the rules are unit tested.
 */

/** Booking demo statuses that mean the demo will not run. */
const CLOSED_DEMO_STATUSES = ["CANCELLED", "CLOSED", "ON_HOLD"];

/** Session statuses a demo class can still be held in. */
const OPEN_SESSION_STATUSES = ["scheduled", "ongoing", "in_progress"];

type BookingLike = {
  status?: string | null;
  demoStatus?: string | null;
  archivedAt?: unknown;
} | null | undefined;

type ClassroomLike = {
  status?: string | null;
  isActive?: boolean | null;
  generatedSessions?: Array<{ status?: string | null; actualEndedAt?: unknown }> | null;
} | null | undefined;

/** Why the booking side says the demo is off, or null when it is still on. */
export function demoBookingCancelledReason(booking: BookingLike): string | null {
  if (!booking) return "booking_deleted";
  if (booking.archivedAt) return "booking_archived";
  if (String(booking.status || "") === "cancelled") return "booking_cancelled";
  if (CLOSED_DEMO_STATUSES.includes(String(booking.demoStatus || ""))) return "booking_closed";
  return null;
}

/** Why the classroom side says the demo is off, or null when it is still on. */
export function demoClassroomCancelledReason(classroom: ClassroomLike): string | null {
  if (!classroom) return null;
  const status = String(classroom.status || "");
  if (status === "cancelled") return "classroom_cancelled";
  if (status === "completed") return "classroom_completed";
  if (classroom.isActive === false) return "classroom_inactive";
  const sessions = Array.isArray(classroom.generatedSessions) ? classroom.generatedSessions : [];
  // A demo classroom with no session left to hold (the one session was
  // cancelled, or already taught / written off) has nothing to remind about.
  const hasOpenSession = sessions.some(
    (session) => OPEN_SESSION_STATUSES.includes(String(session?.status || "")) && !session?.actualEndedAt,
  );
  if (sessions.length && !hasOpenSession) return "no_open_session";
  return null;
}

/**
 * For the demo reminder sweep: why this booking must not be reminded, or null
 * to send. `classroomLinked` is true when the booking points at a classroom (or
 * a classroom points back at it); a linked classroom that no longer exists was
 * deleted, so there is no class to join.
 */
export function demoReminderBlockReason(input: {
  booking: BookingLike;
  classroom: ClassroomLike;
  classroomLinked: boolean;
}): string | null {
  const bookingReason = demoBookingCancelledReason(input.booking);
  if (bookingReason) return bookingReason;
  if (input.classroomLinked && !input.classroom) return "classroom_deleted";
  return demoClassroomCancelledReason(input.classroom);
}

/**
 * For the class-start sweep: whether a demo classroom belongs to a demo that is
 * off. Only classrooms tied to a booking are judged - a demo classroom an admin
 * created by hand, with no booking at all, keeps its reminders. One live booking
 * is enough to keep it on: a classroom can be revived for a new booking after an
 * older one was closed.
 *
 * `bookings` are the bookings linked to this classroom that still exist;
 * `referencedBookingMissing` is true when the classroom's `demoBooking` points
 * at a booking that was deleted.
 */
export function demoClassroomOffForBookings(input: {
  bookings: BookingLike[];
  referencedBookingMissing: boolean;
}): boolean {
  const live = input.bookings.filter((booking) => !demoBookingCancelledReason(booking));
  if (live.length) return false;
  return input.bookings.length > 0 || input.referencedBookingMissing;
}
