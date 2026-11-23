import { describe, expect, it } from "vitest";
import { deriveScheduledSessionStatus, isJoinWindowOpen, isJoinWindowOpenOnServer } from "@/lib/classroomSessions";
import { academyDateTime } from "@/lib/academyTime";

// A 19:00 IST class, 60 minutes.
const session = { scheduledFor: "2026-11-23", startTime: "19:00", durationMinutes: 60, status: "scheduled" };
const at = (time: string, seconds = 0) => new Date(academyDateTime("2026-11-23", time).getTime() + seconds * 1000);

describe("class join window", () => {
  it("opens the Join button 15 minutes before the start", () => {
    expect(isJoinWindowOpen(session, at("18:44", 59))).toBe(false);
    expect(isJoinWindowOpen(session, at("18:45"))).toBe(true);
    expect(deriveScheduledSessionStatus(session, at("18:44", 59))).toBe("upcoming");
    expect(deriveScheduledSessionStatus(session, at("18:45"))).toBe("join_available");
  });

  it("lets the server accept a click a little before the button opens, so clock drift never bounces it", () => {
    expect(isJoinWindowOpen(session, at("18:44"))).toBe(false);
    expect(isJoinWindowOpenOnServer(session, at("18:44"))).toBe(true);
    expect(isJoinWindowOpenOnServer(session, at("18:42", 59))).toBe(false);
  });

  it("stays open through the class and the grace period", () => {
    expect(isJoinWindowOpen(session, at("19:30"))).toBe(true);
    expect(isJoinWindowOpen(session, at("22:00"))).toBe(true);
    expect(isJoinWindowOpen(session, at("22:00", 1))).toBe(false);
  });
});
