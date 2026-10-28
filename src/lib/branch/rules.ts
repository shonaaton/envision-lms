/**
 * Pure rules for the offline branch portal: who may do what, month keys, the
 * money on a bill and the seats in a slot. No database here, so all of it is
 * unit tested in rules.test.ts.
 */
import { academyDateKey } from "@/lib/academyTime";
import { BRANCHES, type BranchKey } from "./scope";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Monday first: the centre's week starts on Monday, and Sunday classes close it. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * The Bowbazar timetable as the centre gave it (2026-10-28). Tuesday 5pm is the
 * one online class. Single-hour times were given as start times only and are
 * assumed to run an hour; the manager can change any of them.
 */
export const DEFAULT_SLOTS: { dayOfWeek: number; startTime: string; endTime: string; mode: "online" | "offline" }[] = [
  { dayOfWeek: 2, startTime: "17:00", endTime: "18:00", mode: "online" },
  { dayOfWeek: 2, startTime: "19:00", endTime: "20:30", mode: "offline" },
  { dayOfWeek: 3, startTime: "17:00", endTime: "18:00", mode: "offline" },
  { dayOfWeek: 3, startTime: "18:00", endTime: "19:00", mode: "offline" },
  { dayOfWeek: 4, startTime: "18:00", endTime: "19:00", mode: "offline" },
  { dayOfWeek: 4, startTime: "19:00", endTime: "20:30", mode: "offline" },
  { dayOfWeek: 6, startTime: "10:00", endTime: "11:00", mode: "offline" },
  { dayOfWeek: 6, startTime: "11:00", endTime: "12:00", mode: "offline" },
  { dayOfWeek: 6, startTime: "12:00", endTime: "13:00", mode: "offline" },
  { dayOfWeek: 6, startTime: "15:30", endTime: "17:00", mode: "offline" },
  { dayOfWeek: 0, startTime: "10:00", endTime: "11:00", mode: "offline" },
  { dayOfWeek: 0, startTime: "11:00", endTime: "12:00", mode: "offline" },
  { dayOfWeek: 0, startTime: "12:00", endTime: "13:00", mode: "offline" },
];

export type BranchCapability = "view" | "attendance" | "students" | "slots" | "fees" | "staff";

type BranchUser = { role?: string; branch?: string; branchRole?: string; isSuperAdmin?: boolean };

/**
 * A branch is run from inside it: its admin does everything, including adding
 * staff; a manager runs it but cannot add staff; a coach can look and take the
 * register. The online academy's admins, sub-admins and coaches get nothing
 * here (the centre asked for that, 2026-10-28), and neither does any student.
 */
export function branchAccess(user: BranchUser | null | undefined): { branch: BranchKey; can: Set<BranchCapability> } | null {
  if (!user) return null;
  if (!user.branch || user.role !== "instructor" || !(BRANCHES as readonly string[]).includes(user.branch)) return null;
  const branch = user.branch as BranchKey;
  if (user.branchRole === "admin") return { branch, can: new Set(["view", "attendance", "students", "slots", "fees", "staff"]) };
  if (user.branchRole === "manager") return { branch, can: new Set(["view", "attendance", "students", "slots", "fees"]) };
  if (user.branchRole === "coach") return { branch, can: new Set(["view", "attendance"]) };
  return null;
}

export function monthKey(value: Date | string = new Date()) {
  return academyDateKey(value).slice(0, 7);
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, by: number) {
  const [year, mon] = month.split("-").map(Number);
  const index = year * 12 + (mon - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Whole months from `from` to `to`, both included; empty when `from` is later. */
export function monthsBetween(from: string, to: string) {
  const months: string[] = [];
  for (let month = from; month <= to && months.length < 240; month = shiftMonth(month, 1)) months.push(month);
  return months;
}

export function monthLabel(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon - 1, 15)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

type BillMoney = { amount: number; discount?: number | null; lateFee?: number | null; paidAmount?: number | null; status?: string | null };

export function billDue(bill: BillMoney) {
  return Math.max(0, bill.amount - (bill.discount || 0) + (bill.lateFee || 0));
}

/** What the family still owes on this bill; a waived bill owes nothing. */
export function billBalance(bill: BillMoney) {
  if (bill.status === "waived") return 0;
  return Math.max(0, billDue(bill) - (bill.paidAmount || 0));
}

export function billStatus(bill: BillMoney): "unpaid" | "partial" | "paid" | "waived" {
  if (bill.status === "waived") return "waived";
  const paid = bill.paidAmount || 0;
  if (paid >= billDue(bill)) return "paid";
  return paid > 0 ? "partial" : "unpaid";
}

/** Rupees typed into a form, to paise. Rejects anything that is not a plain amount. */
export function rupeesToPaise(value: unknown) {
  const text = String(value ?? "").replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

export function timeLabel(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 || 12;
  return minutes ? `${hour12}:${String(minutes).padStart(2, "0")}${suffix}` : `${hour12}${suffix}`;
}

export function slotLabel(slot: { dayOfWeek: number; startTime: string; endTime: string }) {
  return `${DAY_NAMES[slot.dayOfWeek].slice(0, 3)} ${timeLabel(slot.startTime)}–${timeLabel(slot.endTime)}`;
}

export function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Slots that cannot take every student in `adding`. `occupied` counts active
 * students already seated, keyed by slot id; a student already in a slot is
 * not counted twice when their record is saved again.
 */
export function overfullSlots(
  slots: { id: string; capacity: number }[],
  occupied: Map<string, string[]>,
  studentId: string | null
) {
  return slots.filter((slot) => {
    const seated = (occupied.get(slot.id) || []).filter((id) => id !== studentId);
    return seated.length + 1 > slot.capacity;
  });
}

// ---------------------------------------------------------------------------
// Attendance register
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

/** "YYYY-MM-DD" that names a real calendar day. */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Weekday of a date key, 0 = Sunday, read off the calendar rather than any clock. */
export function dayOfDateKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function shiftDateKey(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Today in the academy's time zone. */
export function todayKey(now: Date = new Date()) {
  return academyDateKey(now);
}

/**
 * Who belongs on a slot's register for a day. Anyone already written on it
 * stays, in their saved order, even if they have since left the slot or the
 * centre: the register is a record of that day. Current members not yet
 * written on it follow, alphabetically and unmarked.
 */
export function buildRoster<M extends { id: string; name: string }, R extends { student: string }>(
  members: M[],
  records: R[],
) {
  const written = new Set(records.map((record) => record.student));
  return {
    recorded: records,
    unmarked: members.filter((member) => !written.has(member.id)).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Counts on a saved register. */
export function registerCounts(records: { status?: string }[]) {
  const counts = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const record of records) if (isAttendanceStatus(record.status)) counts[record.status] += 1;
  return { ...counts, attended: counts.present + counts.late, marked: records.length };
}
