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
