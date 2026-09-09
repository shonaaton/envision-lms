import { describe, expect, it } from "vitest";
import {
  academyDateTime,
  academyDateTimeLocalInput,
  academyTimeOfDay,
  parseAcademyDateTimeLocal,
} from "@/lib/academyTime";

describe("academyTimeOfDay", () => {
  it("returns the academy wall-clock time, not the server's", () => {
    // 08:50 UTC is 14:20 in Asia/Kolkata.
    expect(academyTimeOfDay(new Date("2026-09-08T08:50:00Z"))).toBe("14:20");
  });

  it("round-trips with academyDateTime, which is how join windows are read back", () => {
    const start = new Date("2026-09-08T08:50:00Z");
    expect(academyDateTime(start, academyTimeOfDay(start)).getTime()).toBe(start.getTime());
  });

  it("writes midnight as 00:00", () => {
    // 18:30 UTC is 00:00 the next day in Asia/Kolkata.
    expect(academyTimeOfDay(new Date("2026-09-07T18:30:00Z"))).toBe("00:00");
  });
});

describe("datetime-local round trip", () => {
  // 06:07 UTC is 11:37 in Asia/Kolkata - the slot a parent booked, and the slot
  // the admin picker has to show back.
  const booked = new Date("2026-09-09T06:07:00Z");

  it("fills the picker with academy wall-clock time, not the host's", () => {
    expect(academyDateTimeLocalInput(booked)).toBe("2026-09-09T11:37");
  });

  it("reads a bare picker value back as academy time", () => {
    expect(parseAcademyDateTimeLocal("2026-09-09T11:37").toISOString()).toBe(booked.toISOString());
  });

  it("survives the render/submit round trip that moved confirmed demos", () => {
    const value = academyDateTimeLocalInput(booked);
    expect(parseAcademyDateTimeLocal(value).getTime()).toBe(booked.getTime());
  });

  it("keeps the admin's chosen time and the classroom label in step", () => {
    const chosen = parseAcademyDateTimeLocal("2026-09-09T11:42");
    // What upsertDemoClassroom writes to Classroom.startTime, and what
    // getSessionStart reads back out of it.
    expect(academyTimeOfDay(chosen)).toBe("11:42");
    expect(academyDateTime(chosen, academyTimeOfDay(chosen)).getTime()).toBe(chosen.getTime());
  });

  it("passes through values that already carry a zone", () => {
    expect(parseAcademyDateTimeLocal("2026-09-09T06:07:00.000Z").getTime()).toBe(booked.getTime());
    expect(parseAcademyDateTimeLocal(booked).getTime()).toBe(booked.getTime());
  });

  it("has no time to show for an empty or unparseable value", () => {
    expect(academyDateTimeLocalInput("")).toBe("");
    expect(academyDateTimeLocalInput("not a date")).toBe("");
    expect(Number.isNaN(parseAcademyDateTimeLocal("not a date").getTime())).toBe(true);
  });
});
