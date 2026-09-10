/**
 * One rule, in one place: what a student who left a classroom part-way through
 * is still allowed to see.
 *
 * A batch change moves a student onto a different classroom, but their old one
 * is not simply forgotten - the classes they sat in, the homework they were
 * given and the attendance taken on them are all still theirs. So the student
 * stays in `Classroom.students` (that membership is what every history query
 * joins on) and an entry goes into `Classroom.studentExits` instead. The exit
 * date is the cut:
 *
 *   - a session scheduled on or before it  -> theirs, readable, on the register
 *   - a session scheduled after it         -> as if they were never enrolled
 *   - homework created on or before it     -> theirs, still completable
 *   - homework created after it            -> invisible
 *
 * Removing them from future `generatedSessions[].students` at transfer time is
 * belt-and-braces for the coach's register; the exit record is what actually
 * guarantees the rule, because an emptied session roster silently falls back to
 * the whole classroom and would otherwise put the student straight back.
 */

function idOf(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as Record<string, unknown> & { toHexString?: () => string };
    if (typeof record.toHexString === "function") return record.toHexString();
    if (record._id && record._id !== value) return idOf(record._id);
  }
  return String(value);
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type ClassroomExitShape = {
  studentExits?: unknown[];
  students?: unknown[];
  generatedSessions?: unknown[];
  classDate?: unknown;
  startDate?: unknown;
};

/** When this student left, or null if they are still a full member. */
export function studentExitDate(classroom: ClassroomExitShape | null | undefined, studentId: string): Date | null {
  if (!classroom || !studentId) return null;
  const exits = Array.isArray(classroom.studentExits) ? classroom.studentExits : [];
  // Someone can leave, be moved back, and leave again. The last exit wins.
  let latest: Date | null = null;
  exits.forEach((exit: any) => {
    if (idOf(exit?.student) !== studentId) return;
    const exitedAt = toDate(exit?.exitedAt);
    if (exitedAt && (!latest || exitedAt.getTime() > latest.getTime())) latest = exitedAt;
  });
  return latest;
}

export function hasStudentExited(classroom: ClassroomExitShape | null | undefined, studentId: string) {
  return studentExitDate(classroom, studentId) !== null;
}

/** Every student who has left, as a map of id -> exit date. */
export function exitDatesByStudent(classroom: ClassroomExitShape | null | undefined): Map<string, Date> {
  const map = new Map<string, Date>();
  const exits = Array.isArray(classroom?.studentExits) ? classroom!.studentExits : [];
  exits.forEach((exit: any) => {
    const studentId = idOf(exit?.student);
    const exitedAt = toDate(exit?.exitedAt);
    if (!studentId || !exitedAt) return;
    const existing = map.get(studentId);
    if (!existing || exitedAt.getTime() > existing.getTime()) map.set(studentId, exitedAt);
  });
  return map;
}

export function sessionStartDate(classroom: ClassroomExitShape | null | undefined, session: any): Date | null {
  return toDate(session?.scheduledFor) || toDate(session?.classDate) || toDate(classroom?.classDate) || toDate(classroom?.startDate);
}

/**
 * Was this session already in the past for the student when they left? An
 * undated session is treated as still to come - better to withhold a class we
 * cannot place than to hand out one that has not happened.
 */
export function sessionIsWithinStudentTime(classroom: ClassroomExitShape | null | undefined, session: any, exitedAt: Date | null) {
  if (!exitedAt) return true;
  const startsAt = sessionStartDate(classroom, session);
  if (!startsAt) return false;
  return startsAt.getTime() <= exitedAt.getTime();
}

/**
 * The roster for one session with exits applied.
 *
 * `baseRoster` follows the convention used everywhere else in the codebase: a
 * session with its own non-empty `students` list owns its roster, otherwise it
 * inherits the classroom's. Exited students are then dropped from any session
 * that starts after they left - including the inherited case, which is exactly
 * where an emptied roster would otherwise resurrect them.
 */
export function rosterForSession(classroom: ClassroomExitShape | null | undefined, session: any): unknown[] {
  const base = Array.isArray(session?.students) && session.students.length
    ? session.students
    : (classroom?.students || []);
  const exits = exitDatesByStudent(classroom);
  if (!exits.size) return base;
  return base.filter((student: unknown) => {
    const exitedAt = exits.get(idOf(student));
    return !exitedAt || sessionIsWithinStudentTime(classroom, session, exitedAt);
  });
}

/** The sessions a given student may see - all of them until they left. */
export function sessionsVisibleToStudent(classroom: ClassroomExitShape | null | undefined, studentId: string) {
  const sessions = Array.isArray(classroom?.generatedSessions) ? classroom!.generatedSessions : [];
  const exitedAt = studentExitDate(classroom, studentId);
  if (!exitedAt) return sessions;
  return sessions.filter((session: any) => sessionIsWithinStudentTime(classroom, session, exitedAt));
}

/** Is this student on the roster for this session, exits included? */
export function studentIsOnSessionRoster(classroom: ClassroomExitShape | null | undefined, session: any, studentId: string) {
  return rosterForSession(classroom, session).some((student: unknown) => idOf(student) === studentId);
}

export { idOf as exitStudentId };
