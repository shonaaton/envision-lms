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
  const { processDueCourseCompletions } = await import("@/lib/courseCompletionSweep");
  const { processDailyTaskReminders } = await import("@/lib/tasks/taskReminders");
  const { processMonthlyFeedbackCycle } = await import("@/lib/feedback/feedbackService");
  const { processPtmSweep } = await import("@/lib/ptm/ptmService");
  const { processLeaveSweep } = await import("@/lib/leave/leaveService");
  const { sealLegacyTempPasswords } = await import("@/lib/tempPasswordMigration");
  const { processRetentionSweep } = await import("@/lib/retention/retentionSweep");

  installRuntimeProcessLogging();
  installRuntimeStderrCapture();

  startScheduler([
    { name: "ptm_sweep", intervalMs: 60 * 60_000, run: () => processPtmSweep() },
    {
      /**
       * Staff leave: closes requests nobody decided on before their day ended,
       * and re-checks substitute cover on approved leaves (settling or repairing
       * the "arrange substitutes" task). Every step is a guarded status change.
       */
      name: "leave_sweep",
      intervalMs: 60 * 60_000,
      run: () => processLeaveSweep(),
    },
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
      /**
       * Closes courses an admin armed with "close after the last scheduled
       * class". Hourly is ample: the trigger is the last register being marked,
       * and nothing downstream needs the status within the hour.
       */
      name: "course_completions",
      intervalMs: 60 * 60_000,
      run: () => processDueCourseCompletions(),
    },
    {
      /**
       * Staff task digest (once a day after TASK_REMINDER_HOUR, academy time)
       * plus a one-off notice when a task passes its due date. Swept hourly and
       * claimed per person per day, like the monthly attendance summaries.
       */
      name: "task_daily_reminders",
      intervalMs: 60 * 60_000,
      run: () => processDailyTaskReminders(),
    },
    {
      /**
       * Opens each month's coach feedback on the 25th: one empty report and one
       * task per student. Swept hourly until the due date (the 5th) so a
       * restart cannot miss it and late joiners still get a report; the unique
       * {month, student, coach} index makes every re-run a no-op.
       */
      name: "monthly_feedback_cycle",
      intervalMs: 60 * 60_000,
      run: () => processMonthlyFeedbackCycle(),
    },
    {
      /**
       * Seals temporary passwords stored in plain text before they were
       * encrypted. After the first run on a new deploy there is nothing left
       * to do; the daily sweep costs one scan of the users collection.
       */
      name: "seal_legacy_temp_passwords",
      intervalMs: 24 * 60 * 60_000,
      run: () => sealLegacyTempPasswords(),
    },
    {
      /** Warns families a week before a paused enrolment restarts billing. */
      name: "pause_expiry_notices",
      intervalMs: 6 * 60 * 60_000,
      run: () => processDuePauseExpiryNotices(),
    },
    {
      /**
       * Flags students who look like they are about to leave and puts a "call
       * this family" task in front of the admins. Hourly, but claimed once per
       * academy day from RETENTION_SWEEP_HOUR (08:00 IST), so the tasks are
       * there when the 09:00 digest goes out.
       */
      name: "retention_risk_sweep",
      intervalMs: 60 * 60_000,
      run: () => processRetentionSweep(),
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
