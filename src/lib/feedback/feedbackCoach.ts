/**
 * Which coach a month's report belongs to.
 *
 * From November 2026 (`CURRENT_COACH_RULE_FROM`) a report goes to the batch's
 * current permanent coach - the classroom's `coach`, which a batch coach change
 * keeps in sync. Substitutes never count. If the group changes coach before a
 * report is written, the report follows the group to the new coach.
 *
 * Months before that keep the earlier rule (2026-10-05 to 2026-11-04): the
 * coach who taught most of that month's classes, so reports already raised
 * under it stay where they are. "Taught" uses the same rule as pay and teaching
 * stats - `effectiveSessionCoachId`: `conductedBy`, else the substitute, else
 * the classroom's coach.
 *
 * Either way, a report an admin reassigned by hand (`coachPinned`) is left
 * alone - see the feedback service.
 *
 * Pure: the caller supplies the classroom with its sessions.
 */

import { isSessionOffSchedule } from "@/lib/classroomSessions";
import { hasStudentExited } from "@/lib/classroomStudentExits";
import { monthBounds } from "@/lib/feedback/feedbackCycleDates";
import { effectiveSessionCoachId } from "@/lib/teachingStats";

/** Classes that did not happen do not make anyone the month's coach. */
const NOT_TAUGHT = new Set(["cancelled", "rescheduled", "coach_no_show"]);

/**
 * The coach with the most of the classroom's classes in the month, and how
 * many. With `until`, only classes held up to then count (what was actually
 * taken so far); without it, booked classes count too. A tie goes to the coach
 * of the later class - the one who has the group now.
 */
export function monthTopCoach(classroom: any, bounds: { start: Date; end: Date }, options: { until?: Date } = {}) {
  const last = Math.min(bounds.end.getTime(), options.until ? options.until.getTime() : Infinity);
  const tally = new Map<string, { classes: number; latest: number }>();
  for (const session of classroom?.generatedSessions || []) {
    const at = new Date(session?.scheduledFor || 0).getTime();
    if (!Number.isFinite(at) || at < bounds.start.getTime() || at > last) continue;
    if (NOT_TAUGHT.has(String(session?.status || ""))) continue;
    const coachId = effectiveSessionCoachId(session, classroom);
    if (!coachId) continue;
    const row = tally.get(coachId) || { classes: 0, latest: 0 };
    row.classes += 1;
    row.latest = Math.max(row.latest, at);
    tally.set(coachId, row);
  }
  let best = "";
  let bestRow = { classes: 0, latest: 0 };
  for (const [coachId, row] of Array.from(tally.entries())) {
    if (row.classes > bestRow.classes || (row.classes === bestRow.classes && row.latest > bestRow.latest)) {
      best = coachId;
      bestRow = row;
    }
  }
  return { coachId: best, classes: bestRow.classes };
}

/**
 * The coach who taught (or is booked to teach) most of the classroom's classes
 * in the month, or "" when the month has no classes on record. One-off
 * substitutions never outweigh the regular coach.
 */
export function monthTeachingCoachId(classroom: any, bounds: { start: Date; end: Date }) {
  return monthTopCoach(classroom, bounds).coachId;
}

const sessionsInMonth = (classroom: any, bounds: { start: Date; end: Date }) =>
  (classroom?.generatedSessions || []).filter((session: any) => {
    const at = new Date(session?.scheduledFor || 0).getTime();
    return Number.isFinite(at) && at >= bounds.start.getTime() && at <= bounds.end.getTime();
  });

/**
 * False for a completed classroom whose classes that month are only ghosts.
 * Completing a classroom leaves its later classes `scheduled`, so a batch moved
 * to a new classroom keeps an old one with classes on every date, under the old
 * coach and with no attendance. A report raised from it names the wrong
 * permanent coach and counts 0 classes attended.
 */
export function classroomRanInMonth(classroom: any, bounds: { start: Date; end: Date }) {
  if (classroom?.status !== "completed") return true;
  const sessions = sessionsInMonth(classroom, bounds);
  if (!sessions.length) return true;
  return sessions.some((session: any) => !isSessionOffSchedule(classroom, session) || Boolean(session?.attendanceMarkedAt));
}

/**
 * The running classroom a student's report should use instead of a completed
 * one that held nothing that month: the same batch's if there is one. Null when
 * the student has no running classroom with classes that month.
 */
export function liveClassroomForStudent(stranded: any, candidates: any[], studentId: string, bounds: { start: Date; end: Date }) {
  const idsOf = (rows: any[] | undefined) => (rows || []).map((row) => String(row?._id ?? row));
  const usable = candidates.filter(
    (room) =>
      String(room?._id) !== String(stranded?._id) &&
      room?.status !== "completed" &&
      idsOf(room?.students).includes(studentId) &&
      !idsOf(room?.closedForStudents).includes(studentId) &&
      !hasStudentExited(room, studentId) &&
      sessionsInMonth(room, bounds).length > 0
  );
  const batches = new Set(idsOf(stranded?.batches));
  return usable.find((room) => idsOf(room?.batches).some((id) => batches.has(id))) || usable[0] || null;
}

/** First month whose reports go to the batch's current permanent coach. */
export const CURRENT_COACH_RULE_FROM = "2026-11";

/** The classroom's permanent coach today - never a one-off substitute. */
export function currentCoachId(classroom: any) {
  return String(classroom?.coach?._id || classroom?.coach || classroom?.instructor?._id || classroom?.instructor || "");
}

/**
 * The report's owner for a month. From `CURRENT_COACH_RULE_FROM`: the batch's
 * current permanent coach, falling back to the month's teaching coach only if
 * the permanent coach has left. Earlier months: the month's teaching coach
 * while they are still with the academy, otherwise the current coach.
 */
export function reportCoachId(classroom: any, month: string, isActiveCoach: (coachId: string) => boolean) {
  const current = currentCoachId(classroom);
  if (month >= CURRENT_COACH_RULE_FROM) {
    if (current && isActiveCoach(current)) return current;
    const taught = monthTeachingCoachId(classroom, monthBounds(month));
    return taught && isActiveCoach(taught) ? taught : current;
  }
  const taught = monthTeachingCoachId(classroom, monthBounds(month));
  if (taught && isActiveCoach(taught)) return taught;
  return current;
}
