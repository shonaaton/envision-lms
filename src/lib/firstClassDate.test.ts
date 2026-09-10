import { describe, expect, it } from "vitest";
import { firstClassDateLabel, nextClassDateLabel, scheduledDateLabel } from "@/lib/firstClassDate";

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

describe("nextClassDateLabel", () => {
  it("names the next session ahead, not the one the series started on", () => {
    // Mid-series: a student joining now turns up on the 20th, not the 13th.
    expect(nextClassDateLabel([sundaySeries], new Date("2026-09-15T00:00:00.000Z"))).toContain("20 Sept 2026");
  });

  it("moves on once the day's session has started", () => {
    const justAfter = new Date("2026-09-13T13:00:00.001Z");
    const label = nextClassDateLabel([sundaySeries], justAfter);
    expect(label).toContain("20 Sept 2026");
    expect(label).not.toContain("13 Sept");
  });

  it("takes the soonest upcoming class across a batch's classrooms", () => {
    const sooner = { ...sundaySeries, generatedSessions: [{ _id: "s9", scheduledFor: new Date("2026-09-16T13:00:00.000Z") }] };
    expect(nextClassDateLabel([sundaySeries, sooner], new Date("2026-09-15T00:00:00.000Z"))).toContain("16 Sept 2026");
  });

  it("falls back to the classroom's own start date when no sessions exist yet", () => {
    const { generatedSessions, ...notGeneratedYet } = sundaySeries;
    expect(nextClassDateLabel([notGeneratedYet], new Date("2026-09-01T00:00:00.000Z"))).toBe("13 Sept 2026 at 18:30");
  });

  it("still counts a class later today, whose date is stored as midnight UTC", () => {
    // 21:30 IST on the 13th: the stored date (00:00 UTC) is already behind the
    // instant, so only comparing against the start of the academy day keeps it.
    const { generatedSessions, ...notGeneratedYet } = sundaySeries;
    expect(nextClassDateLabel([notGeneratedYet], new Date("2026-09-13T16:00:00.000Z"))).toBe("13 Sept 2026 at 18:30");
  });

  it("points at the timings when nothing upcoming is scheduled", () => {
    expect(nextClassDateLabel([sundaySeries], new Date("2026-12-01T00:00:00.000Z"))).toBe("As per the batch timings");
    expect(nextClassDateLabel([{ title: "Unscheduled" }])).toBe("As per the batch timings");
  });
});
