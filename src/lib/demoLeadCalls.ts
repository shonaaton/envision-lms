/**
 * Call logging and call-back reminders for the Demo Leads CRM (2026-11-12,
 * user: "picked up or missed, automatically record the time, a place to write
 * remarks in all cases, and salespeople can set themselves reminders").
 *
 * Pure rules only, shared by the server code and its tests. The time of a call
 * is always the server's clock at the moment the button is pressed: the
 * salesperson never types it.
 */

import { academyDateKey, academyDateTime } from "@/lib/academyTime";

export const DEMO_LEAD_CALL_OUTCOMES = [
  { value: "picked_up", label: "Picked up" },
  { value: "missed", label: "Missed" },
] as const;

export type DemoLeadCallOutcome = (typeof DEMO_LEAD_CALL_OUTCOMES)[number]["value"];

export function isDemoLeadCallOutcome(value: unknown): value is DemoLeadCallOutcome {
  return DEMO_LEAD_CALL_OUTCOMES.some((outcome) => outcome.value === value);
}

export function demoLeadCallOutcomeLabel(value: unknown) {
  return DEMO_LEAD_CALL_OUTCOMES.find((outcome) => outcome.value === value)?.label || "Call";
}

export const CALL_REMARKS_MAX = 1000;
export const REMINDER_NOTE_MAX = 300;
/** A reminder further out than this is a typo (a wrong year), not a plan. */
export const REMINDER_MAX_DAYS = 90;
/** Open reminders one person may hold on one lead. */
export const REMINDERS_PER_LEAD_MAX = 5;

/** The text saved in the lead's history for a call, remarks on the lines after the outcome. */
export function callLogText(outcome: DemoLeadCallOutcome, remarks: string) {
  const heading = outcome === "picked_up" ? "Call: picked up" : "Call: missed";
  const body = remarks.trim().slice(0, CALL_REMARKS_MAX);
  return body ? `${heading}\n${body}` : heading;
}

export type ReminderTimeCheck = { ok: true; at: Date } | { ok: false; error: string };

/**
 * A reminder must be in the future (a minute of slack for a slow form) and
 * within REMINDER_MAX_DAYS. `at` is already resolved to an instant by the
 * caller (an academy-time datetime-local value).
 */
export function checkReminderTime(at: Date | null | undefined, now = new Date()): ReminderTimeCheck {
  if (!at || Number.isNaN(at.getTime())) return { ok: false, error: "Pick a date and time for the reminder." };
  if (at.getTime() < now.getTime() - 60_000) return { ok: false, error: "That time has already passed. Pick a time in the future." };
  if (at.getTime() > now.getTime() + REMINDER_MAX_DAYS * 24 * 3600_000) {
    return { ok: false, error: `Reminders can be set up to ${REMINDER_MAX_DAYS} days ahead.` };
  }
  return { ok: true, at };
}

/**
 * A missed call sets a call-back on its own (2026-11-12, user: "auto-remind on
 * missed"). The salesperson picks how soon next to the Missed button; two hours
 * unless they change it. A time that lands outside calling hours moves to
 * 11 AM IST: the same morning if it is before 9 AM, the next day if after 8 PM.
 */
export const MISSED_CALL_REMINDER_CHOICES = [
  { value: "1h", label: "In 1 hour" },
  { value: "2h", label: "In 2 hours" },
  { value: "tomorrow", label: "Tomorrow 11 AM" },
  { value: "none", label: "Don't remind me" },
] as const;

export type MissedCallReminderChoice = (typeof MISSED_CALL_REMINDER_CHOICES)[number]["value"];
export const DEFAULT_MISSED_CALL_REMINDER: MissedCallReminderChoice = "2h";

export function parseMissedCallReminderChoice(value: unknown): MissedCallReminderChoice {
  return MISSED_CALL_REMINDER_CHOICES.some((choice) => choice.value === value) ? (value as MissedCallReminderChoice) : DEFAULT_MISSED_CALL_REMINDER;
}

const CALLING_STARTS = "09:00";
const CALLING_ENDS = "20:00";
const MORNING_SLOT = "11:00";

/** When to remind after a missed call, or null for "Don't remind me". */
export function missedCallReminderTime(choice: MissedCallReminderChoice, now = new Date()): Date | null {
  if (choice === "none") return null;
  const tomorrowKey = academyDateKey(new Date(now.getTime() + 24 * 3600_000));
  if (choice === "tomorrow") return academyDateTime(tomorrowKey, MORNING_SLOT);

  const at = new Date(now.getTime() + (choice === "1h" ? 1 : 2) * 3600_000);
  const dayKey = academyDateKey(at);
  if (at.getTime() < academyDateTime(dayKey, CALLING_STARTS).getTime()) return academyDateTime(dayKey, MORNING_SLOT);
  if (at.getTime() > academyDateTime(dayKey, CALLING_ENDS).getTime()) {
    return academyDateTime(academyDateKey(new Date(at.getTime() + 24 * 3600_000)), MORNING_SLOT);
  }
  return at;
}

/** The quick picks under the reminder box, as academy wall-clock instants. */
export function reminderPresets(now: Date, academyDateTime: (dateKey: string, time: string) => Date, todayKey: string, tomorrowKey: string) {
  const round = (date: Date) => new Date(Math.ceil(date.getTime() / (5 * 60_000)) * 5 * 60_000);
  const presets: Array<{ label: string; at: Date }> = [
    { label: "In 30 min", at: round(new Date(now.getTime() + 30 * 60_000)) },
    { label: "In 2 hours", at: round(new Date(now.getTime() + 2 * 3600_000)) },
  ];
  const evening = academyDateTime(todayKey, "18:00");
  if (evening.getTime() > now.getTime() + 15 * 60_000) presets.push({ label: "This evening 6 PM", at: evening });
  presets.push({ label: "Tomorrow 11 AM", at: academyDateTime(tomorrowKey, "11:00") });
  presets.push({ label: "Tomorrow 6 PM", at: academyDateTime(tomorrowKey, "18:00") });
  return presets;
}
