import { describe, expect, it } from "vitest";
import { newDateProblem, occurrenceOn, scheduleFor, templateWhen, whenLabel, type SessionRecord } from "@/lib/branch/classSessionRules";

// Tuesday 5pm-6pm. 2026-11-24 and 2026-12-01 are Tuesdays.
const slot = { dayOfWeek: 2, startTime: "17:00", endTime: "18:00", isActive: true };

describe("one meeting of a weekly class", () => {
  it("meets on its weekday and nowhere else", () => {
    expect(occurrenceOn(slot, "2026-11-24", [])).toMatchObject({ kind: "regular", startTime: "17:00", closed: "" });
    expect(occurrenceOn(slot, "2026-11-25", [])).toBeNull();
    expect(occurrenceOn({ ...slot, isActive: false }, "2026-11-24", [])).toBeNull();
  });

  it("a cancelled meeting is still that date's class, closed", () => {
    const records: SessionRecord[] = [{ kind: "cancelled", date: "2026-11-24", reason: "Coach unwell" }];
    expect(occurrenceOn(slot, "2026-11-24", records)).toMatchObject({ cancelled: true, closed: "Class cancelled: Coach unwell" });
  });

  it("a moved meeting closes its usual date and opens the new one at its own time", () => {
    const records: SessionRecord[] = [{ id: "m", kind: "moved", date: "2026-11-27", fromDate: "2026-11-24", startTime: "18:00", endTime: "19:00", guests: ["g"] }];
    expect(occurrenceOn(slot, "2026-11-24", records)?.movedTo).toEqual({ date: "2026-11-27", startTime: "18:00" });
    expect(occurrenceOn(slot, "2026-11-24", records)?.closed).toBe("Class moved to Fri 27 Nov, 6pm");
    expect(occurrenceOn(slot, "2026-11-27", records)).toMatchObject({ kind: "moved", startTime: "18:00", fromDate: "2026-11-24", guests: ["g"], closed: "" });
  });

  it("a new time on the same day keeps the class on", () => {
    const records: SessionRecord[] = [{ kind: "moved", date: "2026-11-24", fromDate: "2026-11-24", startTime: "19:00", endTime: "20:00" }];
    expect(occurrenceOn(slot, "2026-11-24", records)).toMatchObject({ kind: "moved", startTime: "19:00", closed: "" });
  });

  it("an extra meeting happens off the weekday; guests sit on a usual meeting", () => {
    expect(occurrenceOn(slot, "2026-11-29", [{ kind: "extra", date: "2026-11-29", startTime: "10:00", endTime: "11:00" }])).toMatchObject({ kind: "extra", startTime: "10:00" });
    expect(occurrenceOn(slot, "2026-11-24", [{ id: "r", kind: "regular", date: "2026-11-24", guests: ["a", "b"] }])).toMatchObject({ kind: "regular", guests: ["a", "b"], sessionId: "r" });
  });
});

describe("the coming weeks", () => {
  it("lists usual weeks with changes and added meetings in date order", () => {
    const records: SessionRecord[] = [
      { kind: "cancelled", date: "2026-11-24" },
      { kind: "moved", date: "2026-12-03", fromDate: "2026-12-01", startTime: "17:00", endTime: "18:00" },
      { kind: "extra", date: "2026-11-29", startTime: "10:00", endTime: "11:00" },
    ];
    const schedule = scheduleFor(slot, records, "2026-11-24", 14);
    expect(schedule.map((item) => [item.date, item.kind, item.cancelled, Boolean(item.movedTo)])).toEqual([
      ["2026-11-24", "regular", true, false],
      ["2026-11-29", "extra", false, false],
      ["2026-12-01", "regular", false, true],
      ["2026-12-03", "moved", false, false],
    ]);
  });
});

describe("picking a new date", () => {
  it("refuses the past, a date that already has this class, and a cancelled usual date", () => {
    expect(newDateProblem(slot, "2026-11-20", [], "2026-11-24")).toMatch(/today or a later/);
    expect(newDateProblem(slot, "2026-12-01", [], "2026-11-24")).toMatch(/already meets/);
    expect(newDateProblem(slot, "2026-11-29", [{ id: "x", kind: "extra", date: "2026-11-29" }], "2026-11-24")).toMatch(/already has a meeting/);
    expect(newDateProblem(slot, "2026-12-01", [{ kind: "cancelled", date: "2026-12-01" }], "2026-11-24")).toMatch(/Restore it instead/);
    expect(newDateProblem(slot, "2026-11-27", [], "2026-11-24")).toBe("");
  });

  it("lets a moved meeting be moved again onto its own date", () => {
    const records: SessionRecord[] = [{ id: "m", kind: "moved", date: "2026-11-27", fromDate: "2026-11-24" }];
    expect(newDateProblem(slot, "2026-11-27", records, "2026-11-24", "m")).toBe("");
  });
});

describe("labels", () => {
  it("writes dates for the screen and for WhatsApp templates", () => {
    expect(whenLabel("2026-11-24", "17:30")).toBe("Tue 24 Nov, 5:30pm");
    expect(templateWhen("2026-11-24", "17:00")).toBe("24 Nov 2026, 5:00 PM IST");
    expect(templateWhen("2026-11-24", "00:15")).toBe("24 Nov 2026, 12:15 AM IST");
  });
});
