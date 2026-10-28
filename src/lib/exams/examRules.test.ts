import { describe, expect, it } from "vitest";
import {
  EXAM_MAX_SCORE,
  availablePositionMarks,
  dueReminder,
  examEndsAt,
  examReminderTimes,
  examWindowEnd,
  isExamLevel,
  levelNumberFromName,
  positionMarks,
  scoreExam,
  violationOutcome,
} from "@/lib/exams/examRules";

describe("position marks", () => {
  it("pays 5 for a clean solve", () => {
    expect(positionMarks({ solved: true })).toBe(5);
  });

  it("takes 0.5 per wrong move and 2 per hint", () => {
    expect(positionMarks({ solved: true, wrongMoves: 1 })).toBe(4.5);
    expect(positionMarks({ solved: true, hintsUsed: 1 })).toBe(3);
    expect(positionMarks({ solved: true, wrongMoves: 2, hintsUsed: 1 })).toBe(2);
  });

  it("never goes below zero, even when the move is found in the end", () => {
    expect(positionMarks({ solved: true, wrongMoves: 11 })).toBe(0);
    expect(positionMarks({ solved: true, hintsUsed: 3 })).toBe(0);
    expect(availablePositionMarks({ wrongMoves: 4, hintsUsed: 2 })).toBe(0);
  });

  it("pays nothing for an unsolved position", () => {
    expect(positionMarks({ solved: false })).toBe(0);
  });
});

describe("exam score", () => {
  it("adds 2 per right MCQ and the position marks, out of 100", () => {
    const score = scoreExam({
      mcqAnswers: [{ correct: true }, { correct: false }, { correct: true }],
      positionProgress: [{ solved: true }, { solved: true, wrongMoves: 1, hintsUsed: 1 }, { solved: false, wrongMoves: 3 }],
    });
    expect(score).toEqual({ mcq: 4, positions: 7.5, total: 11.5, max: 100 });
    expect(EXAM_MAX_SCORE).toBe(100);
  });
});

describe("exam window (IST)", () => {
  it("closes at 23:59 IST seven days after the assignment day", () => {
    // 28 Oct 2026, 22:00 IST
    const end = examWindowEnd(new Date("2026-10-28T16:30:00Z"));
    expect(end.toISOString()).toBe("2026-11-04T18:29:59.999Z");
  });

  it("uses the IST day, not the UTC day, just after midnight IST", () => {
    // 29 Oct 2026, 00:15 IST is still 28 Oct in UTC.
    const end = examWindowEnd(new Date("2026-10-28T18:45:00Z"));
    expect(end.toISOString()).toBe("2026-11-05T18:29:59.999Z");
  });

  it("reminds at 08:00 IST three days before and on the last day", () => {
    const { threeDayAt, lastDayAt } = examReminderTimes(new Date("2026-11-04T18:29:59.999Z"));
    expect(threeDayAt.toISOString()).toBe("2026-11-01T02:30:00.000Z");
    expect(lastDayAt.toISOString()).toBe("2026-11-04T02:30:00.000Z");
  });

  it("sends each reminder once and skips a missed three-day one on the last day", () => {
    const availableUntil = new Date("2026-11-04T18:29:59.999Z");
    expect(dueReminder({ now: new Date("2026-10-31T10:00:00Z"), availableUntil })).toBeNull();
    expect(dueReminder({ now: new Date("2026-11-01T03:00:00Z"), availableUntil })).toBe("three_day");
    expect(dueReminder({ now: new Date("2026-11-01T03:00:00Z"), availableUntil, threeDaySentAt: new Date() })).toBeNull();
    expect(dueReminder({ now: new Date("2026-11-04T03:00:00Z"), availableUntil })).toBe("last_day");
    expect(dueReminder({ now: new Date("2026-11-04T03:00:00Z"), availableUntil, lastDaySentAt: new Date() })).toBeNull();
    expect(dueReminder({ now: new Date("2026-11-05T03:00:00Z"), availableUntil })).toBeNull();
  });

  it("gives 90 minutes from the start", () => {
    expect(examEndsAt(new Date("2026-10-28T10:00:00Z")).toISOString()).toBe("2026-10-28T11:30:00.000Z");
  });
});

describe("leaving the exam", () => {
  it("warns the first time and submits the second", () => {
    expect(violationOutcome([], "tab_hidden")).toBe("warn");
    expect(violationOutcome([{ type: "tab_hidden" }], "tab_hidden")).toBe("submit");
    expect(violationOutcome([{ type: "page_reopened" }], "tab_hidden")).toBe("submit");
  });

  it("submits at once when the app is closed", () => {
    expect(violationOutcome([], "app_closed")).toBe("submit");
  });
});

describe("levels", () => {
  it("reads the level number from the stored level names", () => {
    expect(levelNumberFromName("Level 3")).toBe(3);
    expect(levelNumberFromName("Beginner Level1")).toBe(1);
    expect(levelNumberFromName("level-2")).toBe(2);
    expect(levelNumberFromName("Advanced openings")).toBe(0);
  });

  it("has an exam for levels 1 to 3 of every course tier", () => {
    expect(isExamLevel("beginner", 1)).toBe(true);
    expect(isExamLevel("intermediate", 3)).toBe(true);
    expect(isExamLevel("semi_pro", 1)).toBe(true);
    expect(isExamLevel("masters", 3)).toBe(true);
    expect(isExamLevel("intermediate", 4)).toBe(false);
    expect(isExamLevel("mixed", 1)).toBe(false);
    expect(isExamLevel("advanced", 1)).toBe(false);
  });
});
