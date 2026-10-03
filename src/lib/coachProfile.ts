/**
 * A coach's teaching profile: languages they can teach in and the weekly hours
 * they are free to take classes. Shared by the Teaching Profile page, its form
 * and the save action, so what the form offers and what the server accepts
 * cannot drift apart.
 *
 * Times are "HH:MM" in IST, the academy's clock.
 */

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

export const MAX_LANGUAGES = 15;
export const MAX_SLOTS = 50;
export const MAX_NOTE_LENGTH = 500;

export type AvailabilitySlot = { dayOfWeek: number; startTime: string; endTime: string };

export type CoachProfileView = {
  languages: string[];
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

/** Plain-object copy of what is stored on the User, safe to hand to a client component. */
export function toCoachProfileView(raw: any): CoachProfileView {
  const profile = raw?.coachProfile || {};
  const availability = normalizeAvailability(
    (profile.availability || []).map((slot: any) => ({ dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime }))
  );
  return {
    languages: normalizeLanguages(profile.languages || []),
    availability: availability.ok ? availability.slots : [],
    availabilityNote: String(profile.availabilityNote || ""),
    updatedAt: profile.updatedAt ? new Date(profile.updatedAt).toISOString() : null,
  };
}
