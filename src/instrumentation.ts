/**
 * Background job registration.
 *
 * Everything scheduled in-process is declared here and run by
 * `lib/scheduler.ts`, which owns the timers, the overlap guard, the
 * cold-start handling, logging and failure alerts. To add a job, add a row.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startScheduler } = await import("@/lib/scheduler");
  const { installRuntimeProcessLogging, installRuntimeStderrCapture } = await import("@/lib/runtimeLogger");
  const { processDueAskCoachEmailReminders } = await import("@/lib/askCoachEmailReminders");
  const { processDueHomeworkEmailReminders } = await import("@/lib/homeworkEmailReminders");
  const { processDueAskCoachWhatsAppReminders, processAskCoachNightlyDigest } = await import("@/lib/askCoachWhatsAppReminders");
  const { processDueClassSessionReminders } = await import("@/lib/classSessionNotifications");
  const { processDueAttendanceNudges, sendMonthlyAttendanceSummaries } = await import("@/lib/attendanceNotifications");
  const { processDuePauseExpiryNotices } = await import("@/lib/studentLifecycleNotifications");
  const { academyDateKey } = await import("@/lib/academyTime");
  const { runTournamentTick } = await import("@/lib/tournamentLifecycle");

  installRuntimeProcessLogging();
  installRuntimeStderrCapture();

  startScheduler([
    {
      name: "ask_coach_email_reminders",
      intervalMs: 60_000,
      run: processDueAskCoachEmailReminders,
    },
    {
      name: "ask_coach_whatsapp_reminders",
      intervalMs: 60_000,
      run: async () => {
        await processDueAskCoachWhatsAppReminders();
        await processAskCoachNightlyDigest();
      },
    },
    {
      name: "homework_email_reminders",
      intervalMs: 60_000,
      run: processDueHomeworkEmailReminders,
    },
    {
      /**
       * Class-starting reminders and the coach-not-joined alert. Runs every
       * minute because a T-10 reminder that arrives at T-4 is not a reminder.
       */
      name: "class_session_reminders",
      intervalMs: 60_000,
      run: processDueClassSessionReminders,
    },
    {
      /** Chases coaches whose register is still empty an hour after class. */
      name: "attendance_coach_nudges",
      intervalMs: 15 * 60_000,
      run: processDueAttendanceNudges,
    },
    {
      /**
       * Swept hourly rather than scheduled for a date, so a restart cannot make
       * it miss its window. The job claims the month before sending, so the
       * extra sweeps cost a single indexed query each.
       */
      name: "monthly_attendance_summaries",
      intervalMs: 60 * 60_000,
      run: () => sendMonthlyAttendanceSummaries(),
    },
    {
      /** Warns families a week before a paused enrolment restarts billing. */
      name: "pause_expiry_notices",
      intervalMs: 6 * 60 * 60_000,
      run: () => processDuePauseExpiryNotices(),
    },
    {
      /**
       * The tournament heartbeat. Without it, tournaments only advanced as a
       * side effect of somebody loading a page: an event with nobody watching
       * would never start, never pair, never flag a clock and never finish.
       * Arena pairing latency is bounded by this interval, so it is short — and
       * it starts immediately rather than waiting out the startup delay.
       */
      name: "tournament_lifecycle",
      intervalMs: 5_000,
      run: runTournamentTick,
      runImmediately: true,
      silentFailure: true,
    },
  ]);
}
