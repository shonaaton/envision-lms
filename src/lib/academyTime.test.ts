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

/**
 * The production Node 20 image resolves en-CA to the h24 hour cycle, so it
 * prints the midnight hour as "24" while a developer's newer Node prints "00".
 * The difference is invisible on a dev machine, so the broken clock is forced
 * on here: without it this suite passes on both, and a class booked at 00:30
 * IST still lands a day early in production.
 */
describe("on an ICU build that reports the midnight hour as 24", () => {
  const RealDateTimeFormat = Intl.DateTimeFormat;

  function withH24Clock<T>(run: () => T): T {
    class H24DateTimeFormat extends RealDateTimeFormat {
      formatToParts(value?: number | Date) {
        const parts = super.formatToParts(value as any);
        return parts.map((part) =>
          part.type === "hour" && part.value === "00" ? { ...part, value: "24" } : part
        );
      }
    }
    (Intl as any).DateTimeFormat = H24DateTimeFormat;
    try {
      return run();
    } finally {
      (Intl as any).DateTimeFormat = RealDateTimeFormat;
    }
  }

  it("reads the midnight hour back as 00:30, not 24:30", () => {
    // 19:00 UTC is 00:30 the next day in Asia/Kolkata.
    expect(withH24Clock(() => academyTimeOfDay(new Date("2026-09-20T19:00:00Z")))).toBe("00:30");
  });

  it("keeps a class picked for 00:30 on the day it was picked for", () => {
    // Picking 22 Sept 00:30 IST used to save 21 Sept 00:30 - one day early -
    // because the offset came back as 29.5 hours instead of 5.5.
    expect(withH24Clock(() => academyDateTime("2026-09-22", "00:30").toISOString()))
      .toBe("2026-09-21T19:00:00.000Z");
  });

  it("still agrees with a working clock on every hour of the day", () => {
    const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:30`);
    const working = hours.map((time) => academyDateTime("2026-09-22", time).toISOString());
    expect(withH24Clock(() => hours.map((time) => academyDateTime("2026-09-22", time).toISOString())))
      .toEqual(working);
  });
});
