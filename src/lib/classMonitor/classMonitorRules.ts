import { z } from "zod";
import { academyDateKey, academyDateTime, academyTimeOfDay, formatAcademyDateTime } from "@/lib/academyTime";

/**
 * Class Monitor: someone on the academy staff (Saptarshi by default) checks
 * each class and fills a short form - video on, right lesson, finished on
 * time - and the reviewers get every filled form by email.
 *
 * Pure rules only (no database), so they can be unit tested and shared with
 * the client form.
 */

export const CLASS_MONITOR_HREF = "/class-monitor";
export const CLASS_MONITOR_REPORTS_HREF = "/class-monitor/reports";
export const CLASS_MONITOR_TASK_KIND = "class_monitor";
export const CLASS_MONITOR_REFERENCE_TYPE = "ClassMonitorReport";

/** Monitoring started on this academy day; nothing earlier is ever listed. */
export const DEFAULT_CLASS_MONITOR_START = "2026-11-12";

/** The task appears this many minutes before the class starts. */
export const TASK_LEAD_MINUTES = 15;
/** And is due this long after the class was due to end. */
export const TASK_DUE_AFTER_END_MINUTES = 3 * 60;

/** Longest range the Reports tab will total or download in one go. */
export const MAX_REPORT_RANGE_DAYS = 92;

export function classMonitorStartKey() {
  const configured = String(process.env.CLASS_MONITOR_START || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(configured) ? configured : DEFAULT_CLASS_MONITOR_START;
}

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

export const CLASS_FORMAT_OPTIONS = [
  { value: "group", label: "Group" },
  { value: "individual", label: "Individual" },
] as const;

export const STUDENT_VIDEO_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;

export const TEACHER_VIDEO_OPTIONS = [
  { value: "30_plus", label: "On for at least 30 minutes" },
  { value: "under_30", label: "On for less than 30 minutes" },
  { value: "never", label: "Never turned on" },
] as const;

export const CORRECT_LESSON_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

export const CLASS_END_OPTIONS = [
  { value: "on_time", label: "On time" },
  { value: "early", label: "Early" },
  { value: "late", label: "Late" },
] as const;

type OptionList = readonly { value: string; label: string }[];
type Values<T extends OptionList> = T[number]["value"];

export type ClassFormat = Values<typeof CLASS_FORMAT_OPTIONS>;
export type StudentVideo = Values<typeof STUDENT_VIDEO_OPTIONS>;
export type TeacherVideo = Values<typeof TEACHER_VIDEO_OPTIONS>;
export type CorrectLesson = Values<typeof CORRECT_LESSON_OPTIONS>;
export type ClassEnd = Values<typeof CLASS_END_OPTIONS>;

function labelFrom(options: OptionList, value: unknown) {
  return options.find((option) => option.value === value)?.label || "";
}

export const classFormatLabel = (value: unknown) => labelFrom(CLASS_FORMAT_OPTIONS, value);
export const studentVideoLabel = (value: unknown) => labelFrom(STUDENT_VIDEO_OPTIONS, value);
export const teacherVideoLabel = (value: unknown) => labelFrom(TEACHER_VIDEO_OPTIONS, value);
export const correctLessonLabel = (value: unknown) => labelFrom(CORRECT_LESSON_OPTIONS, value);
export const classEndLabel = (value: unknown) => labelFrom(CLASS_END_OPTIONS, value);

export const REPORT_STATUS_LABELS: Record<string, string> = {
  pending: "Not filled",
  submitted: "Filled",
  cancelled: "Class not held",
};

/** Answers that mean something went wrong in the class, for highlighting. */
export function reportConcerns(report: {
  studentVideo?: unknown;
  teacherVideo?: unknown;
  correctLesson?: unknown;
  classEnd?: unknown;
}) {
  const concerns: string[] = [];
  if (report.teacherVideo === "never") concerns.push("Teacher video never on");
  else if (report.teacherVideo === "under_30") concerns.push("Teacher video under 30 min");
  if (report.studentVideo === "off") concerns.push("Student video off");
  if (report.correctLesson === "no") concerns.push("Wrong lesson");
  if (report.classEnd === "early") concerns.push("Ended early");
  else if (report.classEnd === "late") concerns.push("Ended late");
  return concerns;
}

/* ------------------------------------------------------------------ */
/* The form                                                            */
/* ------------------------------------------------------------------ */

const hhmm = z
  .string()
  .trim()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use a time like 17:05.")
  .or(z.literal(""));

function pick<T extends OptionList>(options: T, message: string) {
  const values = options.map((option) => option.value) as [string, ...string[]];
  return z.enum(values, { errorMap: () => ({ message }) });
}

export const classMonitorSubmitSchema = z.object({
  classFormat: pick(CLASS_FORMAT_OPTIONS, "Choose Group or Individual."),
  studentVideo: pick(STUDENT_VIDEO_OPTIONS, "Choose whether the student video was on."),
  teacherVideo: pick(TEACHER_VIDEO_OPTIONS, "Choose how long the teacher video was on."),
  correctLesson: pick(CORRECT_LESSON_OPTIONS, "Choose whether the correct lesson was taught."),
  classEnd: pick(CLASS_END_OPTIONS, "Choose how the class ended."),
  /** "" = the teacher never joined. */
  teacherJoinedAt: hhmm,
  studentJoins: z
    .array(z.object({ student: z.string().regex(/^[a-f0-9]{24}$/i), joinedAt: hhmm }))
    .max(60)
    .default([]),
  remarks: z.string().trim().max(1000).default(""),
});

export type ClassMonitorSubmitInput = z.infer<typeof classMonitorSubmitSchema>;

/* ------------------------------------------------------------------ */
/* Times                                                               */
/* ------------------------------------------------------------------ */

/** "17:05" in academy time, or "" for no time. */
export function joinTimeInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : academyTimeOfDay(date);
}

