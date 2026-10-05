/**
 * Which coach a month's report belongs to.
 *
 * A report describes a month of teaching, so it goes to the coach who taught
 * that month - not whoever holds the classroom today. When a group is handed to
 * a new coach from October, September's reports stay with the coach who taught
 * September, and the new coach's reports start with October. (Until 2026-10-05
 * a hand-over moved September's unwritten reports to the new coach, who had
 * never taught those students.)
 *
 * "Taught" uses the same rule as pay and teaching stats -
 * `effectiveSessionCoachId`: `conductedBy`, else the substitute, else the
 * classroom's coach. A permanent coach change pins every past class to the
 * coach who held it before swapping, so history survives the swap.
 *
 * Pure: the caller supplies the classroom with its sessions.
 */

import { effectiveSessionCoachId } from "@/lib/teachingStats";

/** Classes that did not happen do not make anyone the month's coach. */
const NOT_TAUGHT = new Set(["cancelled", "rescheduled", "coach_no_show"]);

/**
 * The coach who taught (or is booked to teach) most of the classroom's classes
 * in the month, or "" when the month has no classes on record. A tie goes to
 * the coach of the later class - the one who has the group now. One-off
 * substitutions never outweigh the regular coach.
 */
export function monthTeachingCoachId(classroom: any, bounds: { start: Date; end: Date }) {
  const tally = new Map<string, { classes: number; latest: number }>();
  for (const session of classroom?.generatedSessions || []) {
    const at = new Date(session?.scheduledFor || 0).getTime();
    if (!Number.isFinite(at) || at < bounds.start.getTime() || at > bounds.end.getTime()) continue;
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
  return best;
}

/**
 * The report's owner for a month: the month's teaching coach while they are
 * still with the academy, otherwise whoever holds the classroom now - a coach
 * who has left cannot write it.
 */
export function reportCoachId(classroom: any, bounds: { start: Date; end: Date }, isActiveCoach: (coachId: string) => boolean) {
  const current = String(classroom?.coach?._id || classroom?.coach || classroom?.instructor?._id || classroom?.instructor || "");
  const taught = monthTeachingCoachId(classroom, bounds);
  if (taught && isActiveCoach(taught)) return taught;
  return current;
}
