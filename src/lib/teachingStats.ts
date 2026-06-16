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
  const conductedMinutes = completed.reduce((sum, { session }) => sum + Number(session.teachingMinutes || session.durationMinutes || 0), 0);
  const studentIds = new Set(completed.flatMap(({ classroom }) => (classroom.students || []).map(objectId)));
  const batchMap = new Map<string, { batchName: string; classesConducted: number; hoursConducted: number; students: number }>();

  completed.forEach(({ classroom, session }) => {
    const batchNames = (classroom.batches || []).map((batch: any) => batch.name || "Unassigned");
    const durationMinutes = Number(session.teachingMinutes || session.durationMinutes || classroom.durationMinutes || 0);
    if (!batchNames.length) batchNames.push("Unassigned");
    batchNames.forEach((batchName: string) => {
      const current = batchMap.get(batchName) || { batchName, classesConducted: 0, hoursConducted: 0, students: 0 };
      current.classesConducted += 1;
      current.hoursConducted += durationMinutes / 60;
      current.students = Math.max(current.students, (classroom.students || []).length);
      batchMap.set(batchName, current);
    });
  });

  return {
    classesConducted: completed.length,
    classesCancelled: cancelled.length,
    classesRescheduled: rescheduled.length,
    totalHoursConducted: Number((conductedMinutes / 60).toFixed(1)),
    averageClassDuration: completed.length ? Math.round(conductedMinutes / completed.length) : 0,
    attendancePercentage: rows.length ? Math.round((completed.length / rows.length) * 100) : 0,
    totalStudentsTaught: studentIds.size,
    batchRows: Array.from(batchMap.values()).sort((a, b) => b.hoursConducted - a.hoursConducted),
  };
}
