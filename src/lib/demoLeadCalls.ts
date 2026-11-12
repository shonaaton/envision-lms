/**
 * Call logging and call-back reminders for the Demo Leads CRM (2026-11-12,
 * user: "picked up or missed, automatically record the time, a place to write
 * remarks in all cases, and salespeople can set themselves reminders").
 *
 * Pure rules only, shared by the server code and its tests. The time of a call
 * is always the server's clock at the moment the button is pressed: the
 * salesperson never types it.
 */

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
