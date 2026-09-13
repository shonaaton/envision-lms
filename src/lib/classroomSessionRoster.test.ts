import { describe, expect, it } from "vitest";

import { rosterForSession, sessionRosterWithStudent, studentsMissingFromSessionRoster } from "./classroomStudentExits";

const A = "aaaaaaaaaaaaaaaaaaaaaaa1";
const B = "aaaaaaaaaaaaaaaaaaaaaaa2";
const C = "aaaaaaaaaaaaaaaaaaaaaaa3";
const CLASS_AT = new Date("2026-09-14T12:30:00.000Z");

describe("sessionRosterWithStudent", () => {
  it("leaves an inherited roster alone, so reinstating one student cannot shrink the class to them", () => {
    const classroom = { students: [A, B, C], generatedSessions: [] as any[] };
    const session = { _id: "s1", scheduledFor: CLASS_AT, students: [] };
    expect(sessionRosterWithStudent(session, A)).toBeNull();
    // The bug this guards: writing `[A]` here turned B and C away from the room.
    expect(rosterForSession(classroom, session)).toEqual([A, B, C]);
  });

  it("appends to a written-out roster", () => {
    expect(sessionRosterWithStudent({ students: [B] }, A)).toEqual([B, A]);
  });

  it("does nothing when the student is already on it", () => {
    expect(sessionRosterWithStudent({ students: [A, B] }, A)).toBeNull();
  });
});

describe("studentsMissingFromSessionRoster", () => {
  it("finds classroom members a written-out roster left off", () => {
    const classroom = { students: [A, B, C] };
    expect(studentsMissingFromSessionRoster(classroom, { scheduledFor: CLASS_AT, students: [A] })).toEqual([B, C]);
  });

  it("has nothing to add to an inherited roster", () => {
    expect(studentsMissingFromSessionRoster({ students: [A, B] }, { scheduledFor: CLASS_AT, students: [] })).toEqual([]);
  });

  it("keeps off a student who left the classroom before the class", () => {
    const classroom = { students: [A, B], studentExits: [{ student: B, exitedAt: new Date("2026-09-10T00:00:00.000Z") }] };
    expect(studentsMissingFromSessionRoster(classroom, { scheduledFor: CLASS_AT, students: [A] })).toEqual([]);
  });

  it("keeps off paused or deactivated students passed in skip", () => {
    const classroom = { students: [A, B, C] };
    expect(studentsMissingFromSessionRoster(classroom, { scheduledFor: CLASS_AT, students: [A] }, { skip: new Set([C]) })).toEqual([B]);
  });

  it("keeps off a student whose batch enrolment starts after the class", () => {
    const classroom = { students: [A, B, C] };
    const joinedAt = new Map([
      [B, new Date("2026-09-21T00:00:00.000Z")],
      [C, new Date("2026-09-01T00:00:00.000Z")],
    ]);
    expect(studentsMissingFromSessionRoster(classroom, { scheduledFor: CLASS_AT, students: [A] }, { joinedAt })).toEqual([C]);
  });
});
