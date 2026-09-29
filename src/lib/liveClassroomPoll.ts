/**
 * Keeps the live classroom's once-a-second poll cheap.
 *
 * Every open classroom tab - each student and the coach - calls
 * `GET /api/classrooms/[id]/live` every second. On the Atlas free plan's 100
 * operations a second, a single class of ten used to exceed the limit on its
 * own, and then every page on the site waited. Each helper here removes
 * database work from that poll without changing what it returns or records.
 */

/**
 * How stale a participant's `lastSeenAt` may get before the poll writes it again.
 *
 * Everything that reads `lastSeenAt` works in minutes: "Joined" means seen in
 * the last 2 minutes, and attended time is `lastSeenAt - firstSeenAt` rounded
 * to whole minutes (10 or more is "present"). Writing every 10 seconds instead
 * of every second is invisible to all of them, and removes a write plus a
 * re-read from nine polls in ten.
 */
export const LIVE_PRESENCE_WRITE_INTERVAL_MS = 10_000;

type PresenceParticipant = {
  role?: string | null;
  lastSeenAt?: Date | string | null;
  leftAt?: Date | string | null;
  presenceStatus?: string | null;
};

/**
 * True when the heartbeat write would only move `lastSeenAt` forward by less
 * than the interval. Any other change - a first join, a return after leaving, a
 * role change - is never skipped, so the room still reflects it on this poll.
 */
export function presenceHeartbeatIsCurrent(
  participant: PresenceParticipant | null | undefined,
  role: string | null | undefined,
  now = new Date()
) {
  if (!participant) return false;
  if (participant.leftAt) return false;
  if (participant.presenceStatus !== "active") return false;
  if (String(participant.role || "student") !== String(role || "student")) return false;
  const lastSeen = participant.lastSeenAt ? new Date(participant.lastSeenAt).getTime() : NaN;
  if (Number.isNaN(lastSeen)) return false;
  const age = now.getTime() - lastSeen;
  return age >= 0 && age < LIVE_PRESENCE_WRITE_INTERVAL_MS;
}

const START_FINAL_STATUSES = ["cancelled", "completed", "absent", "coach_no_show", "student_no_show"];

function idString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "object" && value && "_id" in value && (value as { _id?: unknown })._id !== value) {
    return idString((value as { _id?: unknown })._id);
  }
  return String(value);
}

/**
 * True when `markScheduledSessionStarted` would change nothing, judged from the
 * classroom this request has already read. Mirrors that function field by
 * field: a class already in a final state is left alone, and otherwise the
 * write is skipped only when the session is ongoing, has its start time, is
 * conducted by this actor, has the coach marked present, and the classroom is
 * ongoing. A session the snapshot cannot find is also a no-op there.
 */
export function scheduledSessionStartIsNoop({
  classroom,
  scheduledSessionId,
  actorId,
}: {
  classroom: { status?: unknown; generatedSessions?: unknown[] } | null | undefined;
  scheduledSessionId: string;
  actorId?: string;
}) {
  if (!classroom) return false;
  const target: any = (classroom.generatedSessions || []).find((item: any) => idString(item?._id) === scheduledSessionId);
  if (!target) return true;
  if (START_FINAL_STATUSES.includes(String(target.status || ""))) return true;
  return (
    target.status === "ongoing" &&
    Boolean(target.actualStartedAt) &&
    (!actorId || idString(target.conductedBy) === actorId) &&
    target.coachAttendanceStatus === "present" &&
    classroom.status === "ongoing"
  );
}

/**
 * Replaces the `coach`, `instructor` and `students` ids on a lean classroom with
 * the matching user documents - the result Mongoose's
 * `.populate("coach instructor students")` gives, from one query instead of
 * three. As with populate, a single reference with no matching user becomes
 * `null`, and a student id with no matching user is dropped from the list.
 */
export function attachClassroomPeople<T extends Record<string, any>>(classroom: T, users: Array<Record<string, any>>): T {
  const byId = new Map(users.map((user) => [idString(user?._id), user]));
  const lookup = (value: unknown) => {
    const user = byId.get(idString(value));
    return user ? { ...user } : null;
  };
  const result: Record<string, any> = { ...classroom };
  for (const key of ["coach", "instructor"]) {
    if (result[key] !== undefined && result[key] !== null) result[key] = lookup(result[key]);
  }
  if (Array.isArray(result.students)) {
    result.students = result.students.map(lookup).filter(Boolean);
  }
  return result as T;
}

/** Ids `attachClassroomPeople` needs, for the one `User.find` that feeds it. */
export function classroomPeopleIds(classroom: { coach?: unknown; instructor?: unknown; students?: unknown[] }) {
  // Only real ObjectIds are looked up. Anything else can match no user, so it
  // ends up `null` or dropped, exactly as populate leaves it.
  const ids = [classroom.coach, classroom.instructor, ...(classroom.students || [])]
    .map(idString)
    .filter((id) => /^[a-f0-9]{24}$/i.test(id));
  return Array.from(new Set(ids));
}
