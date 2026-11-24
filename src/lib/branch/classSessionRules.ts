import { DAY_NAMES, dayOfDateKey, shiftDateKey, timeLabel } from "./rules";

/**
 * One-off changes to a weekly online class, worked out without the database.
 *
 * A class meets every week on its slot's day. A `BranchClassSession` record
 * changes one date:
 * - `regular`: the usual meeting, kept only to hold students added for that day;
 * - `cancelled`: the usual meeting on `date` doesn't happen;
 * - `moved`: the meeting from `fromDate` happens on `date` instead, at its own time;
 * - `extra`: an added meeting on `date`, at its own time.
 */

export type SessionKind = "regular" | "cancelled" | "moved" | "extra";

export type SessionRecord = {
  id?: string;
  kind: SessionKind;
  date: string;
  fromDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  guests?: string[];
  reason?: string | null;
};

export type WeeklySlot = { dayOfWeek: number; startTime: string; endTime: string; isActive?: boolean | null };

export type Occurrence = {
  date: string;
  kind: "regular" | "moved" | "extra";
  startTime: string;
  endTime: string;
  fromDate: string;
  guests: string[];
  sessionId: string;
  /** Why it doesn't happen: cancelled, or moved to another day. Empty when it goes ahead. */
  closed: string;
  cancelled: boolean;
  movedTo: { date: string; startTime: string } | null;
  reason: string;
};

/** "Tue 25 Nov" for a date key, read off the calendar. */
export function shortDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  return `${DAY_NAMES[value.getUTCDay()].slice(0, 3)} ${day} ${value.toLocaleString("en-IN", { month: "short", timeZone: "UTC" })}`;
}

/** "Tue 25 Nov, 5pm" */
export function whenLabel(date: string, startTime: string) {
  return `${shortDate(date)}, ${timeLabel(startTime)}`;
}

/** "25 Nov 2026, 5:00 PM IST", the date style the academy's WhatsApp templates use. */
export function templateWhen(date: string, startTime: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = startTime.split(":").map(Number);
  const monthName = new Date(Date.UTC(year, month - 1, day)).toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
  return `${day} ${monthName} ${year}, ${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"} IST`;
}

/**
 * The class on one date, or null when it doesn't meet then at all. A usual
 * meeting that was cancelled or moved away still comes back (with `closed`
 * set), so the register for that date can say why there is no class.
 * `records` are this slot's records whose `date` or `fromDate` is `date`.
 */
export function occurrenceOn(slot: WeeklySlot, date: string, records: SessionRecord[]): Occurrence | null {
  const here = records.find((record) => record.date === date);
  const movedAway = records.find((record) => record.kind === "moved" && record.fromDate === date);
  const base = {
    date,
    fromDate: "",
    guests: here?.guests || [],
    sessionId: here?.id || "",
    reason: here?.reason || "",
  };

  if (here && (here.kind === "moved" || here.kind === "extra")) {
    return {
      ...base,
      kind: here.kind,
      startTime: here.startTime || slot.startTime,
      endTime: here.endTime || slot.endTime,
      fromDate: here.fromDate || "",
      closed: "",
      cancelled: false,
      movedTo: null,
    };
  }
  if (dayOfDateKey(date) !== slot.dayOfWeek || slot.isActive === false) return null;
  const regular = { ...base, kind: "regular" as const, startTime: slot.startTime, endTime: slot.endTime };
  if (here?.kind === "cancelled") {
    return { ...regular, closed: here.reason ? `Class cancelled: ${here.reason}` : "Class cancelled", cancelled: true, movedTo: null };
  }
  if (movedAway) {
    const startTime = movedAway.startTime || slot.startTime;
    return {
      ...regular,
      guests: here?.guests || [],
      closed: `Class moved to ${whenLabel(movedAway.date, startTime)}`,
      cancelled: false,
      movedTo: { date: movedAway.date, startTime },
      reason: movedAway.reason || "",
    };
  }
  return { ...regular, closed: "", cancelled: false, movedTo: null };
}

/**
 * Every meeting of a class from `from` for `days` days, oldest first: usual
 * weeks (going ahead, cancelled or moved away) and meetings moved in or added.
 */
export function scheduleFor(slot: WeeklySlot, records: SessionRecord[], from: string, days: number) {
  const to = shiftDateKey(from, days - 1);
  const dates = new Set<string>();
  if (slot.isActive !== false) {
    for (let offset = 0; offset < days; offset += 1) {
      const date = shiftDateKey(from, offset);
      if (dayOfDateKey(date) === slot.dayOfWeek) dates.add(date);
    }
  }
  for (const record of records) {
    if ((record.kind === "moved" || record.kind === "extra") && record.date >= from && record.date <= to) dates.add(record.date);
  }
  return [...dates]
    .sort()
    .map((date) => occurrenceOn(slot, date, records.filter((record) => record.date === date || record.fromDate === date)))
    .filter((occurrence): occurrence is Occurrence => Boolean(occurrence));
}

/** Why a class can't be put on `date` at `startTime`, or "" when it can. */
export function newDateProblem(slot: WeeklySlot, date: string, records: SessionRecord[], today: string, ignoreId = "") {
  if (date < today) return "Pick today or a later date.";
  const others = records.filter((record) => record.id !== ignoreId);
  const there = others.find((record) => record.date === date);
  if (there && (there.kind === "moved" || there.kind === "extra")) return `This class already has a meeting on ${shortDate(date)}.`;
  const usual = dayOfDateKey(date) === slot.dayOfWeek && slot.isActive !== false;
  const usualGoesAhead = usual && there?.kind !== "cancelled" && !others.some((record) => record.kind === "moved" && record.fromDate === date);
  if (usualGoesAhead) return `This class already meets on ${shortDate(date)}. Pick another day.`;
  if (usual) return `The usual ${shortDate(date)} class was cancelled or moved. Restore it instead.`;
  return "";
}
