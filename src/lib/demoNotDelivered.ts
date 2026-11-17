import { Booking } from "@/models/Booking";
import { DemoFeedback } from "@/models/Onboarding";
import { cancelDemoAssessmentTask } from "@/lib/tasks/taskTriggers";

/**
 * A demo the student never attended (no show, absent, missed) has nothing for
 * the coach to assess.
 *
 * Marking a demo "Present" creates an empty assessment draft, sets the booking
 * to ASSESSMENT_PENDING and gives the coach a "Fill demo assessment" task. When
 * that was wrong and the demo is corrected to No Show or Absent afterwards (an
 * attendance re-save, or the classroom page's class outcome), the booking used
 * to stay ASSESSMENT_PENDING with the task open and the form reachable, so the
 * coach kept being asked to assess a class that never happened. Everything that
 * writes a demo off as not delivered now withdraws all three.
 */

export type DemoNotDeliveredOutcome = "student_no_show" | "absent";

/** Booking stages a not-delivered outcome may still move: booked, or waiting on an assessment. */
const WRITE_OFF_FROM_STATUSES = ["COACH_ASSIGNED", "APPROVED", "CLASSROOM_CREATED", "ASSESSMENT_PENDING"];

/** Maps a class outcome onto a demo write-off, or null when the class did happen (or was cancelled). */
export function demoNotDeliveredOutcome(outcome: unknown): DemoNotDeliveredOutcome | null {
  const value = String(outcome || "");
  if (value === "student_no_show") return "student_no_show";
  if (value === "absent" || value === "missed" || value === "abandoned") return "absent";
  return null;
}

/**
 * Whether a booking can still be written off. A submitted assessment means the
 * coach did teach the demo, so it is never undone from here; the Demo Center's
 * own controls handle that case.
 */
export function canWriteOffDemo(booking: { demoStatus?: string | null; feedbackStatus?: string | null; status?: string | null } | null | undefined) {
  if (!booking) return false;
  if (String(booking.feedbackStatus || "") === "submitted") return false;
  if (String(booking.status || "") === "cancelled") return false;
  return WRITE_OFF_FROM_STATUSES.includes(String(booking.demoStatus || ""));
}

/** Drop the empty assessment draft and the coach's "Fill demo assessment" task. A submitted assessment is never touched. */
export async function withdrawDemoAssessment(bookingId: unknown, reason: string) {
  if (!bookingId) return;
  await DemoFeedback.deleteMany({ booking: bookingId, status: "draft" }).catch((error: unknown) => console.error("Demo assessment draft cleanup failed", error));
  await cancelDemoAssessmentTask(bookingId, reason);
}

/**
 * Write a demo off as not delivered after it had been recorded otherwise.
 * Returns the updated booking, or null when there was nothing to change (already
 * written off, assessment submitted, closed) - the caller sends the "missed
 * demo" notice only on a real change, so a re-save never messages twice.
 */
export async function applyDemoNotDelivered(input: { bookingId: unknown; outcome: DemoNotDeliveredOutcome; reason?: string }) {
  if (!input.bookingId) return null;
  const demoStatus = input.outcome === "student_no_show" ? "STUDENT_NO_SHOW" : "ABSENT";
  const updated: any = await Booking.findOneAndUpdate(
    {
      _id: input.bookingId,
      bookingType: "demo",
      demoStatus: { $in: WRITE_OFF_FROM_STATUSES },
      feedbackStatus: { $ne: "submitted" },
      status: { $ne: "cancelled" },
    },
    { status: "pending", approvalStatus: "pending_admin", demoStatus, feedbackStatus: "not_required" },
    { new: true }
  );
  if (!updated) return null;
  await withdrawDemoAssessment(updated._id, input.reason || (input.outcome === "student_no_show" ? "Demo marked as a no show." : "Demo marked as absent."));
  return updated;
}