/**
 * A wall-clock "HH:mm" typed for a class, back to an instant. It is read on the
 * class's own academy day; a time far earlier than the start means the person
 * joined after midnight of a late-night class, so it belongs to the next day.
 */
export function joinTimeFromInput(value: string, classStart: Date): Date | null {
  const clean = String(value || "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(clean)) return null;
  const candidate = academyDateTime(academyDateKey(classStart), clean.padStart(5, "0"));
  if (candidate.getTime() < classStart.getTime() - 6 * 60 * 60_000) return new Date(candidate.getTime() + 24 * 60 * 60_000);
  return candidate;
}

/** The typed value replaces the recorded one only when the person actually changed it. */
export function resolveJoinTime(input: string, autoAt: Date | null | undefined, classStart: Date) {
  const auto = autoAt ? new Date(autoAt) : null;
  if (input === joinTimeInput(auto)) return { at: auto, edited: false };
  return { at: joinTimeFromInput(input, classStart), edited: true };
}

/** Minutes after the scheduled start; negative = early. */
export function minutesAfterStart(at: Date | string | null | undefined, start: Date | string) {
  if (!at) return null;
  return Math.round((new Date(at).getTime() - new Date(start).getTime()) / 60_000);
}

export function lateLabel(minutes: number | null) {
  if (minutes === null) return "";
  if (minutes <= 0) return minutes === 0 ? "on time" : `${-minutes} min early`;
  return `${minutes} min late`;
}

export function timeLabel(value: Date | string | null | undefined) {
  return value ? formatAcademyDateTime(value, { day: undefined, month: undefined, year: undefined }) : "";
}

export function dayLabel(dateKey: string) {
  const date = academyDateTime(dateKey, "12:00");
  return formatAcademyDateTime(date, { weekday: "long", hour: undefined, minute: undefined });
}

export function weekdayName(dateKey: string) {
  return formatAcademyDateTime(academyDateTime(dateKey, "12:00"), { weekday: "long", day: undefined, month: undefined, year: undefined, hour: undefined, minute: undefined });
}

export function timingLabel(startAt: Date | string, endAt: Date | string) {
  return `${timeLabel(startAt)} – ${timeLabel(endAt)}`;
}

/* ------------------------------------------------------------------ */
/* Date ranges                                                         */
/* ------------------------------------------------------------------ */

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

export function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const from = `${month}-01`;
  const next = new Date(`${from}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(0);
  return { from, to: next.toISOString().slice(0, 10) };
}

/**
 * The academy days a report request covers: a month, one day, or a from/to
 * pair - never before monitoring started and never longer than the cap.
 */
export function resolveReportRange(params: { month?: string | null; date?: string | null; from?: string | null; to?: string | null }, todayKey: string) {
  let from = "";
  let to = "";
  const month = params.month ? monthRange(params.month) : null;
  if (month) ({ from, to } = month);
  else if (isDateKey(params.date)) from = to = params.date;
  else if (isDateKey(params.from) && isDateKey(params.to)) ({ from, to } = { from: params.from, to: params.to });
  else from = to = todayKey;
  if (from > to) [from, to] = [to, from];
  const start = classMonitorStartKey();
  if (from < start) from = start;
  if (to < from) to = from;
  if (daysBetween(from, to) + 1 > MAX_REPORT_RANGE_DAYS) {
    throw new Error(`Choose at most ${MAX_REPORT_RANGE_DAYS} days at a time.`);
  }
  return { from, to };
}
