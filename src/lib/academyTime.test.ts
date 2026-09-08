import { describe, expect, it } from "vitest";
import { academyDateTime, academyTimeOfDay } from "@/lib/academyTime";

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
