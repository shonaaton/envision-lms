import { describe, expect, it } from "vitest";
import {
  classMonitorSubmitSchema,
  joinTimeFromInput,
  joinTimeInput,
  lateLabel,
  minutesAfterStart,
  monthRange,
  reportConcerns,
  resolveJoinTime,
  resolveReportRange,
} from "./classMonitorRules";

// 17:00 IST on 12 Nov 2026 = 11:30 UTC.
const classStart = new Date("2026-11-12T11:30:00.000Z");

describe("join times", () => {
  it("round-trips an IST wall clock", () => {
    const at = new Date("2026-11-12T11:34:00.000Z");
    expect(joinTimeInput(at)).toBe("17:04");
    expect(joinTimeFromInput("17:04", classStart)?.toISOString()).toBe(at.toISOString());
  });

  it("puts an after-midnight join of a late-night class on the next day", () => {
    const lateStart = new Date("2026-11-12T18:00:00.000Z"); // 23:30 IST
    expect(joinTimeFromInput("00:10", lateStart)?.toISOString()).toBe("2026-11-12T18:40:00.000Z");
  });

  it("keeps the recorded time unless the person changed it", () => {
    const auto = new Date("2026-11-12T11:33:20.000Z");
    expect(resolveJoinTime("17:03", auto, classStart)).toEqual({ at: auto, edited: false });
    const changed = resolveJoinTime("17:10", auto, classStart);
    expect(changed.edited).toBe(true);
    expect(changed.at?.toISOString()).toBe("2026-11-12T11:40:00.000Z");
    expect(resolveJoinTime("", auto, classStart)).toEqual({ at: null, edited: true });
    expect(resolveJoinTime("", null, classStart)).toEqual({ at: null, edited: false });
  });

  it("describes lateness", () => {
    expect(minutesAfterStart(new Date("2026-11-12T11:37:00.000Z"), classStart)).toBe(7);
    expect(lateLabel(7)).toBe("7 min late");
    expect(lateLabel(0)).toBe("on time");
    expect(lateLabel(-3)).toBe("3 min early");
    expect(lateLabel(null)).toBe("");
  });
});

describe("report ranges", () => {
  it("covers a whole month", () => {
    expect(monthRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(monthRange("2027-02")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
  });

  it("never reaches before monitoring started", () => {
    expect(resolveReportRange({ month: "2026-11" }, "2026-11-20")).toEqual({ from: "2026-11-12", to: "2026-11-30" });
    expect(resolveReportRange({ date: "2026-11-01" }, "2026-11-20")).toEqual({ from: "2026-11-12", to: "2026-11-12" });
  });

  it("defaults to today and refuses huge ranges", () => {
    expect(resolveReportRange({}, "2026-12-03")).toEqual({ from: "2026-12-03", to: "2026-12-03" });
    expect(() => resolveReportRange({ from: "2026-12-01", to: "2027-06-01" }, "2026-12-03")).toThrow(/at most/);
  });
});

describe("the form", () => {
  const valid = {
    classFormat: "group",
    studentVideo: "on",
    teacherVideo: "30_plus",
    correctLesson: "yes",
    classEnd: "on_time",
    teacherJoinedAt: "17:02",
    studentJoins: [{ student: "a".repeat(24), joinedAt: "" }],
  };

  it("accepts a complete form", () => {
    expect(classMonitorSubmitSchema.parse(valid).remarks).toBe("");
  });

  it("asks for every answer", () => {
    const result = classMonitorSubmitSchema.safeParse({ ...valid, teacherVideo: undefined });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/teacher video/i);
  });

  it("rejects a malformed time", () => {
    expect(classMonitorSubmitSchema.safeParse({ ...valid, teacherJoinedAt: "5pm" }).success).toBe(false);
  });

  it("lists what went wrong in a class", () => {
    expect(reportConcerns({ teacherVideo: "never", studentVideo: "off", correctLesson: "no", classEnd: "early" })).toEqual([
      "Teacher video never on",
      "Student video off",
      "Wrong lesson",
      "Ended early",
    ]);
    expect(reportConcerns({ teacherVideo: "30_plus", studentVideo: "on", correctLesson: "yes", classEnd: "on_time" })).toEqual([]);
  });
});
