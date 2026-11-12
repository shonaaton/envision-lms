/** When the start reminders go out. Pure, so it can be tested on its own. */

export const TOURNAMENT_REMINDER_MINUTES = [30, 10] as const;
export type TournamentReminderMinutes = (typeof TOURNAMENT_REMINDER_MINUTES)[number];

/**
 * Which reminder is due now, if any. The 30-minute one goes out between 30
 * and 10 minutes before the start, the 10-minute one in the last 10 minutes.
 * A tick that first sees the event inside 10 minutes (a restart, a late
 * creation) sends only the 10-minute one rather than both at once.
 */
export function dueTournamentReminder(
  startAt: unknown,
  now: number,
  alreadySent: (minutes: TournamentReminderMinutes) => boolean
): TournamentReminderMinutes | null {
  const startsIn = new Date(startAt as any).getTime() - now;
  if (!Number.isFinite(startsIn) || startsIn <= 0) return null;
  if (startsIn <= 10 * 60_000) return alreadySent(10) ? null : 10;
  if (startsIn <= 30 * 60_000) return alreadySent(30) ? null : 30;
  return null;
}
