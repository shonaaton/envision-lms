/**
 * Pure rules for class-time changes at a branch: a student moving one week's
 * class to another slot, or moving to a different slot for good. No database,
 * so changeRules.test.ts covers them.
 */
import { dayOfDateKey, shiftDateKey } from "./rules";

export type ChangeType = "week" | "permanent";
export const CHANGE_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

/** Monday of the centre's week (Monday to Sunday) that holds `date`. */
export function weekStart(date: string) {
  return shiftDateKey(date, -((dayOfDateKey(date) + 6) % 7));
}

/**
 * The date a slot meets in the same Monday-to-Sunday week as `date`. A one-week
 * move swaps one class for another class in that same week.
 */
export function sameWeekDate(date: string, dayOfWeek: number) {
  return shiftDateKey(weekStart(date), (dayOfWeek + 6) % 7);
}

/**
 * Seats taken in a slot on one date: its members, less those moved out of it
 * that day, plus those moved into it that day.
 */
export function seatsTakenOn(members: number, movedAway: number, visiting: number) {
  return Math.max(0, members - movedAway) + visiting;
}

/** The student's slots after a permanent change: `from` given up (if any), `to` taken. */
export function slotsAfterChange(current: string[], from: string | null, to: string) {
  const kept = current.filter((slot) => slot !== from && slot !== to);
  return [...kept, to];
}

/** Why a one-week move can't be asked for, or "" when it can. */
export function weekMoveProblem(input: {
  today: string;
  fromDate: string;
  toDate: string;
  fromDay: number;
  memberOfFrom: boolean;
  memberOfTo: boolean;
  sameSlot: boolean;
}) {
  if (input.sameSlot) return "Pick a different class time.";
  if (!input.memberOfFrom) return "Pick one of your own class times to move.";
  if (dayOfDateKey(input.fromDate) !== input.fromDay) return "That date isn't a day this class meets.";
  if (input.fromDate < input.today) return "That class has already happened.";
  if (input.toDate < input.today) return "The other class that week has already happened. Pick a later one.";
  if (input.memberOfTo) return "You already come to that class.";
  return "";
}
