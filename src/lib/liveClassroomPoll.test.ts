import { describe, expect, it } from "vitest";
import { Types } from "mongoose";

import {
  LIVE_PRESENCE_WRITE_INTERVAL_MS,
  attachClassroomPeople,
  classroomPeopleIds,
  presenceHeartbeatIsCurrent,
  scheduledSessionStartIsNoop,
} from "./liveClassroomPoll";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const secondsAgo = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);
const COACH = "aaaaaaaaaaaaaaaaaaaaaaa1";
const ADMIN = "aaaaaaaaaaaaaaaaaaaaaaa2";
const S1 = "aaaaaaaaaaaaaaaaaaaaaaa3";
const S2 = "aaaaaaaaaaaaaaaaaaaaaaa4";
const GONE = "aaaaaaaaaaaaaaaaaaaaaaa9";
const SESSION = "bbbbbbbbbbbbbbbbbbbbbbb1";

describe("presenceHeartbeatIsCurrent", () => {
  const active = { role: "student", presenceStatus: "active", lastSeenAt: secondsAgo(3) };

  it("skips the write for an active participant seen within the interval", () => {
    expect(presenceHeartbeatIsCurrent(active, "student", NOW)).toBe(true);
  });

  it("writes again once the interval has passed", () => {
    expect(presenceHeartbeatIsCurrent({ ...active, lastSeenAt: secondsAgo(LIVE_PRESENCE_WRITE_INTERVAL_MS / 1000) }, "student", NOW)).toBe(false);
  });

  it("keeps every reader of lastSeenAt accurate: the interval is far inside the 2-minute presence window", () => {
    expect(LIVE_PRESENCE_WRITE_INTERVAL_MS).toBeLessThanOrEqual(10_000);
  });

  it("always writes a first join", () => {
    expect(presenceHeartbeatIsCurrent(undefined, "student", NOW)).toBe(false);
    expect(presenceHeartbeatIsCurrent(null, "student", NOW)).toBe(false);
  });

  it("always writes a return after leaving, so the room shows them back at once", () => {
    expect(presenceHeartbeatIsCurrent({ ...active, leftAt: secondsAgo(1) }, "student", NOW)).toBe(false);
    expect(presenceHeartbeatIsCurrent({ ...active, presenceStatus: "left" }, "student", NOW)).toBe(false);
    expect(presenceHeartbeatIsCurrent({ ...active, presenceStatus: "coach_no_show_pending" }, "student", NOW)).toBe(false);
  });

  it("writes when presence was never set, which is how the old write filled it in", () => {
    expect(presenceHeartbeatIsCurrent({ role: "student", lastSeenAt: secondsAgo(1) }, "student", NOW)).toBe(false);
  });

  it("writes a role change", () => {
    expect(presenceHeartbeatIsCurrent({ ...active, role: "student" }, "instructor", NOW)).toBe(false);
    // A participant stored without a role counts as a student, as the write assumes.
    expect(presenceHeartbeatIsCurrent({ ...active, role: undefined }, "student", NOW)).toBe(true);
  });

  it("writes when lastSeenAt is missing, unreadable, or in the future", () => {
    expect(presenceHeartbeatIsCurrent({ ...active, lastSeenAt: undefined }, "student", NOW)).toBe(false);
    expect(presenceHeartbeatIsCurrent({ ...active, lastSeenAt: "not a date" }, "student", NOW)).toBe(false);
    expect(presenceHeartbeatIsCurrent({ ...active, lastSeenAt: new Date(NOW.getTime() + 5000) }, "student", NOW)).toBe(false);
  });

  it("accepts the ISO strings a lean read or JSON gives back", () => {
    expect(presenceHeartbeatIsCurrent({ ...active, lastSeenAt: secondsAgo(2).toISOString() }, "student", NOW)).toBe(true);
  });
});

