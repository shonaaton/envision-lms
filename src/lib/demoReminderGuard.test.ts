import { describe, expect, it } from "vitest";
import { demoBookingCancelledReason, demoClassroomCancelledReason, demoClassroomOffForBookings, demoReminderBlockReason } from "@/lib/demoReminderGuard";

const liveBooking = { status: "confirmed", demoStatus: "CLASSROOM_CREATED", archivedAt: null };
const liveClassroom = { status: "scheduled", isActive: true, generatedSessions: [{ status: "scheduled" }] };

describe("demoReminderBlockReason", () => {
  it("sends for a demo that is still on", () => {
    expect(demoReminderBlockReason({ booking: liveBooking, classroom: liveClassroom, classroomLinked: true })).toBeNull();
  });

  it("blocks when the demo class was cancelled from the classroom page (booking still confirmed)", () => {
    // Regression: "Cancel class" on the classroom page cancels only the
    // Classroom, so the booking stayed confirmed and the coach kept getting the
    // 1-day and 30-minute demo reminders.
    const cancelledClass = {
      status: "cancelled",
      isActive: true,
      generatedSessions: [{ status: "cancelled" }],
    };
    expect(demoReminderBlockReason({ booking: liveBooking, classroom: cancelledClass, classroomLinked: true })).toBe("classroom_cancelled");
  });

  it("blocks when only the demo session was cancelled", () => {
    const sessionCancelled = { status: "scheduled", isActive: true, generatedSessions: [{ status: "cancelled" }] };
    expect(demoReminderBlockReason({ booking: liveBooking, classroom: sessionCancelled, classroomLinked: true })).toBe("no_open_session");
  });

  it("blocks an archived demo even though its booking still reads confirmed", () => {
    expect(demoReminderBlockReason({ booking: { ...liveBooking, archivedAt: new Date() }, classroom: liveClassroom, classroomLinked: true })).toBe("booking_archived");
  });

  it("blocks closed or cancelled bookings", () => {
    expect(demoReminderBlockReason({ booking: { ...liveBooking, status: "cancelled" }, classroom: liveClassroom, classroomLinked: true })).toBe("booking_cancelled");
    for (const demoStatus of ["CANCELLED", "CLOSED", "ON_HOLD"]) {
      expect(demoReminderBlockReason({ booking: { ...liveBooking, demoStatus }, classroom: liveClassroom, classroomLinked: true })).toBe("booking_closed");
    }
  });

  it("blocks when the linked classroom was deleted", () => {
    expect(demoReminderBlockReason({ booking: liveBooking, classroom: null, classroomLinked: true })).toBe("classroom_deleted");
  });

  it("still sends for an approved demo that has no classroom yet", () => {
    expect(demoReminderBlockReason({ booking: { ...liveBooking, demoStatus: "APPROVED" }, classroom: null, classroomLinked: false })).toBeNull();
  });

  it("sends for a rebooked demo: an old written-off session plus a new scheduled one", () => {
    const rebooked = { status: "scheduled", isActive: true, generatedSessions: [{ status: "student_no_show", actualEndedAt: new Date() }, { status: "scheduled" }] };
    expect(demoReminderBlockReason({ booking: liveBooking, classroom: rebooked, classroomLinked: true })).toBeNull();
  });
});

describe("demoClassroomCancelledReason", () => {
  it("treats inactive and completed classrooms as off", () => {
    expect(demoClassroomCancelledReason({ ...liveClassroom, isActive: false })).toBe("classroom_inactive");
    expect(demoClassroomCancelledReason({ ...liveClassroom, status: "completed" })).toBe("classroom_completed");
  });

  it("treats a session that already ended as not open", () => {
    expect(demoClassroomCancelledReason({ ...liveClassroom, generatedSessions: [{ status: "ongoing", actualEndedAt: new Date() }] })).toBe("no_open_session");
  });
});

describe("demoBookingCancelledReason", () => {
  it("treats a deleted booking as off", () => {
    expect(demoBookingCancelledReason(null)).toBe("booking_deleted");
  });
});

describe("demoClassroomOffForBookings (class-start sweep)", () => {
  it("silences a demo classroom whose booking was closed", () => {
    expect(demoClassroomOffForBookings({ bookings: [{ ...liveBooking, status: "cancelled", demoStatus: "CLOSED" }], referencedBookingMissing: false })).toBe(true);
  });

  it("silences a demo classroom whose booking was deleted", () => {
    expect(demoClassroomOffForBookings({ bookings: [], referencedBookingMissing: true })).toBe(true);
  });

  it("keeps a classroom revived for a new booking after an older one was closed", () => {
    expect(demoClassroomOffForBookings({ bookings: [{ ...liveBooking, demoStatus: "CLOSED", status: "cancelled" }, liveBooking], referencedBookingMissing: false })).toBe(false);
  });

  it("leaves a hand-made demo classroom with no booking alone", () => {
    expect(demoClassroomOffForBookings({ bookings: [], referencedBookingMissing: false })).toBe(false);
  });
});
