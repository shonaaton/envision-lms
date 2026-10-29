import { describe, expect, it } from "vitest";
import {
  billBalance,
  billStatus,
  absenceStreak,
  billDue,
  branchAccess,
  buildRoster,
  discountFor,
  financialYear,
  lateFeeApplies,
  proRataFee,
  planDiscountFor,
  planPeriodEnd,
  receiptNumber,
  rupeesInWords,
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
    expect([...branchAccess({ role: "instructor", branch: "bowbazar", branchRole: "coach" })!.can]).toEqual(["view", "attendance", "achievements"]);
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

describe("fee settings", () => {
  it("adds the admission fee to what is due", () => {
    expect(billDue({ amount: 100000, discount: 10000, lateFee: 5000, admissionFee: 50000 })).toBe(145000);
  });

  it("works out discounts in whole rupees and never past the fee", () => {
    expect(discountFor(100000, { kind: "percent", value: 10 })).toBe(10000);
    expect(discountFor(125000, { kind: "percent", value: 15 })).toBe(18800); // 187.5 -> 188
    expect(discountFor(100000, { kind: "flat", value: 20000 })).toBe(20000);
    expect(discountFor(100000, { kind: "flat", value: 500000 })).toBe(100000);
    expect(discountFor(100000, { kind: "percent", value: 150 })).toBe(100000);
    expect(discountFor(100000, null)).toBe(0);
  });

  it("charges a part month from the admission day, to the nearest ten rupees", () => {
    expect(proRataFee(100000, "2026-11-01")).toBe(100000);
    expect(proRataFee(100000, "2026-11-16")).toBe(50000); // 15 of 30 days
    expect(proRataFee(100000, "2026-10-31")).toBe(3000); // 1 of 31 days: 32.26 -> 30
    expect(proRataFee(120000, "2027-02-15")).toBe(60000); // 14 of 28 days
  });

  it("adds the late fee only in the bill's own month, after the set day", () => {
    expect(lateFeeApplies("2026-11-11", "2026-11", 10)).toBe(true);
    expect(lateFeeApplies("2026-11-10", "2026-11", 10)).toBe(false);
    expect(lateFeeApplies("2026-12-02", "2026-11", 10)).toBe(false);
    expect(lateFeeApplies("2026-11-20", "2026-11", 0)).toBe(false);
  });

  it("numbers receipts by financial year", () => {
    expect(financialYear("2026-10-28")).toBe("26-27");
    expect(financialYear("2027-03-31")).toBe("26-27");
    expect(financialYear("2027-04-01")).toBe("27-28");
    expect(receiptNumber("BB", "26-27", 7)).toBe("BB/26-27/0007");
  });

  it("counts a run of missed classes from the newest", () => {
    expect(absenceStreak(["absent", "absent", "absent", "present"])).toBe(3);
    expect(absenceStreak(["present", "absent"])).toBe(0);
    expect(absenceStreak(["absent", "excused", "absent"])).toBe(1);
    expect(absenceStreak([])).toBe(0);
  });
});

describe("rupeesInWords", () => {
  it("writes amounts the Indian way", () => {
    expect(rupeesInWords(150000)).toBe("One thousand five hundred rupees only");
    expect(rupeesInWords(100)).toBe("One rupee only");
    expect(rupeesInWords(12345600)).toBe("One lakh twenty-three thousand four hundred fifty-six rupees only");
    expect(rupeesInWords(50050)).toBe("Five hundred rupees and fifty paise only");
    expect(rupeesInWords(0)).toBe("Zero rupees only");
  });
});

describe("fee plans and charges", () => {
  it("adds one-off charges and takes off a plan discount", () => {
    expect(billDue({ amount: 100000, planDiscount: 10000, charges: [{ amount: 20000 }, { amount: 5000 }] })).toBe(115000);
    expect(billDue({ amount: 0, charges: [{ amount: 20000 }] })).toBe(20000);
    // Discounts never take the fee below zero, and never eat into the charges.
    expect(billDue({ amount: 10000, discount: 8000, planDiscount: 5000, charges: [{ amount: 3000 }] })).toBe(3000);
  });

  it("raises a whole plan period at its start", () => {
    expect(planPeriodEnd("2026-10", "2026-10", "quarterly")).toBe("2026-12");
    expect(planPeriodEnd("2026-10", "2026-12", "quarterly")).toBe("2026-12");
    expect(planPeriodEnd("2026-10", "2027-01", "quarterly")).toBe("2027-03");
    expect(planPeriodEnd("2026-10", "2027-02", "yearly")).toBe("2027-09");
    expect(planPeriodEnd("2026-10", "2026-11", "monthly")).toBe("2026-11");
    expect(planPeriodEnd("2026-11", "2026-10", "quarterly")).toBe("2027-01");
  });

  it("takes the plan discount in whole rupees", () => {
    expect(planDiscountFor(100000, 5)).toBe(5000);
    expect(planDiscountFor(125000, 7)).toBe(8800); // 87.5 -> 88
    expect(planDiscountFor(100000, 0)).toBe(0);
  });
});

describe("feature access overrides", () => {
  it("lets the branch admin change what managers and coaches can do", () => {
    const coach = branchAccess({ role: "instructor", branch: "bowbazar", branchRole: "coach" }, { coach: ["attendance", "fees"] })!;
    expect([...coach.can].sort()).toEqual(["attendance", "fees", "view"]);
  });

  it("never hands out staff or activity, and always keeps view", () => {
    const manager = branchAccess({ role: "instructor", branch: "bowbazar", branchRole: "manager" }, { manager: ["staff", "activity"] })!;
    expect([...manager.can]).toEqual(["view"]);
    const admin = branchAccess({ role: "instructor", branch: "bowbazar", branchRole: "admin" }, { manager: [] })!;
    expect(admin.can.has("activity")).toBe(true);
  });
});
