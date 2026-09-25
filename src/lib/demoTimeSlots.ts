import { ACADEMY_TIME_ZONE, zonedDateTime } from "@/lib/academyTime";

/** How far ahead of "now" the first bookable demo slot has to start. */
export const DEMO_LEAD_MINUTES = 30;
export const DEMO_SLOT_STEP_MINUTES = 30;

export type DemoDayOption = { key: string; weekday: string; dayMonth: string; relative: string };
export type DemoTimeOption = { time: string; label: string; start: Date; period: DemoPeriod };
export type DemoPeriod = "Early morning" | "Morning" | "Afternoon" | "Evening" | "Night";

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar day it currently is in `timeZone`, as YYYY-MM-DD. */
export function dateKeyIn(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10);
}

/** Labels a YYYY-MM-DD key without letting any time zone move it. */
function dayLabel(dateKey: string, options: Intl.DateTimeFormatOptions) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function upcomingDemoDays(timeZone: string, count = 14, now = new Date()): DemoDayOption[] {
  const today = dateKeyIn(timeZone, now);
  return Array.from({ length: count }, (_, index) => {
    const key = addDays(today, index);
    return {
      key,
      weekday: dayLabel(key, { weekday: "short" }),
      dayMonth: dayLabel(key, { day: "numeric", month: "short" }),
      relative: index === 0 ? "Today" : index === 1 ? "Tomorrow" : "",
    };
  });
}

export function twelveHourLabel(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours < 12 ? "AM" : "PM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function periodFor(hours: number): DemoPeriod {
  if (hours < 6) return "Early morning";
  if (hours < 12) return "Morning";
  if (hours < 17) return "Afternoon";
  if (hours < 21) return "Evening";
  return "Night";
}

/** Every half hour of `dateKey` in `timeZone` that is still far enough ahead to request. */
export function demoTimeOptions(dateKey: string, timeZone: string, now = new Date()): DemoTimeOption[] {
  const earliest = now.getTime() + DEMO_LEAD_MINUTES * 60000;
  const options: DemoTimeOption[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += DEMO_SLOT_STEP_MINUTES) {
    const hours = Math.floor(minutes / 60);
    const time = `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const start = zonedDateTime(dateKey, time, timeZone);
    if (start.getTime() < earliest) continue;
    options.push({ time, label: twelveHourLabel(time), start, period: periodFor(hours) });
  }
  return options;
}

export function describeInZone(start: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(start);
}

export function sameClockAsAcademy(timeZone: string, at = new Date()) {
  const read = (zone: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, dateStyle: "short", timeStyle: "short" }).format(at);
  return read(timeZone) === read(ACADEMY_TIME_ZONE);
}

const COMMON_TIME_ZONES: Array<{ zone: string; label: string }> = [
  { zone: "Asia/Kolkata", label: "India (IST)" },
  { zone: "Asia/Dubai", label: "UAE / Oman (Gulf)" },
  { zone: "Asia/Riyadh", label: "Saudi Arabia / Kuwait / Qatar" },
  { zone: "Asia/Singapore", label: "Singapore / Malaysia" },
  { zone: "Asia/Dhaka", label: "Bangladesh" },
  { zone: "Asia/Kathmandu", label: "Nepal" },
  { zone: "Europe/London", label: "United Kingdom" },
  { zone: "Europe/Berlin", label: "Central Europe" },
  { zone: "America/New_York", label: "US / Canada - Eastern" },
  { zone: "America/Chicago", label: "US / Canada - Central" },
  { zone: "America/Denver", label: "US / Canada - Mountain" },
  { zone: "America/Los_Angeles", label: "US / Canada - Pacific" },
  { zone: "Australia/Sydney", label: "Australia - Sydney / Melbourne" },
  { zone: "Pacific/Auckland", label: "New Zealand" },
];

/** The dropdown list: the device's zone first, then the common ones, then everything else. */
export function timeZoneChoices(detected: string) {
  const all: string[] = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const seen = new Set<string>();
  const choices: Array<{ zone: string; label: string; group: string }> = [];
  const push = (zone: string, label: string, group: string) => {
    if (!zone || seen.has(zone) || !isValidTimeZone(zone)) return;
    seen.add(zone);
    choices.push({ zone, label, group });
  };
  const common = COMMON_TIME_ZONES.find((item) => item.zone === detected);
  push(detected, `${common?.label || detected.replace(/_/g, " ")} - this device`, "Your device");
  COMMON_TIME_ZONES.forEach((item) => push(item.zone, item.label, "Common"));
  all.forEach((zone) => push(zone, zone.replace(/_/g, " "), "All time zones"));
  return choices;
}
