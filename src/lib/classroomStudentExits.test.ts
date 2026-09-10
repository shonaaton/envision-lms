import { describe, expect, it } from "vitest";

import {
  hasStudentExited,
  rosterForSession,
  sessionsVisibleToStudent,
  studentExitDate,
  studentIsOnSessionRoster,
} from "./classroomStudentExits";

const MOVED = "aaaaaaaaaaaaaaaaaaaaaaa1";
const STAYED = "aaaaaaaaaaaaaaaaaaaaaaa2";
const EXIT = new Date("2026-09-10T12:00:00.000Z");

const before = { _id: "s1", scheduledFor: new Date("2026-09-03T10:00:00.000Z") };
const sameDayEarlier = { _id: "s2", scheduledFor: new Date("2026-09-10T09:00:00.000Z") };
const after = { _id: "s3", scheduledFor: new Date("2026-09-17T10:00:00.000Z") };

function classroom(overrides: Record<string, unknown> = {}) {
  return {
    students: [MOVED, STAYED],
    studentExits: [{ student: MOVED, exitedAt: EXIT, fromBatch: "b1", movedToBatch: "b2" }],
    generatedSessions: [before, sameDayEarlier, after],
    ...overrides,
  };
}

describe("studentExitDate", () => {
  it("reports the exit date for a student who left", () => {
    expect(studentExitDate(classroom(), MOVED)).toEqual(EXIT);
    expect(hasStudentExited(classroom(), MOVED)).toBe(true);
  });

  it("reports nothing for a student who is still in the classroom", () => {
    expect(studentExitDate(classroom(), STAYED)).toBeNull();
    expect(hasStudentExited(classroom(), STAYED)).toBe(false);
  });

  it("takes the latest exit when a student left, came back and left again", () => {
    const later = new Date("2026-10-01T12:00:00.000Z");
    const doc = classroom({
      studentExits: [
        { student: MOVED, exitedAt: EXIT },
        { student: MOVED, exitedAt: later },
      ],
    });
    expect(studentExitDate(doc, MOVED)).toEqual(later);
  });
});

describe("rosterForSession", () => {
  it("keeps a departed student on a class that ran before they left", () => {
    expect(rosterForSession(classroom(), before)).toEqual([MOVED, STAYED]);
    expect(rosterForSession(classroom(), sameDayEarlier)).toEqual([MOVED, STAYED]);
  });

  it("drops a departed student from a class scheduled after they left", () => {
    expect(rosterForSession(classroom(), after)).toEqual([STAYED]);
  });

  it("drops them even when the session roster is empty and falls back to the classroom", () => {
    // The regression this whole mechanism exists for: emptying a session roster
    // used to hand the classroom's full list straight back.
    const emptyRoster = { _id: "s4", scheduledFor: after.scheduledFor, students: [] };
    expect(rosterForSession(classroom(), emptyRoster)).toEqual([STAYED]);
  });

  it("honours a session's own roster before applying the exit", () => {
    const ownRoster = { _id: "s5", scheduledFor: before.scheduledFor, students: [STAYED] };
    expect(rosterForSession(classroom(), ownRoster)).toEqual([STAYED]);
  });

  it("withholds an undated session from someone who has left", () => {
    const undated = { _id: "s6" };
    expect(rosterForSession(classroom({ classDate: undefined, startDate: undefined }), undated)).toEqual([STAYED]);
  });

  it("leaves a classroom with no exits completely alone", () => {
    const doc = classroom({ studentExits: [] });
    expect(rosterForSession(doc, after)).toEqual([MOVED, STAYED]);
  });
});

describe("sessionsVisibleToStudent", () => {
  it("gives a departed student everything up to the day they left", () => {
    expect(sessionsVisibleToStudent(classroom(), MOVED)).toEqual([before, sameDayEarlier]);
  });

  it("gives a current student every session", () => {
    expect(sessionsVisibleToStudent(classroom(), STAYED)).toHaveLength(3);
  });
});

describe("studentIsOnSessionRoster", () => {
  it("lets a departed student back into a class they actually sat", () => {
    expect(studentIsOnSessionRoster(classroom(), before, MOVED)).toBe(true);
  });

  it("turns a departed student away from a later class", () => {
    expect(studentIsOnSessionRoster(classroom(), after, MOVED)).toBe(false);
  });

  it("turns away someone who was never in the classroom", () => {
    expect(studentIsOnSessionRoster(classroom(), before, "aaaaaaaaaaaaaaaaaaaaaaa9")).toBe(false);
  });
});
