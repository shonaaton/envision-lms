import { describe, expect, it } from "vitest";
import { syncDemoSession } from "@/lib/demoClassroom";

const newTime = {
  start: new Date("2026-09-15T08:50:00Z"),
  startTimeLabel: "14:20",
  durationMinutes: 30,
};

describe("syncDemoSession", () => {
  it("moves a demo that has not happened yet to the new time", () => {
    const classroom: any = {
      generatedSessions: [
        { _id: "s1", sessionNumber: 1, scheduledFor: new Date("2026-09-08T08:50:00Z"), startTime: "14:20", durationMinutes: 30, status: "scheduled" },
      ],
    };
    syncDemoSession(classroom, newTime);
    expect(classroom.generatedSessions).toHaveLength(1);
    expect(classroom.generatedSessions[0]._id).toBe("s1");
    expect(classroom.generatedSessions[0].scheduledFor).toBe(newTime.start);
    expect(classroom.generatedSessions[0].startTime).toBe("14:20");
  });

  it("starts a new session when the demo was missed, keeping the no-show on record", () => {
    const missed = {
      _id: "s1",
      sessionNumber: 1,
      scheduledFor: new Date("2026-09-08T08:50:00Z"),
      startTime: "14:20",
      durationMinutes: 30,
      status: "student_no_show",
      actualEndedAt: new Date("2026-09-08T09:20:00Z"),
      attendanceMarkedAt: new Date("2026-09-08T09:20:00Z"),
    };
    const classroom: any = { generatedSessions: [missed] };
    syncDemoSession(classroom, newTime);
    expect(classroom.generatedSessions).toHaveLength(2);
    expect(classroom.generatedSessions[0]).toEqual(missed);
    expect(classroom.generatedSessions[1]).toMatchObject({
      sessionNumber: 2,
      scheduledFor: newTime.start,
      startTime: "14:20",
      status: "scheduled",
    });
  });

  it("starts a new session when the previous demo was already taught", () => {
    const classroom: any = {
      generatedSessions: [{ _id: "s1", sessionNumber: 1, status: "completed", actualEndedAt: new Date(), attendanceMarkedAt: new Date() }],
    };
    syncDemoSession(classroom, newTime);
    expect(classroom.generatedSessions).toHaveLength(2);
    expect(classroom.generatedSessions[1].status).toBe("scheduled");
  });

  it("creates the first session for a classroom that has none", () => {
    const classroom: any = {};
    syncDemoSession(classroom, newTime);
    expect(classroom.generatedSessions).toHaveLength(1);
    expect(classroom.generatedSessions[0]).toMatchObject({ sessionNumber: 1, durationMinutes: 30, status: "scheduled" });
  });

  it("does not reuse a session that a coach already started", () => {
    const classroom: any = {
      generatedSessions: [{ _id: "s1", sessionNumber: 1, status: "ongoing", actualStartedAt: new Date() }],
    };
    syncDemoSession(classroom, newTime);
    expect(classroom.generatedSessions).toHaveLength(2);
  });
});
