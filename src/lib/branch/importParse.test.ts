import { describe, expect, it } from "vitest";
import { feeMonthOf, guessSlots, parseBranchImport, phoneOf, regNoOf, rupeesOf, tidyName, usualFee } from "@/lib/branch/importParse";

const LIST = [
  ["Envision Chess Academy"],
  ["Sr", "Reg #", "Student Name", "Father Name", "Class", "Fee Remaining", "Phone"],
  ["1", "ECA-2025-0001", "ASHA ROY", "Bimal Roy", "Saturday Sunday 12pm", "Paid", "919800000001"],
  ["2", "Last ECA-2026-0002", "Dev Sen", "", "Beginner Wednesday 5pm", "₹ 500", "+919800000002"],
  ["3", "", "No Reg", "", "Sunday 12pm", "Paid", ""],
];

const REPORT = [
  ["Report from 2025-01-28 to 2026-10-28"],
  ["Sr#", "Date", "Reg No", "Student Name", "Class", "Fee Month", "Total", "Paid", "Balance"],
  ["1", "05-Sep-2026", "ECA-2025-0001", "Asha Roy", "Saturday Sunday 12pm", "Sep-2026", "1500", "1500", "0"],
  ["2", "04-Oct-2026", "ECA-2025-0001", "Asha Roy", "Saturday Sunday 12pm", "Oct-2026", "1000", "1000", "0"],
  ["3", "02-Oct-2026", "ECA-2026-0002", "Dev Sen", "Beginner Wednesday 5pm", "Oct-2026", "1000", "500", "500"],
  ["4", "10-Mar-2026", "ECA-2025-0009", "Old Student", "Sunday 10am Beginner 1day", "Feb-2026", "1000", "1000", "0"],
  ["5", "10-Apr-2026", "ECA-2025-0009", "Old Student", "Sunday 11am Beginner Class", "Mar-2026", "1000", "0", "1000"],
  ["6", "06-Jun-2026", "", "", "N/A", "Jun-2026", "1000", "1000", "0"],
  ["7", "06-Oct-2026", "ECA-2025-0001", "Asha Roy", "Saturday Sunday 12pm", "Oct-2026", "1000", "1000", "0"],
];

describe("cell readers", () => {
  it("pulls the registration number out of a noisy cell", () => {
    expect(regNoOf("Last ECA-2026-9896")).toBe("ECA-2026-9896");
    expect(regNoOf("ECA-2025-1741 ECA-20")).toBe("ECA-2025-1741");
    expect(regNoOf("N/A")).toBe("");
  });

  it("reads months, money, phones and shouted names", () => {
    expect(feeMonthOf("Jun-2026")).toBe("2026-06");
    expect(feeMonthOf("September 2026")).toBe("2026-09");
    expect(feeMonthOf("nonsense")).toBe("");
    expect(rupeesOf("₹ 500")).toBe(500);
    expect(rupeesOf("Paid")).toBe(0);
    expect(rupeesOf("-300")).toBe(-300);
    expect(Number.isNaN(rupeesOf("soon"))).toBe(true);
    expect(phoneOf("919062071530")).toBe("9062071530");
    expect(phoneOf("+917439484435")).toBe("7439484435");
    expect(tidyName("RAJARSHI ROY")).toBe("Rajarshi Roy");
    expect(tidyName("Debshikha  Das")).toBe("Debshikha Das");
    expect(tidyName("McDonald")).toBe("McDonald");
  });

  it("takes the fee a student settled into, not their first month's", () => {
    const bill = (month: string, total: number) => ({ month, total, paid: total, date: null, receipt: "" });
    expect(usualFee([bill("2026-04", 1500), bill("2026-05", 1000), bill("2026-06", 1000)])).toBe(1000);
    expect(usualFee([bill("2026-10", 500)])).toBe(500);
    expect(usualFee([bill("2026-01", 0)])).toBe(0);
  });
});

describe("parseBranchImport", () => {
  const plan = parseBranchImport(LIST, REPORT);

  it("makes everyone on the list current and everyone only in the report a former student", () => {
    expect(plan.students.map((student) => [student.regNo, student.active])).toEqual([
      ["ECA-2025-0001", true],
      ["ECA-2026-0002", true],
      ["ECA-2025-0009", false],
    ]);
    const asha = plan.students[0];
    expect(asha).toMatchObject({ name: "Asha Roy", phone: "9800000001", listRemaining: 0, monthlyFee: 1000, firstMonth: "2026-09", lastMonth: "2026-10" });
  });

  it("names a former student from their latest row and adds up what they owe", () => {
    const old = plan.students[2];
    expect(old).toMatchObject({ name: "Old Student", className: "Sunday 11am Beginner Class", reportOwed: 1000 });
  });

  it("reports the rows it could not use instead of guessing", () => {
    expect(plan.skipped.map((entry) => `${entry.sheet}:${entry.row}`)).toEqual(["students:5", "report:8", "report:9"]);
    expect(plan.skipped[2].reason).toMatch(/twice/);
  });

  it("lists every old class with its current headcount", () => {
    expect(plan.classes.find((entry) => entry.name === "Saturday Sunday 12pm")).toEqual({ name: "Saturday Sunday 12pm", active: 1, total: 1 });
    expect(plan.classes.slice(-1)[0]).toMatchObject({ active: 0 });
    expect(plan.classes).toHaveLength(3);
  });
});

describe("guessSlots", () => {
  const slots = [
    { id: "sat12", dayOfWeek: 6, startTime: "12:00", endTime: "13:00" },
    { id: "sun12", dayOfWeek: 0, startTime: "12:00", endTime: "13:00" },
    { id: "sat330", dayOfWeek: 6, startTime: "15:30", endTime: "17:00" },
    { id: "tue5", dayOfWeek: 2, startTime: "17:00", endTime: "18:00" },
    { id: "tue7", dayOfWeek: 2, startTime: "19:00", endTime: "20:30" },
  ];

  it("maps a class to every day it names", () => {
    expect(guessSlots("Saturday Sunday 12pm", slots).sort()).toEqual(["sat12", "sun12"]);
    expect(guessSlots("Intermediate Batch 12pm Sat Sun", slots).sort()).toEqual(["sat12", "sun12"]);
  });

  it("finds the slot a time falls inside", () => {
    expect(guessSlots("Saturday Beginner 4pm", slots)).toEqual(["sat330"]);
  });

  it("leaves a class with no time, or no slot at that time, for a person", () => {
    expect(guessSlots("Intemediate/Advanced Day Batch Tuesday", slots)).toEqual([]);
    expect(guessSlots("Adults Single Day Beginner", slots)).toEqual([]);
    expect(guessSlots("Beginner 1 day batch Saturday 5pm", slots)).toEqual([]);
  });
});
