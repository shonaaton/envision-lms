import { Classroom } from "@/models/Classroom";
import { ACADEMY_TIME_ZONE } from "@/lib/academyTime";
import { scheduledDateLabel } from "@/lib/firstClassDate";

/**
 * The shape of a batch that every batch-membership message quotes back: its
 * code, what it teaches, when it meets and who is in it.
 *
 * Kept in one place because the coach's "batch assigned" note, the coach's
 * "student joined / student left" notes and the family's "batch changed" note
 * all have to describe the same batch the same way. Two copies of the schedule
 * renderer is how a coach and a parent end up reading different timings for the
 * same class.
 */

export function batchObjectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

export function dayName(day: number) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: ACADEMY_TIME_ZONE, weekday: "long" }).format(
    new Date(Date.UTC(2026, 7, 2 + Number(day || 0)))
  );
}

export function scheduleLinesForClassroom(classroom: any) {
  if (Array.isArray(classroom?.daysOfWeek) && classroom.daysOfWeek.length) {
    return classroom.daysOfWeek.flatMap((day: any) =>
      (day.slots || []).map((slot: any) => `${dayName(day.day)} at ${slot.startTime || classroom.startTime || "time not set"} (${slot.durationMinutes || classroom.durationMinutes || 60} min)`)
    );
  }
  if (classroom?.classDate) return [scheduledDateLabel(classroom, classroom.classDate, { weekday: "long" })];
  if (classroom?.startDate && classroom?.startTime) return [`From ${scheduledDateLabel(classroom, classroom.startDate)}`];
  return ["Timings not set"];
}

/** Every schedule line the batch runs on, prefixed by the class it belongs to. */
export function batchTimingLines(batch: any, classrooms: any[]) {
  const lines = classrooms.length
    ? classrooms.flatMap((classroom) => scheduleLinesForClassroom(classroom).map((line: string) => `${classroom.title || batch?.name || "Class"}: ${line}`))
    : ["Timings not set"];
  return lines.filter(Boolean).join("\n") || "Timings not set";
}

export function studentListLabel(students: any[]) {
  const names = students.map((student: any) => String(student?.name || student?.username || "").trim()).filter(Boolean);
  if (!names.length) return "No students enrolled yet";
  const shown = names.slice(0, 15);
  const remaining = names.length - shown.length;
  return `${shown.join(", ")}${remaining > 0 ? ` and ${remaining} more` : ""} (${names.length} total)`;
}

/** The running classrooms a batch owns, excluding the per-session shadow copies. */
export function findBatchClassrooms(batchId: string) {
  return Classroom.find({
    batches: batchId,
    isActive: { $ne: false },
    isSessionInstance: { $ne: true },
    status: { $nin: ["completed", "cancelled"] },
  })
    .select("title courseName levelName level startTime durationMinutes classDate startDate daysOfWeek generatedSessions")
    .lean();
}
