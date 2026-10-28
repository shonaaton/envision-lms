import { academyDateKey, academyDateTime } from "@/lib/academyTime";
import { courseTierLabel } from "@/lib/courseTiers";

/**
 * Exam Center rules, kept pure so every number the student is marked by is
 * pinned by a test. The service, the sweep and the pages all read them from
 * here; nothing else should hard-code a mark, a penalty or a time.
 */

export const MCQ_COUNT = 10;
export const MCQ_MARKS = 2;
export const POSITION_COUNT = 16;
export const POSITION_MARKS = 5;
export const WRONG_MOVE_PENALTY = 0.5;
export const HINT_PENALTY = 2;
export const EXAM_MAX_SCORE = MCQ_COUNT * MCQ_MARKS + POSITION_COUNT * POSITION_MARKS;

export const EXAM_DURATION_MINUTES = 90;
/** The exam stays open until 23:59 IST this many days after the day it was assigned. */
export const EXAM_WINDOW_DAYS = 7;
export const REMINDER_HOUR = "08:00";
export const HEARTBEAT_INTERVAL_MS = 20_000;
/** An exam in progress that has not been heard from for this long was closed or lost its connection. */
export const HEARTBEAT_STALE_MS = 3 * 60_000;

/** Exams exist for these tiers, levels 1 to 3 each: up to Intermediate Level 3. */
export const EXAM_TIERS = ["beginner", "intermediate"] as const;
export const EXAM_LEVEL_NUMBERS = [1, 2, 3] as const;
export type ExamTier = (typeof EXAM_TIERS)[number];

export const EXAM_LEVELS = EXAM_TIERS.flatMap((tier) => EXAM_LEVEL_NUMBERS.map((levelNumber) => ({ tier, levelNumber })));

export function isExamLevel(tier: unknown, levelNumber: unknown) {
  return (EXAM_TIERS as readonly string[]).includes(String(tier)) && (EXAM_LEVEL_NUMBERS as readonly number[]).includes(Number(levelNumber));
}

export function examLevelLabel(tier: unknown, levelNumber: unknown) {
  return `${courseTierLabel(String(tier || ""))} Level ${Number(levelNumber) || "?"}`;
}

export function examLevelKey(tier: unknown, levelNumber: unknown) {
  return `${String(tier || "")}:${Number(levelNumber) || 0}`;
}

/**
 * The level number in a level name: "Level 3", "Beginner Level3", "level-2".
 * Stored names vary, so like homework automation only the number counts.
 */
export function levelNumberFromName(value: unknown) {
  const match = String(value || "").toLowerCase().replace(/[_-]+/g, " ").match(/\blevel\s*(\d+)\b/);
  return match ? Number(match[1]) : 0;
}

export function mcqMarks(correct: boolean) {
  return correct ? MCQ_MARKS : 0;
}

/**
 * What a position is worth: full marks less 0.5 per wrong move and 2 per hint,
 * never below zero. Only a solved position scores - a student who runs the
 * marks down to zero and then finds the move still gets zero.
 */
export function positionMarks(input: { wrongMoves?: number; hintsUsed?: number; solved?: boolean }) {
  if (!input.solved) return 0;
  return availablePositionMarks(input);
}

/** What the position would still pay if solved now. Shown live as "5 → 4.5". */
export function availablePositionMarks(input: { wrongMoves?: number; hintsUsed?: number }) {
  const left = POSITION_MARKS - WRONG_MOVE_PENALTY * Math.max(0, Number(input.wrongMoves) || 0) - HINT_PENALTY * Math.max(0, Number(input.hintsUsed) || 0);
  return Math.max(0, roundMarks(left));
}

export function roundMarks(value: number) {
  return Math.round(value * 100) / 100;
}

export function scoreExam(input: {
  mcqAnswers?: { correct?: boolean }[];
  positionProgress?: { wrongMoves?: number; hintsUsed?: number; solved?: boolean }[];
}) {
  const mcq = roundMarks((input.mcqAnswers || []).reduce((sum, answer) => sum + mcqMarks(Boolean(answer.correct)), 0));
  const positions = roundMarks((input.positionProgress || []).reduce((sum, progress) => sum + positionMarks(progress), 0));
  return { mcq, positions, total: roundMarks(mcq + positions), max: EXAM_MAX_SCORE };
}

