export function classroomRecordId(value: any) {
  return String(value?._id || value || "");
}

export function isPrimaryClassroomCoach(classroom: any, userId: string) {
  return [classroom?.coach, classroom?.instructor].some((value) => classroomRecordId(value) === String(userId));
}

export function isSessionSubstituteCoach(classroom: any, userId: string, scheduledSessionId?: string) {
  const sessions = Array.isArray(classroom?.generatedSessions) ? classroom.generatedSessions : [];
  return sessions.some((session: any) => {
    if (scheduledSessionId && classroomRecordId(session?._id) !== String(scheduledSessionId)) return false;
    return classroomRecordId(session?.substituteCoach) === String(userId);
  });
}

function findSession(classroom: any, scheduledSessionId: string) {
  return (classroom?.generatedSessions || []).find(
    (session: any) => classroomRecordId(session?._id) === String(scheduledSessionId)
  );
}

/** A class held before a permanent coach change: `assignedCoach` froze who held it. */
function heldByFormerCoach(session: any) {
  return Boolean(session?.assignedCoach);
}

/**
 * Teach / act on a class: start it, mark attendance, edit it.
 *
 * A class from before a permanent coach change is history - the previous coach
 * may only view it and the new coach never owned it - so no coach acts on it;
 * an admin corrects it if needed.
 */
export function coachCanAccessClassroomSession(classroom: any, userId: string, scheduledSessionId?: string) {
  if (scheduledSessionId) {
    const target = findSession(classroom, scheduledSessionId);
    if (target?.substituteCoach) return classroomRecordId(target.substituteCoach) === String(userId);
    if (heldByFormerCoach(target)) return false;
  }
  return isPrimaryClassroomCoach(classroom, userId) || isSessionSubstituteCoach(classroom, userId, scheduledSessionId);
}

/** The previous coach of a classroom, for the classes they held before handing it over. */
export function isFormerSessionCoach(classroom: any, userId: string, scheduledSessionId?: string) {
  const sessions = Array.isArray(classroom?.generatedSessions) ? classroom.generatedSessions : [];
  return sessions.some((session: any) => {
    if (scheduledSessionId && classroomRecordId(session?._id) !== String(scheduledSessionId)) return false;
    return classroomRecordId(session?.assignedCoach) === String(userId);
  });
}

/**
 * View a class (summaries, lists, history). Everyone who may act on it, plus
 * the previous coach for the classes they held. The previous coach sees none of
 * the classes after the hand-over.
 */
export function coachCanViewClassroomSession(classroom: any, userId: string, scheduledSessionId?: string) {
  if (coachCanAccessClassroomSession(classroom, userId, scheduledSessionId)) return true;
  if (isFormerSessionCoach(classroom, userId, scheduledSessionId)) return true;
  // The current coach may read the history they inherited, but not act on it.
  if (scheduledSessionId && heldByFormerCoach(findSession(classroom, scheduledSessionId))) return isPrimaryClassroomCoach(classroom, userId);
  return false;
}

/** The sessions of a classroom this coach may see, for lists and calendars. */
export function limitClassroomToCoachSessions(classroom: any, userId: string) {
  if (!classroom) return classroom;
  return {
    ...classroom,
    generatedSessions: (classroom.generatedSessions || []).filter(
      (session: any) => coachCanViewClassroomSession(classroom, userId, classroomRecordId(session?._id))
    ),
  };
}

export function coachClassroomQuery(userId: string) {
  return {
    $or: [
      { coach: userId },
      { instructor: userId },
      { "generatedSessions.substituteCoach": userId },
      // A previous coach keeps sight of the classes they held.
      { "generatedSessions.assignedCoach": userId },
    ],
  };
}