describe("scheduledSessionStartIsNoop", () => {
  const started = {
    _id: new Types.ObjectId(SESSION),
    status: "ongoing",
    actualStartedAt: secondsAgo(600),
    conductedBy: new Types.ObjectId(COACH),
    coachAttendanceStatus: "present",
  };
  const classroom = (session: Record<string, unknown>, status = "ongoing") => ({ status, generatedSessions: [session] });

  it("skips the load-and-save when the class is already started by this coach", () => {
    expect(scheduledSessionStartIsNoop({ classroom: classroom(started), scheduledSessionId: SESSION, actorId: COACH })).toBe(true);
  });

  it("runs the first time the coach opens the room", () => {
    const fresh = { _id: SESSION, status: "scheduled", coachAttendanceStatus: "pending" };
    expect(scheduledSessionStartIsNoop({ classroom: classroom(fresh, "scheduled"), scheduledSessionId: SESSION, actorId: COACH })).toBe(false);
  });

  it("runs when a different teacher polls, so conductedBy follows them as before", () => {
    expect(scheduledSessionStartIsNoop({ classroom: classroom(started), scheduledSessionId: SESSION, actorId: ADMIN })).toBe(false);
  });

  it("matches conductedBy whether it is an id or a populated user", () => {
    const populated = { ...started, conductedBy: { _id: new Types.ObjectId(COACH), name: "Coach" } };
    expect(scheduledSessionStartIsNoop({ classroom: classroom(populated), scheduledSessionId: SESSION, actorId: COACH })).toBe(true);
    expect(scheduledSessionStartIsNoop({ classroom: classroom({ ...started, conductedBy: COACH }), scheduledSessionId: SESSION, actorId: COACH })).toBe(true);
  });

  it("runs when any field it sets is not yet in place", () => {
    const run = (patch: Record<string, unknown>, status = "ongoing") =>
      scheduledSessionStartIsNoop({ classroom: classroom({ ...started, ...patch }, status), scheduledSessionId: SESSION, actorId: COACH });
    expect(run({ actualStartedAt: undefined })).toBe(false);
    expect(run({ coachAttendanceStatus: "pending" })).toBe(false);
    expect(run({ status: "scheduled" })).toBe(false);
    expect(run({ status: "in_progress" })).toBe(false);
    expect(run({}, "scheduled")).toBe(false);
  });

  it("keeps conductedBy when there is no actor, as the full function does", () => {
    expect(scheduledSessionStartIsNoop({ classroom: classroom(started), scheduledSessionId: SESSION })).toBe(true);
  });

  it("is a no-op for classes in a final state, which the full function leaves alone", () => {
    for (const status of ["cancelled", "completed", "absent", "coach_no_show", "student_no_show"]) {
      expect(scheduledSessionStartIsNoop({ classroom: classroom({ ...started, status }), scheduledSessionId: SESSION, actorId: COACH })).toBe(true);
    }
  });

  it("is a no-op for a session the classroom does not hold, as the full function finds nothing to update", () => {
    expect(scheduledSessionStartIsNoop({ classroom: classroom(started), scheduledSessionId: `${COACH}-single`, actorId: COACH })).toBe(true);
  });

  it("does not skip without a classroom to judge from", () => {
    expect(scheduledSessionStartIsNoop({ classroom: null, scheduledSessionId: SESSION, actorId: COACH })).toBe(false);
  });
});

describe("attachClassroomPeople", () => {
  const user = (id: string, name: string, role = "student") => ({ _id: new Types.ObjectId(id), name, email: `${name}@x.test`, username: `${name}@ENV`, role });
  const users = [user(COACH, "coach", "instructor"), user(ADMIN, "admin", "admin"), user(S1, "s1"), user(S2, "s2")];

  it("gives what populate gave: user documents in place of ids, students in order", () => {
    const lean = { _id: "c1", title: "Class", coach: new Types.ObjectId(COACH), instructor: new Types.ObjectId(ADMIN), students: [new Types.ObjectId(S2), new Types.ObjectId(S1)] };
    const result = attachClassroomPeople(lean, users);
    expect(result.coach).toEqual(users[0]);
    expect(result.instructor).toEqual(users[1]);
    expect(result.students).toEqual([users[3], users[2]]);
    expect(result.title).toBe("Class");
  });

  it("drops a student whose account no longer exists, as populate does", () => {
    const lean = { students: [new Types.ObjectId(S1), new Types.ObjectId(GONE)] };
    expect(attachClassroomPeople(lean, users).students).toEqual([users[2]]);
  });

  it("sets a coach or instructor with no account to null, as populate does", () => {
    const lean = { coach: new Types.ObjectId(GONE), instructor: new Types.ObjectId(COACH), students: [] };
    const result = attachClassroomPeople(lean, users);
    expect(result.coach).toBeNull();
    expect(result.instructor).toEqual(users[0]);
  });

  it("leaves absent references absent", () => {
    const result = attachClassroomPeople({ coach: new Types.ObjectId(COACH) } as Record<string, any>, users);
    expect("instructor" in result).toBe(false);
    expect(result.students).toBeUndefined();
  });

  it("gives the coach and instructor their own copies when they are the same person", () => {
    const lean = { coach: new Types.ObjectId(COACH), instructor: new Types.ObjectId(COACH) };
    const result = attachClassroomPeople(lean, users);
    expect(result.coach).toEqual(result.instructor);
    expect(result.coach).not.toBe(result.instructor);
  });

  it("does not modify the classroom it was given", () => {
    const lean = { coach: new Types.ObjectId(COACH), students: [new Types.ObjectId(S1)] };
    attachClassroomPeople(lean, users);
    expect(lean.coach).toBeInstanceOf(Types.ObjectId);
    expect(lean.students[0]).toBeInstanceOf(Types.ObjectId);
  });
});

describe("classroomPeopleIds", () => {
  it("asks for each person once, however many roles they hold", () => {
    const ids = classroomPeopleIds({ coach: new Types.ObjectId(COACH), instructor: new Types.ObjectId(COACH), students: [new Types.ObjectId(S1), new Types.ObjectId(S1), S2] });
    expect(ids).toEqual([COACH, S1, S2]);
  });

  it("skips empty and malformed references, which could match no user anyway", () => {
    expect(classroomPeopleIds({ coach: null, instructor: "legacy-name", students: [undefined, S1] })).toEqual([S1]);
  });
});
