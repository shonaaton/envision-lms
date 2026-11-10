import { ACADEMY_TIME_ZONE, zonedDateTime } from "@/lib/academyTime";
import { dateKeyIn, twelveHourLabel } from "@/lib/demoTimeSlots";

/**
 * The demo times a family can ask for on the thank-you page.
 *
 * A fixed weekly timetable in academy time (IST), not a live calendar: the slot
 * is the family's preference, and sales confirms it on WhatsApp. The page and
 * the API both read this file, so an hour removed here can no longer be picked
 * or saved. 0 = Sunday ... 6 = Saturday.
 */
export const DEMO_SLOT_HOURS: Record<number, string[]> = {
  0: ["10:00", "11:00", "16:00"],
  1: ["16:00", "17:00", "18:00"],
  2: ["16:00", "17:00", "18:00"],
  3: ["16:00", "17:00", "18:00"],
  4: ["16:00", "17:00", "18:00"],
  5: ["15:00", "16:00", "17:00", "18:00"],
  6: ["10:00", "11:00", "12:00", "16:00"],
};

/** Tomorrow up to this many days out. Today is left out so sales has time to arrange a coach. */
export const DEMO_SLOT_DAYS_AHEAD = 30;

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Noon UTC of a YYYY-MM-DD key: safe to read the weekday and label from in any time zone. */
function noonUtc(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function demoSlotDayLabel(dateKey: string, withYear = true) {
  if (!DATE_KEY.test(dateKey)) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" as const } : {}),
  }).format(noonUtc(dateKey));
}

export function demoSlotDays(now = new Date()) {
  const today = noonUtc(dateKeyIn(ACADEMY_TIME_ZONE, now));
  return Array.from({ length: DEMO_SLOT_DAYS_AHEAD }, (_, index) => {
    const key = new Date(today.getTime() + (index + 1) * 86400000).toISOString().slice(0, 10);
    // No year: the list never reaches past next month, and the full label does not fit a phone.
    return { key, label: demoSlotDayLabel(key, false) };
  });
}

export function demoSlotTimes(dateKey: string) {
  if (!DATE_KEY.test(dateKey)) return [];
  return (DEMO_SLOT_HOURS[noonUtc(dateKey).getUTCDay()] || []).map((time) => ({ time, label: twelveHourLabel(time) }));
}

export function isOpenDemoSlot(dateKey: string, time: string, now = new Date()) {
  return demoSlotDays(now).some((day) => day.key === dateKey) && demoSlotTimes(dateKey).some((slot) => slot.time === time);
}

export function demoSlotStart(dateKey: string, time: string) {
  return zonedDateTime(dateKey, time, ACADEMY_TIME_ZONE);
}

/** "Saturday 14 November 2026 at 4:00 PM IST", or "" when no slot was chosen. */
export function demoSlotLabel(dateKey?: string | null, time?: string | null) {
  if (!dateKey || !time || !DATE_KEY.test(dateKey) || !/^\d{2}:\d{2}$/.test(time)) return "";
  return `${demoSlotDayLabel(dateKey)} at ${twelveHourLabel(time)} IST`;
}
