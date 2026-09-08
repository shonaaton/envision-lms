import { Classroom } from "@/models/Classroom";
import { dbConnect } from "@/lib/db";
import { notifyCourseCompleted } from "@/lib/classSessionNotifications";
import { TERMINAL_SESSION_STATUSES } from "@/lib/classroomLifecycle";

/**
 * Carries out the closes an admin armed with "close after the last scheduled
 * class".
 *
 * The decision was already made by a person - this job only picks the moment,
 * so nobody has to remember to come back and press the button on the last day
 * of a course. It is not the old auto-completion: an unarmed course is never
 * touched, however its classes look.
 */

/**
 * A course is due to close when nothing is left to teach - every class has
 * reached an end state, register included. Expressed as "no session is still
 * open" rather than a date comparison, so a class whose date has passed but
 * whose register was never marked holds the course open instead of stranding
 * the attendance and the credit it consumes.
 */
export function dueCourseCompletionFilter() {
  return {
    completeAfterLastSession: true,
    status: { $nin: ["completed", "cancelled"] },
    isSessionInstance: { $ne: true },
    generatedSessions: {
      $not: { $elemMatch: { status: { $nin: Array.from(TERMINAL_SESSION_STATUSES) } } },
    },
  };
}

const SWEEP_LIMIT = 200;

/**
 * The same close, for one classroom, run the moment its last register is
 * marked - so an armed course finishes as the coach saves attendance rather
 * than up to an hour later when the sweep next runs. The sweep stays as the
 * backstop for courses whose last class ends some other way.
 *
 * Safe to call on any classroom: the filter does the deciding, so an unarmed or
 * still-running one is left alone.
 */
export async function completeCourseIfDue(classroomId: string) {
  const claimed: any = await Classroom.findOneAndUpdate(
    { _id: classroomId, ...dueCourseCompletionFilter() },
    // An update pipeline rather than a plain $set, so the close can be credited
    // to whoever armed it without reading the document first and racing on it.
    [
      {
        $set: {
          status: "completed",
          completedAt: "$$NOW",
          completedBy: "$completionArmedBy",
          completeAfterLastSession: false,
        },
      },
      { $unset: ["completionArmedAt", "completionArmedBy"] },
    ],
    { new: true },
  ).lean();
  if (!claimed) return { closed: 0 };
  await notifyCourseCompleted(claimed).catch((error) => console.error("Course completion notice failed", error));
  return { closed: 1 };
}

export async function processDueCourseCompletions() {
  await dbConnect();

  const due: any[] = await Classroom.find(dueCourseCompletionFilter()).select("_id completionArmedBy").limit(SWEEP_LIMIT).lean();
  let closed = 0;

  for (const candidate of due) {
    // Claimed with the same filter it was found by, so two app instances
    // sweeping at the same time cannot both close it and send the family two
    // course-complete emails.
    const claimed = await Classroom.findOneAndUpdate(
      { _id: candidate._id, ...dueCourseCompletionFilter() },
      {
        $set: {
          status: "completed",
          completedAt: new Date(),
          // Credited to whoever armed it - the sweep is executing their call.
          completedBy: candidate.completionArmedBy,
          completeAfterLastSession: false,
        },
        $unset: { completionArmedAt: "", completionArmedBy: "" },
      },
      { new: true },
    ).lean();
    if (!claimed) continue;

    closed += 1;
    // Fire-and-forget, exactly as the manual close does: a mail failure must
    // not leave the course stuck open.
    await notifyCourseCompleted(claimed).catch((error) => console.error("Course completion notice failed", error));
  }

  return { closed };
}
