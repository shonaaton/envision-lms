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

export function coachCanAccessClassroomSession(classroom: any, userId: string, scheduledSessionId?: string) {
  return isPrimaryClassroomCoach(classroom, userId) || isSessionSubstituteCoach(classroom, userId, scheduledSessionId);
}

export function limitClassroomToCoachSessions(classroom: any, userId: string) {
  if (!classroom || isPrimaryClassroomCoach(classroom, userId)) return classroom;
  return {
    ...classroom,
    generatedSessions: (classroom.generatedSessions || []).filter(
      (session: any) => classroomRecordId(session?.substituteCoach) === String(userId)
    ),
  };
}

export function coachClassroomQuery(userId: string) {
  return {
    $or: [
      { coach: userId },
      { instructor: userId },
      { "generatedSessions.substituteCoach": userId },
    ],
  };
}
