import { describe, expect, it } from "vitest";
import {
  coachCanAccessClassroomSession,
  coachCanViewClassroomSession,
  coachClassroomQuery,
  limitClassroomToCoachSessions,
} from "@/lib/classroomCoachAccess";

const OLD = "old-coach";
const NEW = "new-coach";
const COVER = "cover-coach";

// After a permanent change: two classes the old coach held, one ahead for the new coach.
const room = {
  coach: NEW,
  instructor: NEW,
  generatedSessions: [
    { _id: "past-1", status: "completed", assignedCoach: OLD, conductedBy: OLD },
    { _id: "past-covered", status: "completed", assignedCoach: OLD, substituteCoach: COVER },
    { _id: "next", status: "scheduled" },
  ],
};

describe("after a permanent coach change", () => {
  it("lets the old coach view only the classes they held", () => {
    expect(coachCanViewClassroomSession(room, OLD, "past-1")).toBe(true);
    expect(coachCanViewClassroomSession(room, OLD, "next")).toBe(false);
    expect(limitClassroomToCoachSessions(room, OLD).generatedSessions.map((s: any) => s._id)).toEqual(["past-1", "past-covered"]);
  });

  it("never lets the old coach act on those classes", () => {
    expect(coachCanAccessClassroomSession(room, OLD, "past-1")).toBe(false);
    expect(coachCanAccessClassroomSession(room, OLD, "next")).toBe(false);
  });

  it("gives the new coach the upcoming classes, and history to read but not change", () => {
    expect(coachCanAccessClassroomSession(room, NEW, "next")).toBe(true);
    expect(coachCanAccessClassroomSession(room, NEW, "past-1")).toBe(false);
    expect(coachCanViewClassroomSession(room, NEW, "past-1")).toBe(true);
  });

  it("keeps a past cover coach's access to the class they covered", () => {
    expect(coachCanAccessClassroomSession(room, COVER, "past-covered")).toBe(true);
    expect(coachCanViewClassroomSession(room, COVER, "past-1")).toBe(false);
  });

  it("lists the classroom for the old coach", () => {
    expect(coachClassroomQuery(OLD).$or).toContainEqual({ "generatedSessions.assignedCoach": OLD });
  });
});
