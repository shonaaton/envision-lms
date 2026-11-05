/**
 * A student's numbers for a month's report, from every classroom they were in.
 *
 * A student who changes classroom mid-month has registers in more than one, so
 * counting only the report's classroom understated them: 14 September reports
 * reached families that way, two of them saying 0 attended (2026-11-05 audit).
 *
 * Pure: the caller supplies the registers (grouped by classroom) and the rooms.
 */

import { isSessionOffSchedule } from "@/lib/classroomSessions";
import { studentExitDate } from "@/lib/classroomStudentExits";

/** Bumped when the sum changes; unsent reports on an older version are recomputed once. */
export const STATS_VERSION = 2;

/** Fields of a classroom `monthStatsFromRegisters` reads. */
export const STATS_ROOM_FIELDS = "status isActive isPaused pausedFrom completedAt classroomType isTestClassroom isSessionInstance parentClassroom students studentExits closedForStudents generatedSessions";

const NOT_HELD = new Set(["cancelled", "rescheduled", "coach_no_show"]);

const idOf = (value: any) => String(value?._id ?? value ?? "");

/** Still a member of a classroom that is still running. */
function studentIsInRoom(room: any, studentId: string) {
  if (room?.isActive === false || room?.status === "completed" || room?.status === "cancelled") return false;
  const has = (rows: any[] | undefined) => (rows || []).some((row) => idOf(row) === studentId);
  return has(room?.students) && !has(room?.closedForStudents) && !studentExitDate(room, studentId);
}

export function monthStatsFromRegisters(input: {
  reportRoomId: unknown;
  rooms: any[];
  registers: { _id: unknown; attended: number; held: number }[];
  studentId: string;
  bounds: { start: Date; end: Date };
}) {
  const { rooms, registers, studentId, bounds } = input;
  const reportRoomId = idOf(input.reportRoomId);
  const roomById = new Map(rooms.map((room) => [idOf(room), room]));
  const isExcluded = (room: any) => room?.classroomType === "demo" || room?.isTestClassroom === true;

  // A register on a single-class mirror belongs to its parent classroom.
  const heldByRoom = new Map<string, number>();
  let attended = 0;
  for (const register of registers) {
    const room = roomById.get(idOf(register._id));
    if (isExcluded(room)) continue;
    attended += Number(register.attended || 0);
    const key = room?.isSessionInstance && room?.parentClassroom ? idOf(room.parentClassroom) : idOf(register._id);
    heldByRoom.set(key, (heldByRoom.get(key) || 0) + Number(register.held || 0));
  }

  let scheduled = 0;
  const taught: { at: number; topic: string }[] = [];
  const read = new Set<string>();
  for (const room of rooms) {
    const id = idOf(room);
    if (isExcluded(room) || room?.isSessionInstance) continue;
    if (id !== reportRoomId && !heldByRoom.has(id)) continue;
    read.add(id);
    const exit = studentExitDate(room, studentId);
    const sessions = (room.generatedSessions || []).filter((session: any) => {
      const at = new Date(session?.scheduledFor || 0).getTime();
      if (!Number.isFinite(at) || at < bounds.start.getTime() || at > bounds.end.getTime()) return false;
      if (exit && at > exit.getTime()) return false;
      const roster = (session?.students || []).map(idOf);
      return !roster.length || roster.includes(studentId);
    });
    for (const session of sessions) {
      const topic = String(session?.topicName || "").trim();
      if (session?.status === "completed" && topic) taught.push({ at: new Date(session.scheduledFor).getTime(), topic });
    }
    const held = heldByRoom.get(id) || 0;
    // Registers are the truth once marked. The schedule only adds what is still
    // to come, and only where the student still is: a room they left owes nothing.
    const booked = sessions.filter(
      (session: any) => !NOT_HELD.has(String(session?.status || "")) && (!isSessionOffSchedule(room, session) || Boolean(session?.attendanceMarkedAt))
    ).length;
    scheduled += studentIsInRoom(room, studentId) ? Math.max(held, booked) : held;
  }
  // Registers of a classroom that no longer exists still happened.
  for (const [id, held] of Array.from(heldByRoom.entries())) {
    if (!read.has(id)) scheduled += held;
  }

  const topics = Array.from(new Set(taught.sort((a, b) => a.at - b.at).map((row) => row.topic)));
  return {
    classesAttended: attended,
    classesScheduled: Math.max(scheduled, attended),
    topicsCovered: topics.slice(0, 20),
  };
}
