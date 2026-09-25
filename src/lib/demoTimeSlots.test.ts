import { describe, expect, it } from "vitest";
import { zonedDateTime } from "@/lib/academyTime";
import { dateKeyIn, demoTimeOptions, isValidTimeZone, timeZoneChoices, twelveHourLabel, upcomingDemoDays } from "@/lib/demoTimeSlots";

describe("zonedDateTime with a picked calendar day", () => {
  it("keeps the day a parent west of UTC picked", () => {
    // Used to come back as 29 Sept 17:00 in New York.
    expect(zonedDateTime("2026-09-30", "17:00", "America/New_York").toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(zonedDateTime("2026-09-30", "17:00", "America/Los_Angeles").toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("is unchanged for India", () => {
    expect(zonedDateTime("2026-09-30", "17:00", "Asia/Kolkata").toISOString()).toBe("2026-09-30T11:30:00.000Z");
    expect(zonedDateTime("2026-09-30", "00:30", "Asia/Kolkata").toISOString()).toBe("2026-09-29T19:00:00.000Z");
  });
});

describe("demo day and time options", () => {
  // 23:00 on 24 Sept in New York = 03:00 UTC on 25 Sept = 08:30 on 25 Sept in India.
  const now = new Date("2026-09-25T03:00:00Z");

  it("starts the day list on the parent's own today", () => {
    expect(dateKeyIn("America/New_York", now)).toBe("2026-09-24");
    const days = upcomingDemoDays("America/New_York", 3, now);
    expect(days.map((day) => day.key)).toEqual(["2026-09-24", "2026-09-25", "2026-09-26"]);
    expect(days[0].relative).toBe("Today");
    expect(days[2].weekday).toBe("Sat");
    expect(upcomingDemoDays("Asia/Kolkata", 1, now)[0].key).toBe("2026-09-25");
  });

  it("only offers times at least 30 minutes away", () => {
    expect(demoTimeOptions("2026-09-24", "America/New_York", now).map((option) => option.time)).toEqual(["23:30"]);
    const india = demoTimeOptions("2026-09-25", "Asia/Kolkata", now);
    expect(india[0].time).toBe("09:00");
    expect(india.at(-1)?.time).toBe("23:30");
    expect(demoTimeOptions("2026-09-26", "Asia/Kolkata", now)).toHaveLength(48);
  });

  it("every offered time maps back to the wall clock it shows", () => {
    for (const option of demoTimeOptions("2026-09-26", "America/Chicago", now)) {
      expect(option.start.getTime()).toBe(zonedDateTime("2026-09-26", option.time, "America/Chicago").getTime());
    }
  });

  it("labels times on a 12-hour clock", () => {
    expect(twelveHourLabel("00:30")).toBe("12:30 AM");
    expect(twelveHourLabel("12:00")).toBe("12:00 PM");
    expect(twelveHourLabel("17:30")).toBe("5:30 PM");
  });
});

describe("timezones", () => {
  it("rejects free text like 'IST'", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Indian time")).toBe(false);
  });

  it("puts the device zone first without duplicating it", () => {
    const choices = timeZoneChoices("America/New_York");
    expect(choices[0]).toMatchObject({ zone: "America/New_York", group: "Your device" });
    expect(choices.filter((choice) => choice.zone === "America/New_York")).toHaveLength(1);
  });
});
