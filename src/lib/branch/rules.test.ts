import { describe, expect, it } from "vitest";
import {
  billBalance,
  billStatus,
  branchAccess,
  buildRoster,
  dayOfDateKey,
  isAttendanceStatus,
  isDateKey,
  registerCounts,
  shiftDateKey,
  todayKey,
  monthKey,
  monthsBetween,
  overfullSlots,
  rupeesToPaise,
  shiftMonth,
  slotLabel,
} from "@/lib/branch/rules";

describe("branchAccess", () => {
  it("gives the branch admin everything, managers all but staff, coaches a view", () => {
    expect([...branchAccess({ role: "instructor", branch: "bowbazar", branchRole: "admin" })!.can]).toContain("staff");
    const manager = branchAccess({ role: "instructor", branch: "bowbazar", branchRole: "manager" })!;
    expect(manager.branch).toBe("bowbazar");
    expect(manager.can.has("fees")).toBe(true);
    expect(manager.can.has("staff")).toBe(false);
    expect([...branchAccess({ role: "instructor", branch: "bowbazar", branchRole: "coach" })!.can]).toEqual(["view", "attendance"]);
    expect(manager.can.has("attendance")).toBe(true);
  });

  it("refuses online staff, online admins included, and every student", () => {
    expect(branchAccess({ role: "admin" })).toBeNull();
    expect(branchAccess({ role: "admin", isSuperAdmin: true })).toBeNull();
    expect(branchAccess({ role: "admin", branch: "bowbazar", branchRole: "admin" })).toBeNull();
    expect(branchAccess({ role: "instructor", branch: "elsewhere", branchRole: "admin" })).toBeNull();
    expect(branchAccess({ role: "sub-admin" })).toBeNull();
    expect(branchAccess({ role: "instructor" })).toBeNull();
    expect(branchAccess({ role: "student", branch: "bowbazar" })).toBeNull();
    expect(branchAccess({ role: "instructor", branch: "bowbazar" })).toBeNull();
    expect(branchAccess(null)).toBeNull();
  });
});

describe("months", () => {
  it("keys months on the academy's calendar, not UTC", () => {
    // 31 Oct 2026, 20:00 UTC is already 1 November in Kolkata.
    expect(monthKey(new Date("2026-10-31T20:00:00Z"))).toBe("2026-11");
  });

  it("steps across year ends", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthsBetween("2027-01", "2026-12")).toEqual([]);
  });
});

describe("bill money", () => {
  it("nets discount and late fee and tracks part payment", () => {
    const bill = { amount: 150000, discount: 10000, lateFee: 5000, paidAmount: 100000 };
    expect(billBalance(bill)).toBe(45000);
    expect(billStatus(bill)).toBe("partial");
    expect(billStatus({ ...bill, paidAmount: 145000 })).toBe("paid");
    expect(billStatus({ ...bill, paidAmount: 0 })).toBe("unpaid");
  });

  it("owes nothing once waived", () => {
    expect(billBalance({ amount: 150000, status: "waived" })).toBe(0);
    expect(billStatus({ amount: 150000, status: "waived" })).toBe("waived");
  });

  it("reads rupee amounts as typed", () => {
    expect(rupeesToPaise("1,500")).toBe(150000);
    expect(rupeesToPaise("₹ 999.5")).toBe(99950);
    expect(rupeesToPaise("-5")).toBeNull();
    expect(rupeesToPaise("abc")).toBeNull();
  });
});

describe("slots", () => {
  it("labels a slot the way the centre writes it", () => {
    expect(slotLabel({ dayOfWeek: 2, startTime: "17:00", endTime: "18:00" })).toBe("Tue 5pm–6pm");
    expect(slotLabel({ dayOfWeek: 6, startTime: "15:30", endTime: "17:00" })).toBe("Sat 3:30pm–5pm");
  });

  it("refuses the eighth student and lets a seated student be saved again", () => {
    const full = new Map([["a", ["s1", "s2", "s3", "s4", "s5", "s6", "s7"]]]);
    const slots = [{ id: "a", capacity: 7 }];
    expect(overfullSlots(slots, full, "s8")).toHaveLength(1);
    expect(overfullSlots(slots, full, "s3")).toHaveLength(0);
    expect(overfullSlots(slots, new Map(), null)).toHaveLength(0);
  });
});

describe("attendance rules", () => {
  it("accepts only real calendar days", () => {
    expect(isDateKey("2026-10-28")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-1-05")).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });

  it("reads the weekday off the calendar", () => {
    expect(dayOfDateKey("2026-10-27")).toBe(2); // Tuesday
    expect(dayOfDateKey("2026-11-01")).toBe(0); // Sunday
    expect(shiftDateKey("2026-10-28", 7)).toBe("2026-11-04");
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("takes today on the academy's calendar", () => {
    // 27 Oct 2026, 19:30 UTC is already the 28th in Kolkata.
    expect(todayKey(new Date("2026-10-27T19:30:00Z"))).toBe("2026-10-28");
  });

  it("keeps everyone already on the register and adds members not yet marked", () => {
    const members = [{ id: "c", name: "Charu" }, { id: "a", name: "Arko" }, { id: "b", name: "Bina" }];
    const records = [{ student: "b" }, { student: "x" }];
    const roster = buildRoster(members, records);
    expect(roster.recorded.map((r) => r.student)).toEqual(["b", "x"]);
    expect(roster.unmarked.map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("counts late as attended and ignores unknown statuses", () => {
    expect(registerCounts([{ status: "present" }, { status: "late" }, { status: "absent" }, { status: "?" }])).toEqual({
      present: 1, late: 1, absent: 1, excused: 0, attended: 2, marked: 4,
    });
    expect(isAttendanceStatus("excused")).toBe(true);
    expect(isAttendanceStatus("holiday")).toBe(false);
  });
});
