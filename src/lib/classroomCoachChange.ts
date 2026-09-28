/**
 * Handing a classroom to a new coach for good.
 *
 * Pay, teaching stats and reports credit a class to
 * `conductedBy || substituteCoach || classroom.coach`. `conductedBy` is only
 * stamped when a class is run live from the portal, so many past classes carry
 * neither field and are credited through `classroom.coach` alone - swapping that
 * field would silently move the old coach's taught classes (and their pay) to
 * the new coach. So before the swap, every class that is already history is
 * pinned to the coach who held it.
 */

function idOf(value: any) {
  return String(value?._id || value || "");
}

/** A class still to be taught: scheduled, not started, and not yet over. */
export function isUpcomingSession(session: any, defaultDurationMinutes: number, now: Date) {
  if (!session || session.status !== "scheduled") return false;
  if (session.actualStartedAt || session.actualEndedAt || session.attendanceMarkedAt) return false;
  const startsAt = new Date(session.scheduledFor).getTime();
  if (!Number.isFinite(startsAt)) return false;
  const minutes = Math.max(15, Number(session.durationMinutes || defaultDurationMinutes || 60));
  return startsAt + minutes * 60000 > now.getTime();
}

export type CoachChangeResult = {
  previousCoachId: string;
  /** Upcoming classes that now belong to the new coach. */
  reassignedSessionIds: string[];
  /** Past classes pinned to the previous coach so their credit does not move. */
  pinnedSessionIds: string[];
  /** Upcoming classes that keep a cover coach who is neither the old nor the new coach. */
  keptCoverSessionIds: string[];
};

/**
 * Mutates `classroom` (a Mongoose document or plain object) in place.
 *
 * - history (anything not upcoming) with no teacher recorded -> `conductedBy` = old coach
 * - upcoming classes -> the new coach; a cover by the old or new coach is
 *   dropped, a cover by a third coach is kept, since that was arranged separately
 */
export function applyPermanentCoachChange(classroom: any, newCoachId: string, now = new Date()): CoachChangeResult {
  const previousCoachId = idOf(classroom.coach || classroom.instructor);
  const result: CoachChangeResult = { previousCoachId, reassignedSessionIds: [], pinnedSessionIds: [], keptCoverSessionIds: [] };

  for (const session of classroom.generatedSessions || []) {
    const sessionId = idOf(session._id);
    if (isUpcomingSession(session, classroom.durationMinutes, now)) {
      const cover = idOf(session.substituteCoach);
      if (cover && cover !== previousCoachId && cover !== newCoachId) {
        result.keptCoverSessionIds.push(sessionId);
        continue;
      }
      if (cover) session.substituteCoach = undefined;
      result.reassignedSessionIds.push(sessionId);
    } else if (previousCoachId) {
      // Freeze who held the classroom on the day (an earlier hand-over's value
      // wins), so pay does not re-read taught classes as substitutions.
      if (!session.assignedCoach) session.assignedCoach = previousCoachId;
      if (!session.conductedBy && !session.substituteCoach) {
        session.conductedBy = previousCoachId;
        result.pinnedSessionIds.push(sessionId);
      }
    }
  }

  classroom.coach = newCoachId;
  classroom.instructor = newCoachId;
  return result;
}
