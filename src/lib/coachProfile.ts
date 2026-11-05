/**
 * A coach's teaching profile: languages they can teach in, the course levels
 * they can take and the weekly hours they are free to take classes. Shared by
 * the Coach Profiles page, its form and the save action, so what the form
 * offers and what the server accepts cannot drift apart.
 *
 * Only the admin team fills these in; coaches do not edit their own.
 *
 * Times are "HH:MM" in IST, the academy's clock.
 */

import { COURSE_TIERS, COURSE_TIER_LABELS } from "@/lib/courseTiers";

export const LANGUAGE_OPTIONS = [
  "English",
  "Hindi",
  "Bengali",
  "Odia",
  "Assamese",
  "Marathi",
  "Gujarati",
  "Punjabi",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Urdu",
] as const;

/** Monday first: that is how the academy reads a week. Values are JS getDay(). */
export const WEEK_DAYS = [
  { day: 1, short: "Mon", label: "Monday" },
  { day: 2, short: "Tue", label: "Tuesday" },
  { day: 3, short: "Wed", label: "Wednesday" },
  { day: 4, short: "Thu", label: "Thursday" },
  { day: 5, short: "Fri", label: "Friday" },
  { day: 6, short: "Sat", label: "Saturday" },
  { day: 0, short: "Sun", label: "Sunday" },
] as const;

/**
 * Every tier of the ladder has three sub-levels (demoCurriculum.ts; a test keeps
 * the two in step). A level is stored as "tier:n", e.g. "intermediate:2".
 */
export const SUB_LEVELS_PER_TIER = 3;

export const LEVEL_GROUPS = COURSE_TIERS.map((tier) => ({
  tier,
  label: COURSE_TIER_LABELS[tier] || tier,
  levels: Array.from({ length: SUB_LEVELS_PER_TIER }, (_, index) => ({
    key: `${tier}:${index + 1}`,
    short: `L${index + 1}`,
    label: `${COURSE_TIER_LABELS[tier] || tier} Level ${index + 1}`,
  })),
}));

const LEVEL_ORDER: string[] = LEVEL_GROUPS.flatMap((group) => group.levels.map((level) => level.key));

export function levelLabel(key: string) {
  return LEVEL_GROUPS.flatMap((group) => group.levels).find((level) => level.key === key)?.label || key;
}

/** Known levels only, in ladder order, without duplicates. */
export function normalizeLevels(input: unknown): string[] {
  const wanted = new Set((Array.isArray(input) ? input : []).map((raw) => String(raw ?? "").trim()));
  return LEVEL_ORDER.filter((key) => wanted.has(key));
}

/** "Beginner L1-L3", "Intermediate L2": a coach's levels grouped by tier for a table cell. */
export function levelsByTier(levels: string[]) {
  return LEVEL_GROUPS.map((group) => ({
    tier: group.tier,
    label: group.label,
    levels: group.levels.filter((level) => levels.includes(level.key)),
  })).filter((group) => group.levels.length > 0);
}

export const MAX_LANGUAGES = 15;
export const MAX_SLOTS = 50;
export const MAX_NOTE_LENGTH = 500;

export type AvailabilitySlot = { dayOfWeek: number; startTime: string; endTime: string };

export type CoachProfileView = {
  languages: string[];
  levels: string[];
  availability: AvailabilitySlot[];
  availabilityNote: string;
  updatedAt: string | null;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function minutesOf(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** "Bengali" whatever case it was typed in; a known language keeps its spelling. */
function tidyLanguage(raw: unknown) {
  const value = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!value) return "";
  const known = LANGUAGE_OPTIONS.find((option) => option.toLowerCase() === value.toLowerCase());
  return known || value.charAt(0).toUpperCase() + value.slice(1);
}

export function normalizeLanguages(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of list) {
    const value = tidyLanguage(raw);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= MAX_LANGUAGES) break;
  }
  return result;
}

/**
 * Validated, sorted and merged availability.
 *
 * Returns an error rather than silently dropping a bad row: a coach who typed
 * 18:00-17:00 should be told, not find the slot quietly missing.
 * Overlapping or touching slots on the same day are merged into one.
 */
export function normalizeAvailability(input: unknown): { ok: true; slots: AvailabilitySlot[] } | { ok: false; error: string } {
  const list = Array.isArray(input) ? input : [];
  if (list.length > MAX_SLOTS) return { ok: false, error: `Add at most ${MAX_SLOTS} time slots.` };
  const slots: AvailabilitySlot[] = [];
  for (const raw of list) {
    const dayOfWeek = Number((raw as any)?.dayOfWeek);
    const startTime = String((raw as any)?.startTime ?? "").trim();
    const endTime = String((raw as any)?.endTime ?? "").trim();
    const dayName = WEEK_DAYS.find((item) => item.day === dayOfWeek)?.label;
    if (!Number.isInteger(dayOfWeek) || !dayName) return { ok: false, error: "Choose a day for every time slot." };
    if (!TIME.test(startTime) || !TIME.test(endTime)) return { ok: false, error: `Enter a start and end time for every ${dayName} slot.` };
    if (minutesOf(endTime) <= minutesOf(startTime)) {
      return { ok: false, error: `${dayName} ${startTime}-${endTime}: the end time must be after the start time.` };
    }
    slots.push({ dayOfWeek, startTime, endTime });
  }

  const order = (day: number) => WEEK_DAYS.findIndex((item) => item.day === day);
  slots.sort((a, b) => order(a.dayOfWeek) - order(b.dayOfWeek) || minutesOf(a.startTime) - minutesOf(b.startTime));
  const merged: AvailabilitySlot[] = [];
  for (const slot of slots) {
    const last = merged[merged.length - 1];
    if (last && last.dayOfWeek === slot.dayOfWeek && minutesOf(slot.startTime) <= minutesOf(last.endTime)) {
      if (minutesOf(slot.endTime) > minutesOf(last.endTime)) last.endTime = slot.endTime;
      continue;
    }
    merged.push({ ...slot });
  }
  return { ok: true, slots: merged };
}

