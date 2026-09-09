import { describe, expect, it } from "vitest";
import { firstClassDateLabel, scheduledDateLabel } from "@/lib/firstClassDate";

// A Sunday 18:30 IST series starting 13 Sept 2026. `startDate` is what a date
// input stores - midnight UTC - while the generated session carries the real
// instant (18:30 IST = 13:00 UTC).
const sundaySeries = {
  startDate: new Date("2026-09-13T00:00:00.000Z"),
  startTime: "18:30",
  durationMinutes: 60,
  daysOfWeek: [{ day: 0, slots: [{ startTime: "18:30", durationMinutes: 60 }] }],
  generatedSessions: [
    { _id: "s1", scheduledFor: new Date("2026-09-13T13:00:00.000Z"), startTime: "18:30" },
    { _id: "s2", scheduledFor: new Date("2026-09-20T13:00:00.000Z"), startTime: "18:30" },
  ],
};

describe("firstClassDateLabel", () => {
  it("reads the first class off the scheduled session, not the bare start date", () => {
    // The bug: midnight UTC sorts ahead of the same day's real session, so a
    // 18:30 class was announced to its coach as "13 Sept 2026, 5:30 am IST".
    const label = firstClassDateLabel([sundaySeries]);
    expect(label).toContain("13 Sept 2026");
    expect(label).toContain("6:30");
    expect(label).not.toContain("5:30 am");
  });

  it("falls back to the start date with its scheduled time when no session exists yet", () => {
    const { generatedSessions, ...notGeneratedYet } = sundaySeries;
    expect(firstClassDateLabel([notGeneratedYet])).toBe("13 Sept 2026 at 18:30");
  });

  it("prefers the session the message is actually about", () => {
    const label = firstClassDateLabel([sundaySeries], sundaySeries.generatedSessions[1]);
    expect(label).toContain("20 Sept 2026");
  });

  it("picks the earliest class across a batch's classrooms", () => {
    const later = { ...sundaySeries, generatedSessions: [{ _id: "s3", scheduledFor: new Date("2026-10-04T13:00:00.000Z") }] };
    expect(firstClassDateLabel([later, sundaySeries])).toContain("13 Sept 2026");
  });

  it("says so when there is nothing scheduled", () => {
    expect(firstClassDateLabel([{ title: "Unscheduled" }])).toBe("Not set");
  });
});

describe("scheduledDateLabel", () => {
  it("never prints a time of day the classroom does not have", () => {
    expect(scheduledDateLabel(sundaySeries, sundaySeries.startDate)).toBe("13 Sept 2026 at 18:30");
    expect(scheduledDateLabel({ title: "No time set" }, "2026-09-13")).toBe("13 Sept 2026");
  });
});
