import { describe, expect, it } from "vitest";
import { cycleDueAt, cycleOpensAt, monthBounds, openCycleMonth, shiftMonth } from "@/lib/feedback/feedbackCycleDates";

describe("feedback cycle dates (IST)", () => {
  it("opens on the 25th at midnight IST", () => {
    expect(cycleOpensAt("2026-09").toISOString()).toBe("2026-09-24T18:30:00.000Z");
  });

  it("is due at 23:59 IST on the 5th of the next month, rolling December into January", () => {
    expect(cycleDueAt("2026-09").toISOString()).toBe("2026-10-05T18:29:59.999Z");
    expect(cycleDueAt("2026-12").toISOString()).toBe("2027-01-05T18:29:59.999Z");
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
  });

  it("knows which cycle is open", () => {
    expect(openCycleMonth(new Date("2026-09-24T18:29:00Z"))).toBeNull(); // 24 Sep 23:59 IST
    expect(openCycleMonth(new Date("2026-09-24T18:31:00Z"))).toBe("2026-09"); // 25 Sep 00:01 IST
    expect(openCycleMonth(new Date("2026-10-03T06:00:00Z"))).toBe("2026-09"); // still September's until the 5th
    expect(openCycleMonth(new Date("2026-10-06T06:00:00Z"))).toBeNull();
    expect(openCycleMonth(new Date("2027-01-02T06:00:00Z"))).toBe("2026-12");
  });

  it("treats 00:30 IST on the 1st as the new month, not the old one", () => {
    // 1 Oct 00:30 IST = 30 Sep 19:00 UTC - the hour-24 ICU bug would misread this.
    expect(openCycleMonth(new Date("2026-09-30T19:00:00Z"))).toBe("2026-09");
    const { start, end } = monthBounds("2026-10");
    expect(start.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-10-31T18:29:59.999Z");
  });
});