/** "6:30 PM" from "18:30". */
export function formatTime(time: string) {
  if (!TIME.test(time)) return time;
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Slots grouped per day in week order, skipping days with nothing. */
export function availabilityByDay(slots: AvailabilitySlot[]) {
  return WEEK_DAYS.map((day) => ({
    ...day,
    slots: slots.filter((slot) => slot.dayOfWeek === day.day),
  })).filter((day) => day.slots.length > 0);
}

export function weeklyAvailableMinutes(slots: AvailabilitySlot[]) {
  return slots.reduce((sum, slot) => sum + Math.max(0, minutesOf(slot.endTime) - minutesOf(slot.startTime)), 0);
}

/** A weekly class a coach is already teaching, with the batches that sit in it. */
export type TakenSlot = AvailabilitySlot & { batches: string[] };

export type WeekSegment =
  | { kind: "free"; startTime: string; endTime: string }
  | { kind: "taken"; startTime: string; endTime: string; batches: string[] };

export type WeekDaySegments = { day: number; short: string; label: string; segments: WeekSegment[] };

function clockOf(minutes: number) {
  const clamped = Math.min(minutes, 23 * 60 + 59);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/**
 * The coach's week as free stretches and taken classes, in time order.
 *
 * Free is what the admin team entered minus the classes running on it, worked
 * out on every read so the time comes back by itself when a batch ends. A class
 * outside the entered hours is still shown: the coach is teaching then, whatever
 * the profile says. Classes that overlap become one block naming both batches.
 */
export function weekSegments(availability: AvailabilitySlot[], taken: TakenSlot[]): WeekDaySegments[] {
  return WEEK_DAYS.map((day) => {
    const blocks: { start: number; end: number; batches: string[] }[] = [];
    for (const slot of taken
      .filter((item) => item.dayOfWeek === day.day)
      .sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime))) {
      const start = minutesOf(slot.startTime);
      const end = minutesOf(slot.endTime);
      const last = blocks[blocks.length - 1];
      if (last && start < last.end) {
        last.end = Math.max(last.end, end);
        last.batches = Array.from(new Set([...last.batches, ...slot.batches]));
      } else {
        blocks.push({ start, end, batches: [...slot.batches] });
      }
    }

    const segments: (WeekSegment & { sort: number })[] = blocks.map((block) => ({
      kind: "taken",
      startTime: clockOf(block.start),
      endTime: clockOf(block.end),
      batches: block.batches,
      sort: block.start,
    }));
    for (const slot of availability.filter((item) => item.dayOfWeek === day.day)) {
      let cursor = minutesOf(slot.startTime);
      const end = minutesOf(slot.endTime);
      for (const block of blocks) {
        if (block.end <= cursor || block.start >= end) continue;
        if (block.start > cursor) segments.push({ kind: "free", startTime: clockOf(cursor), endTime: clockOf(block.start), sort: cursor });
        cursor = Math.max(cursor, block.end);
      }
      if (cursor < end) segments.push({ kind: "free", startTime: clockOf(cursor), endTime: clockOf(end), sort: cursor });
    }

    return {
      day: day.day,
      short: day.short,
      label: day.label,
      segments: segments.sort((a, b) => a.sort - b.sort).map(({ sort: _sort, ...segment }) => segment as WeekSegment),
    };
  }).filter((day) => day.segments.length > 0);
}

/** Minutes a week still free, and minutes taken by classes. */
export function weekMinutes(days: WeekDaySegments[]) {
  let free = 0;
  let taken = 0;
  for (const segment of days.flatMap((day) => day.segments)) {
    const minutes = Math.max(0, minutesOf(segment.endTime) - minutesOf(segment.startTime));
    if (segment.kind === "free") free += minutes;
    else taken += minutes;
  }
  return { free, taken };
}

/** Plain-object copy of what is stored on the User, safe to hand to a client component. */
export function toCoachProfileView(raw: any): CoachProfileView {
  const profile = raw?.coachProfile || {};
  const availability = normalizeAvailability(
    (profile.availability || []).map((slot: any) => ({ dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime }))
  );
  return {
    languages: normalizeLanguages(profile.languages || []),
    levels: normalizeLevels(profile.levels || []),
    availability: availability.ok ? availability.slots : [],
    availabilityNote: String(profile.availabilityNote || ""),
    updatedAt: profile.updatedAt ? new Date(profile.updatedAt).toISOString() : null,
  };
}
