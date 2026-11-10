import { describe, expect, it } from "vitest";
import { demoChildLevelLabel } from "@/lib/demoRequest";
import { DEMO_SLOT_DAYS_AHEAD, demoSlotDays, demoSlotLabel, demoSlotStart, demoSlotTimes, isOpenDemoSlot } from "@/lib/demoRequestSlots";

describe("demo request slots", () => {
  // 11:30 PM IST on Tuesday 10 Nov 2026 is still 10 Nov in UTC, and 12:30 AM IST is 11 Nov there.
  const lateEvening = new Date("2026-11-10T18:00:00Z");
  const afterMidnight = new Date("2026-11-10T19:00:00Z");

  it("starts tomorrow by the academy's calendar, not the server's", () => {
    expect(demoSlotDays(lateEvening)[0].key).toBe("2026-11-11");
    expect(demoSlotDays(afterMidnight)[0].key).toBe("2026-11-12");
    expect(demoSlotDays(lateEvening)).toHaveLength(DEMO_SLOT_DAYS_AHEAD);
  });

  it("offers each weekday its own hours", () => {
    expect(demoSlotTimes("2026-11-14").map((slot) => slot.label)).toEqual(["10:00 AM", "11:00 AM", "12:00 PM", "4:00 PM"]);
    expect(demoSlotTimes("2026-11-16").map((slot) => slot.time)).toEqual(["16:00", "17:00", "18:00"]);
    expect(demoSlotTimes("not-a-date")).toEqual([]);
  });

  it("refuses a slot outside the window or the timetable", () => {
    expect(isOpenDemoSlot("2026-11-14", "16:00", lateEvening)).toBe(true);
    expect(isOpenDemoSlot("2026-11-10", "16:00", lateEvening)).toBe(false);
    expect(isOpenDemoSlot("2026-11-14", "21:00", lateEvening)).toBe(false);
    expect(isOpenDemoSlot("2027-01-02", "16:00", lateEvening)).toBe(false);
  });

  it("reads the slot as IST", () => {
    expect(demoSlotStart("2026-11-14", "16:00").toISOString()).toBe("2026-11-14T10:30:00.000Z");
    expect(demoSlotLabel("2026-11-14", "16:00")).toMatch(/^Saturday,? 14 November 2026 at 4:00 PM IST$/);
    expect(demoSlotLabel("", "")).toBe("");
  });

  it("still names the levels older requests were saved with", () => {
    expect(demoChildLevelLabel("plays_tournaments")).toBe("Plays tournaments");
    expect(demoChildLevelLabel("beginner")).toBe("Beginner");
  });
});
