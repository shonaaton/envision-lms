import { describe, expect, it } from "vitest";
import { applyPermanentCoachChange, isUpcomingSession } from "@/lib/classroomCoachChange";

const NOW = new Date("2026-09-28T10:00:00Z");
const OLD = "old-coach";
const NEW = "new-coach";
const COVER = "cover-coach";

function classroom(sessions: any[]) {
  return { coach: OLD, instructor: OLD, durationMinutes: 60, generatedSessions: sessions };
}

describe("applyPermanentCoachChange", () => {
  it("moves upcoming classes to the new coach and pins history to the old one", () => {
    const room = classroom([
      { _id: "past-taught", status: "completed", scheduledFor: "2026-09-20T10:00:00Z", actualEndedAt: "2026-09-20T11:00:00Z" },
      { _id: "past-unmarked", status: "scheduled", scheduledFor: "2026-09-21T10:00:00Z" },
      { _id: "next", status: "scheduled", scheduledFor: "2026-09-30T10:00:00Z" },
    ]);
    const result = applyPermanentCoachChange(room, NEW, NOW);
    expect(room.coach).toBe(NEW);
    expect(room.instructor).toBe(NEW);
    expect(result.previousCoachId).toBe(OLD);
    expect(result.reassignedSessionIds).toEqual(["next"]);
    expect(result.pinnedSessionIds).toEqual(["past-taught", "past-unmarked"]);
    expect(room.generatedSessions[0].conductedBy).toBe(OLD);
    expect(room.generatedSessions[2].conductedBy).toBeUndefined();
  });

  it("never overwrites who actually taught or covered a past class", () => {
    const room = classroom([
      { _id: "ran-live", status: "completed", scheduledFor: "2026-09-20T10:00:00Z", conductedBy: "someone" },
      { _id: "covered", status: "completed", scheduledFor: "2026-09-21T10:00:00Z", substituteCoach: COVER },
    ]);
    const result = applyPermanentCoachChange(room, NEW, NOW);
    expect(result.pinnedSessionIds).toEqual([]);
    expect(room.generatedSessions[0].conductedBy).toBe("someone");
    expect(room.generatedSessions[1].conductedBy).toBeUndefined();
  });

  it("keeps a third coach's cover but drops one by the old or new coach", () => {
    const room = classroom([
      { _id: "third", status: "scheduled", scheduledFor: "2026-09-29T10:00:00Z", substituteCoach: COVER },
      { _id: "by-new", status: "scheduled", scheduledFor: "2026-09-30T10:00:00Z", substituteCoach: NEW },
      { _id: "by-old", status: "scheduled", scheduledFor: "2026-10-01T10:00:00Z", substituteCoach: OLD },
    ]);
    const result = applyPermanentCoachChange(room, NEW, NOW);
    expect(result.keptCoverSessionIds).toEqual(["third"]);
    expect(result.reassignedSessionIds).toEqual(["by-new", "by-old"]);
    expect(room.generatedSessions[0].substituteCoach).toBe(COVER);
    expect(room.generatedSessions[1].substituteCoach).toBeUndefined();
    expect(room.generatedSessions[2].substituteCoach).toBeUndefined();
  });
});

describe("isUpcomingSession", () => {
  it("treats a class in progress or already started as history", () => {
    expect(isUpcomingSession({ status: "scheduled", scheduledFor: "2026-09-28T09:30:00Z", actualStartedAt: "x" }, 60, NOW)).toBe(false);
    expect(isUpcomingSession({ status: "scheduled", scheduledFor: "2026-09-28T09:30:00Z" }, 60, NOW)).toBe(true);
    expect(isUpcomingSession({ status: "cancelled", scheduledFor: "2026-10-01T10:00:00Z" }, 60, NOW)).toBe(false);
  });
});
