type RangeLike = { from: Date; to: Date };

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function overlapsRange(start?: Date | string, end?: Date | string, range?: RangeLike) {
  if (!start || !range) return false;
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : startDate;
  return endDate >= range.from && startDate <= range.to;
}

export function scheduledPaymentMinutes(session: any, classroom?: any) {
  return Math.max(0, Number(session?.durationMinutes || classroom?.durationMinutes || 0));
}

export function actualSessionMinutes(session: any) {
  if (!session?.actualStartedAt || !session?.actualEndedAt) return 0;
  return Math.max(0, Math.round((new Date(session.actualEndedAt).getTime() - new Date(session.actualStartedAt).getTime()) / 60000));
}

export function scheduledStartDate(session: any, classroom?: any) {
  const base = new Date(session?.scheduledFor || classroom?.classDate || classroom?.startDate || Date.now());
  const [hours, minutes] = String(session?.startTime || classroom?.startTime || "00:00")
    .split(":")
    .map((part) => Number(part || 0));
  base.setHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return base;
}

export function punctualityBreakdown(session: any, classroom?: any) {
  const scheduledStart = scheduledStartDate(session, classroom);
  const actualStart = session?.actualStartedAt ? new Date(session.actualStartedAt) : null;
  const plannedMinutes = scheduledPaymentMinutes(session, classroom);
  const actualMinutes = actualSessionMinutes(session);
  const joinDelayMinutes = actualStart ? Math.max(0, Math.round((actualStart.getTime() - scheduledStart.getTime()) / 60000)) : plannedMinutes;
  const startScore = Math.max(0, 100 - joinDelayMinutes * 5);
  const durationRatio = plannedMinutes > 0 ? actualMinutes / plannedMinutes : 0;
  const durationScore =
    plannedMinutes <= 0
      ? 0
      : durationRatio >= 0.9 && durationRatio <= 1.25
        ? 100
        : durationRatio < 0.9
          ? Math.max(0, Math.round((durationRatio / 0.9) * 100))
          : Math.max(70, Math.round(100 - (durationRatio - 1.25) * 40));
  const punctualityScore = Math.max(0, Math.min(100, Math.round(startScore * 0.6 + durationScore * 0.4)));
  return {
    scheduledStart,
    plannedMinutes,
    actualMinutes,
    joinDelayMinutes,
    durationRatio,
    punctualityScore,
  };
}

export function summarizeCoachSessions(classrooms: any[], range: RangeLike) {
  const rows = classrooms.flatMap((classroom: any) =>
    (classroom.generatedSessions || []).map((session: any) => ({
      classroom,
      session,
    }))
  ).filter(({ session }) => overlapsRange(session.actualStartedAt || session.scheduledFor, session.actualEndedAt || session.scheduledFor, range));

  const completed = rows.filter(({ session }) => session.status === "completed");
  const cancelled = rows.filter(({ session }) => session.status === "cancelled");
  const rescheduled = rows.filter(({ session }) => session.status === "rescheduled");
  const conductedMinutes = completed.reduce((sum, { classroom, session }) => sum + scheduledPaymentMinutes(session, classroom), 0);
  const actualMinutes = completed.reduce((sum, { session }) => sum + Number(session.actualTeachingMinutes || actualSessionMinutes(session)), 0);
  const punctualityScores = completed.map(({ classroom, session }) => Number(session.punctualityScore || punctualityBreakdown(session, classroom).punctualityScore || 0));
  const studentIds = new Set(completed.flatMap(({ classroom }) => (classroom.students || []).map(objectId)));
  const batchMap = new Map<string, { batchName: string; classesConducted: number; hoursConducted: number; actualHours: number; students: number }>();

  completed.forEach(({ classroom, session }) => {
    const batchNames = (classroom.batches || []).map((batch: any) => batch.name || "Unassigned");
    const durationMinutes = scheduledPaymentMinutes(session, classroom);
    const actualMinutesForSession = Number(session.actualTeachingMinutes || actualSessionMinutes(session));
    if (!batchNames.length) batchNames.push("Unassigned");
    batchNames.forEach((batchName: string) => {
      const current = batchMap.get(batchName) || { batchName, classesConducted: 0, hoursConducted: 0, actualHours: 0, students: 0 };
      current.classesConducted += 1;
      current.hoursConducted += durationMinutes / 60;
      current.actualHours += actualMinutesForSession / 60;
      current.students = Math.max(current.students, (classroom.students || []).length);
      batchMap.set(batchName, current);
    });
  });

  return {
    classesConducted: completed.length,
    classesCancelled: cancelled.length,
    classesRescheduled: rescheduled.length,
    totalHoursConducted: Number((conductedMinutes / 60).toFixed(1)),
    actualHoursConducted: Number((actualMinutes / 60).toFixed(1)),
    averageClassDuration: completed.length ? Math.round(conductedMinutes / completed.length) : 0,
    averageActualDuration: completed.length ? Math.round(actualMinutes / completed.length) : 0,
    punctualityScore: punctualityScores.length ? Math.round(punctualityScores.reduce((sum, value) => sum + value, 0) / punctualityScores.length) : 0,
    attendancePercentage: rows.length ? Math.round((completed.length / rows.length) * 100) : 0,
    totalStudentsTaught: studentIds.size,
    batchRows: Array.from(batchMap.values()).sort((a, b) => b.hoursConducted - a.hoursConducted),
  };
}