export function scorePercent(total: number, max = EXAM_MAX_SCORE) {
  return max > 0 ? Math.round((total / max) * 1000) / 10 : 0;
}

function addDaysToKey(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** Assigned any time on 28 Oct (IST) → open until 23:59:59 IST on 4 Nov. */
export function examWindowEnd(assignedAt: Date) {
  const endKey = addDaysToKey(academyDateKey(assignedAt), EXAM_WINDOW_DAYS);
  return new Date(academyDateTime(endKey, "23:59").getTime() + 59_999);
}

/** 08:00 IST three days before the last day, and 08:00 IST on the last day. */
export function examReminderTimes(availableUntil: Date) {
  const lastKey = academyDateKey(availableUntil);
  return {
    threeDayAt: academyDateTime(addDaysToKey(lastKey, -3), REMINDER_HOUR),
    lastDayAt: academyDateTime(lastKey, REMINDER_HOUR),
  };
}

export type ReminderKind = "three_day" | "last_day";

/**
 * Which reminder is due now, if any. A three-day reminder that was missed
 * (the server was down) is dropped once the last-day one is due, so a family
 * never gets both on the same morning.
 */
export function dueReminder(input: { now: Date; availableUntil: Date; threeDaySentAt?: Date | null; lastDaySentAt?: Date | null }): ReminderKind | null {
  const { now, availableUntil } = input;
  if (now.getTime() > availableUntil.getTime()) return null;
  const { threeDayAt, lastDayAt } = examReminderTimes(availableUntil);
  if (now.getTime() >= lastDayAt.getTime()) return input.lastDaySentAt ? null : "last_day";
  if (now.getTime() >= threeDayAt.getTime()) return input.threeDaySentAt ? null : "three_day";
  return null;
}

export function examEndsAt(startedAt: Date) {
  return new Date(startedAt.getTime() + EXAM_DURATION_MINUTES * 60_000);
}

export const VIOLATION_TYPES = ["tab_hidden", "page_reopened", "app_closed"] as const;
export type ViolationType = (typeof VIOLATION_TYPES)[number];

/**
 * Leaving the exam: the first time is a warning, the second ends it. Closing
 * the app ends it straight away - there is nobody left to warn.
 * `previous` is the violations already on record, before this one.
 */
export function violationOutcome(previous: { type: string }[], type: ViolationType): "warn" | "submit" {
  if (type === "app_closed") return "submit";
  const earlier = previous.filter((violation) => violation.type !== "app_closed").length;
  return earlier >= 1 ? "submit" : "warn";
}

export const SUBMIT_REASONS = ["completed", "time_up", "tab_switch", "app_closed", "disconnected"] as const;
export type SubmitReason = (typeof SUBMIT_REASONS)[number];

export const SUBMIT_REASON_LABELS: Record<SubmitReason, string> = {
  completed: "Submitted by the student",
  time_up: "Auto-submitted: 90 minutes ran out",
  tab_switch: "Auto-submitted: opened another tab or app after the warning",
  app_closed: "Auto-submitted: closed or left the exam",
  disconnected: "Auto-submitted: app closed or connection lost (no signal for 3 minutes)",
};

export function submitReasonFor(type: ViolationType): SubmitReason {
  return type === "app_closed" ? "app_closed" : "tab_switch";
}

/** The rules shown in the pop-up before Start, word for word what the exam enforces. */
export const EXAM_RULES = [
  `The exam has ${MCQ_COUNT} multiple-choice questions (${MCQ_MARKS} marks each, one try, no negative marking) and ${POSITION_COUNT} positions (${POSITION_MARKS} marks each). Total ${EXAM_MAX_SCORE} marks.`,
  "For each position you only see the topic. You can try as many times as you need.",
  `Every wrong move in a position takes away ${WRONG_MOVE_PENALTY} marks. Every hint takes away ${HINT_PENALTY} marks.`,
  "A position can never go below 0 marks. If the deductions bring it to 0, solving it still gives 0.",
  `You have ${EXAM_DURATION_MINUTES} minutes once you press Start. The exam submits itself when time runs out.`,
  "Once you start, you cannot pause or leave the exam.",
  "Do not open another tab or app. The first time you leave, you get a warning. The second time, the exam is submitted straight away.",
  "Closing the app or the browser submits the exam immediately.",
  "Your result is shown as soon as you submit, and your certificate follows.",
];
