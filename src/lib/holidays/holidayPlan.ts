import { academyDateKey, academyDateTime, formatAcademyDateTime } from "@/lib/academyTime";
import { CLASS_TIME_PATTERN, resolveClassStartTime } from "@/lib/classroomSchedule";
import { buildWeeklyOccurrences, upcomingMovableSessions } from "@/lib/seriesTimingChange";

/** An academy closure, as IST calendar days, both ends inclusive. */
export type HolidayRange = { startKey: string; endKey: string };

export type HolidaySlot = { scheduledFor: Date; startTime: string; durationMinutes: number };

export type HolidayMove = { session: any; sessionId: string; from: HolidaySlot; to: HolidaySlot };

export type HolidayShiftPlan = {
  /** Classes that fall on the holiday itself. */
  inHoliday: number;
  /** New slots added after the last class, one per class lost to the holiday. */
  appended: number;
  moves: HolidayMove[];
  newEndDate: Date | null;
  error?: string;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Longest closure accepted - long enough for any vacation, short enough to catch a mistyped year. */
export const MAX_HOLIDAY_DAYS = 62;

/** "Mon, 20 Oct 2026" - the wording every holiday notice uses for a day. */
export function holidayDayLabel(key: string) {
  return formatAcademyDateTime(academyDateTime(key, "12:00"), { weekday: "short", hour: undefined, minute: undefined });
}

export function holidayRangeLabel(range: HolidayRange) {
  return range.startKey === range.endKey ? holidayDayLabel(range.startKey) : `${holidayDayLabel(range.startKey)} to ${holidayDayLabel(range.endKey)}`;
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function addDaysToKey(key: string, days: number) {
  const next = new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS);
  return next.toISOString().slice(0, 10);
}

export function holidayLengthDays(range: HolidayRange) {
  return Math.round((Date.parse(`${range.endKey}T00:00:00Z`) - Date.parse(`${range.startKey}T00:00:00Z`)) / DAY_MS) + 1;
}

export function rangesOverlap(a: HolidayRange, b: HolidayRange) {
  return a.startKey <= b.endKey && b.startKey <= a.endKey;
}

export function isClosedOn(dateKey: string, ranges: HolidayRange[]) {
  return ranges.some((range) => dateKey >= range.startKey && dateKey <= range.endKey);
}

/** Why a requested holiday can't be declared, or "" when it can. */
export function holidayRangeError(range: Partial<HolidayRange>, todayKey: string) {
  if (!isDateKey(range.startKey) || !isDateKey(range.endKey)) return "Pick a valid start and end date.";
  if (range.endKey < range.startKey) return "The holiday must end on or after the day it starts.";
  if (range.startKey < todayKey) return "A holiday can't start in the past.";
  if (holidayLengthDays(range as HolidayRange) > MAX_HOLIDAY_DAYS) return `A holiday can be at most ${MAX_HOLIDAY_DAYS} days long.`;
  return "";
}

function slotOf(session: any, fallbackStartTime: string, fallbackDuration: number): HolidaySlot {
  return {
    scheduledFor: new Date(session.scheduledFor),
    startTime: resolveClassStartTime(session, { startTime: fallbackStartTime }),
    durationMinutes: Number(session.durationMinutes || fallbackDuration || 60),
  };
}

/**
 * The next `count` usable slots of the weekly pattern from `fromKey` onwards,
 * stepping over every closed day. Slots with no time on them are ignored rather
 * than landing a class at midnight.
 */
function patternSlotsAfter(daysOfWeek: any[], fromKey: string, count: number, closed: HolidayRange[], now: Date) {
  // Copied to plain objects: the pattern usually comes straight off a Mongoose
  // document, and buildWeeklyOccurrences spreads each slot - which drops a
  // subdocument's fields and leaves the class with no time.
  const usableDays = (daysOfWeek || [])
    .map((day: any) => ({
      day: Number(day?.day),
      slots: (day?.slots || [])
        .map((slot: any) => ({ startTime: String(slot?.startTime || ""), durationMinutes: Number(slot?.durationMinutes || 60) }))
        .filter((slot: any) => CLASS_TIME_PATTERN.test(slot.startTime)),
    }))
    .filter((day: any) => day.slots.length);
  const found: HolidaySlot[] = [];
  let cursorKey = fromKey;
  // Each round yields at least one slot or the pattern is empty; the cap only
  // stops a pathological closure list from spinning.
  for (let round = 0; round < 60 && found.length < count; round += 1) {
    const batch = buildWeeklyOccurrences(usableDays, cursorKey, count - found.length, now);
    if (!batch.length) break;
    for (const occurrence of batch) {
      if (isClosedOn(occurrence.dateKey, closed)) continue;
      found.push({ scheduledFor: occurrence.scheduledFor, startTime: occurrence.startTime, durationMinutes: Number(occurrence.durationMinutes || 60) });
    }
    cursorKey = addDaysToKey(batch[batch.length - 1].dateKey, 1);
  }
  return found;
}

/**
 * How one classroom's classes move for an academy holiday.
 *
 * Every class on a closed day moves to the class's next scheduled slot, and the
 * rest of the series slides down with it: each class takes the slot of the one
 * after it, and the classes lost to the holiday become new slots on the weekly
 * pattern after the last class. Order never changes, so each topic stays with
 * its class and the course simply ends later. The slots kept are the series'
 * own, so a one-off reschedule after the holiday keeps its date and time.
 *
 * Only classes that haven't started can move (see isMovableUpcomingSession) -
 * an unmarked past class is history, not a class waiting for a slot.
 */
export function planHolidayShift(input: {
  sessions: any[];
  daysOfWeek: any[];
  holiday: HolidayRange;
  /** Other closures still in force: no class is moved onto them either. */
  otherClosures?: HolidayRange[];
  now: Date;
  fallbackStartTime?: string;
  fallbackDurationMinutes?: number;
}): HolidayShiftPlan {
  const { holiday, now } = input;
  const closed = [holiday, ...(input.otherClosures || [])];
  const fallbackStartTime = String(input.fallbackStartTime || "");
  const fallbackDuration = Number(input.fallbackDurationMinutes || 60);
  const empty: HolidayShiftPlan = { inHoliday: 0, appended: 0, moves: [], newEndDate: null };

  const chain = upcomingMovableSessions(input.sessions, now).filter(
    (session: any) => academyDateKey(new Date(session.scheduledFor)) >= holiday.startKey
  );
  const inHoliday = chain.filter((session: any) => academyDateKey(new Date(session.scheduledFor)) <= holiday.endKey).length;
  if (!inHoliday) return empty;

  const kept = chain
    .filter((session: any) => !isClosedOn(academyDateKey(new Date(session.scheduledFor)), closed))
    .map((session: any) => slotOf(session, fallbackStartTime, fallbackDuration));
  const needed = chain.length - kept.length;

  const lastChainKey = academyDateKey(new Date(chain[chain.length - 1].scheduledFor));
  const appendFrom = addDaysToKey(lastChainKey > holiday.endKey ? lastChainKey : holiday.endKey, 1);
  const extras = patternSlotsAfter(input.daysOfWeek, appendFrom, needed, closed, now);

  // No usable weekly pattern: keep the last class's own time, a week at a time.
  if (extras.length < needed) {
    const last = chain[chain.length - 1];
    const startTime = resolveClassStartTime(last, { startTime: fallbackStartTime });
    if (!CLASS_TIME_PATTERN.test(startTime)) {
      return { ...empty, inHoliday, error: "A class in this series has no class time set, so there is no slot to move it to." };
    }
    let cursor = new Date(extras.length ? extras[extras.length - 1].scheduledFor : last.scheduledFor).getTime();
    for (let guard = 0; extras.length < needed && guard < 104; guard += 1) {
      cursor += 7 * DAY_MS;
      if (isClosedOn(academyDateKey(new Date(cursor)), closed)) continue;
      extras.push({ scheduledFor: new Date(cursor), startTime, durationMinutes: Number(last.durationMinutes || fallbackDuration) });
    }
    if (extras.length < needed) return { ...empty, inHoliday, error: "No free slot was found after the holiday." };
  }

  const slots = [...kept, ...extras];
  const moves: HolidayMove[] = [];
  chain.forEach((session: any, index: number) => {
    const from = slotOf(session, fallbackStartTime, fallbackDuration);
    const to = slots[index];
    const unchanged =
      from.scheduledFor.getTime() === to.scheduledFor.getTime() &&
      from.startTime === to.startTime &&
      from.durationMinutes === to.durationMinutes;
    if (!unchanged) moves.push({ session, sessionId: String(session._id), from, to });
  });

  return { inHoliday, appended: extras.length, moves, newEndDate: slots[slots.length - 1].scheduledFor };
}

export type RecordedHolidayMove = {
  sessionId: string;
  fromScheduledFor: Date | string;
  fromStartTime?: string;
  fromDurationMinutes?: number;
  toScheduledFor: Date | string;
  toStartTime?: string;
  toDurationMinutes?: number;
};

export type HolidayRestore = { session: any; move: RecordedHolidayMove; to: HolidaySlot; backHome: boolean };

/**
 * How one classroom's classes go back when its holiday is called off.
 *
 * Only a class still sitting exactly where the holiday put it, and still not
 * started, is touched - anything moved again since was a person's decision and
 * is reported instead of overwritten.
 *
 * The classes are re-laid in order on their pre-holiday slots that are still
 * ahead. Once part of the holiday has passed, its slots are gone, so the
 * classes that would have used them keep the latest holiday slots instead:
 * cancelling halfway leaves the series exactly as far along as the holiday
 * already pushed it, rather than putting two classes on the same day.
 */
export function planHolidayRestore(input: { sessions: any[]; moves: RecordedHolidayMove[]; now: Date }) {
  const { now } = input;
  const byId = new Map((input.sessions || []).map((session: any) => [String(session._id), session]));
  const restorable: Array<{ session: any; move: RecordedHolidayMove }> = [];
  const unrestored: RecordedHolidayMove[] = [];

  for (const move of input.moves || []) {
    const session = byId.get(String(move.sessionId));
    const untouched =
      session &&
      upcomingMovableSessions([session], now).length === 1 &&
      new Date(session.scheduledFor).getTime() === new Date(move.toScheduledFor).getTime();
    if (untouched) restorable.push({ session, move });
    else unrestored.push(move);
  }
  restorable.sort((a, b) => new Date(a.session.scheduledFor).getTime() - new Date(b.session.scheduledFor).getTime());

  const slotFrom = (move: RecordedHolidayMove): HolidaySlot => ({
    scheduledFor: new Date(move.fromScheduledFor),
    startTime: String(move.fromStartTime || ""),
    durationMinutes: Number(move.fromDurationMinutes || 60),
  });
  const slotTo = (move: RecordedHolidayMove): HolidaySlot => ({
    scheduledFor: new Date(move.toScheduledFor),
    startTime: String(move.toStartTime || ""),
    durationMinutes: Number(move.toDurationMinutes || 60),
  });

  const home = restorable.map(({ move }) => slotFrom(move)).filter((slot) => slot.scheduledFor.getTime() > now.getTime());
  const homeTimes = new Set(home.map((slot) => slot.scheduledFor.getTime()));
  const tail = restorable
    .map(({ move }) => slotTo(move))
    .filter((slot) => !homeTimes.has(slot.scheduledFor.getTime()))
    .sort((a, b) => b.scheduledFor.getTime() - a.scheduledFor.getTime())
    .slice(0, Math.max(0, restorable.length - home.length));
  const slots = [...home, ...tail].sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());

  const restores: HolidayRestore[] = [];
  restorable.forEach(({ session, move }, index) => {
    const to = slots[index];
    if (!to || to.scheduledFor.getTime() === new Date(session.scheduledFor).getTime()) return;
    restores.push({ session, move, to, backHome: to.scheduledFor.getTime() === new Date(move.fromScheduledFor).getTime() });
  });

  return { restores, unrestored };
}
