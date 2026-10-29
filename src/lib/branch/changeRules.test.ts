import { describe, expect, it } from "vitest";
import { sameWeekDate, seatsTakenOn, slotsAfterChange, weekMoveProblem, weekStart } from "@/lib/branch/changeRules";

describe("weeks", () => {
  it("starts the centre's week on Monday and ends it on Sunday", () => {
    expect(weekStart("2026-10-28")).toBe("2026-10-26"); // Wednesday -> Monday
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // Sunday closes the same week
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
  });

  it("finds the other slot's date in the same week", () => {
    expect(sameWeekDate("2026-10-28", 6)).toBe("2026-10-31"); // Wed -> that Saturday
    expect(sameWeekDate("2026-10-28", 0)).toBe("2026-11-01"); // Wed -> that Sunday
    expect(sameWeekDate("2026-11-01", 2)).toBe("2026-10-27"); // Sun -> the Tuesday before
    expect(sameWeekDate("2026-12-30", 4)).toBe("2026-12-31"); // across the year end
  });
});

describe("seats on a date", () => {
  it("counts members, less those away, plus visitors", () => {
    expect(seatsTakenOn(7, 1, 0)).toBe(6);
    expect(seatsTakenOn(6, 0, 1)).toBe(7);
    expect(seatsTakenOn(0, 2, 1)).toBe(1);
  });
});

describe("permanent change", () => {
  it("swaps one slot for another and keeps the rest", () => {
    expect(slotsAfterChange(["a", "b"], "a", "c")).toEqual(["b", "c"]);
    expect(slotsAfterChange([], null, "c")).toEqual(["c"]);
    expect(slotsAfterChange(["a"], null, "a")).toEqual(["a"]);
  });
});

describe("weekMoveProblem", () => {
  const ok = { today: "2026-10-28", fromDate: "2026-10-28", toDate: "2026-10-31", fromDay: 3, memberOfFrom: true, memberOfTo: false, sameSlot: false };

  it("allows a move later in the same week", () => {
    expect(weekMoveProblem(ok)).toBe("");
  });

  it("names what is wrong", () => {
    expect(weekMoveProblem({ ...ok, sameSlot: true })).toMatch(/different/);
    expect(weekMoveProblem({ ...ok, memberOfFrom: false })).toMatch(/your own/);
    expect(weekMoveProblem({ ...ok, fromDate: "2026-10-29" })).toMatch(/isn't a day/);
    expect(weekMoveProblem({ ...ok, fromDate: "2026-10-21", toDate: "2026-10-24" })).toMatch(/already happened/);
    expect(weekMoveProblem({ ...ok, toDate: "2026-10-27" })).toMatch(/later one/);
    expect(weekMoveProblem({ ...ok, memberOfTo: true })).toMatch(/already come/);
  });
});
