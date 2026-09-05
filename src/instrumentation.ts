declare global {
  var askCoachReminderInterval: ReturnType<typeof setInterval> | undefined;
  var homeworkReminderInterval: ReturnType<typeof setInterval> | undefined;
  var reminderStartupTimer: ReturnType<typeof setTimeout> | undefined;
  var tournamentTickInterval: ReturnType<typeof setInterval> | undefined;
  var tournamentTickRunning: boolean | undefined;
}

const REMINDER_STARTUP_DELAY_MS = 30_000;

/**
 * How often the tournament lifecycle runs. Arena pairing latency is bounded by
 * this, so it is deliberately short — a player who finishes a game waits at
 * most this long for the next one.
 */
const TOURNAMENT_TICK_MS = 5_000;

function isTransientMongoStartupError(error: unknown) {
  const name = typeof error === "object" && error ? String((error as { name?: unknown }).name || "") : "";
  const message = error instanceof Error ? error.message : String(error || "");
  const reasonType =
    typeof error === "object" && error && "reason" in error
      ? String((error as { reason?: { type?: unknown } }).reason?.type || "")
      : "";

  return (
    name === "MongooseServerSelectionError" ||
    name === "MongoServerSelectionError" ||
    /server selection timed out/i.test(message) ||
    /ReplicaSetNoPrimary/i.test(reasonType) ||
    /connection <monitor> .* closed/i.test(message)
  );
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || (globalThis.askCoachReminderInterval && globalThis.homeworkReminderInterval)) return;

  const { processDueAskCoachEmailReminders } = await import("@/lib/askCoachEmailReminders");
  const { processDueHomeworkEmailReminders } = await import("@/lib/homeworkEmailReminders");
  const { notifyFailure } = await import("@/lib/failureNotifications");
  const { installRuntimeProcessLogging, installRuntimeStderrCapture, writeRuntimeLog } = await import("@/lib/runtimeLogger");
  installRuntimeProcessLogging();
  installRuntimeStderrCapture();
  const runAskCoach = () => {
    void processDueAskCoachEmailReminders().catch((error) => {
      if (isTransientMongoStartupError(error)) {
        console.warn("Scheduled Ask Coach unread email processing skipped: MongoDB primary is not ready yet.");
        return;
      }
      console.error("Scheduled Ask Coach unread email processing failed", error);
      writeRuntimeLog({
        source: "instrumentation.askCoachReminders",
        message: "Scheduled Ask Coach unread email processing failed.",
        error,
        metadata: { automation: "ask_coach_email_reminders" },
      });
      void notifyFailure({ title: "Scheduled Ask Coach unread email processing failed", error, metadata: { automation: "ask_coach_email_reminders" } });
    });
  };
  const runHomework = () => {
    void processDueHomeworkEmailReminders().catch((error) => {
      if (isTransientMongoStartupError(error)) {
        console.warn("Scheduled homework email reminder processing skipped: MongoDB primary is not ready yet.");
        return;
      }
      console.error("Scheduled homework email reminder processing failed", error);
      writeRuntimeLog({
        source: "instrumentation.homeworkReminders",
        message: "Scheduled homework email reminder processing failed.",
        error,
        metadata: { automation: "homework_email_reminders" },
      });
      void notifyFailure({ title: "Scheduled homework email reminder processing failed", error, metadata: { automation: "homework_email_reminders" } });
    });
  };
  const runStartup = () => {
    runAskCoach();
    runHomework();
  };

  if (!globalThis.reminderStartupTimer) {
    globalThis.reminderStartupTimer = setTimeout(runStartup, REMINDER_STARTUP_DELAY_MS);
    globalThis.reminderStartupTimer.unref?.();
  }

  if (!globalThis.askCoachReminderInterval) {
    globalThis.askCoachReminderInterval = setInterval(runAskCoach, 60_000);
    globalThis.askCoachReminderInterval.unref?.();
  }
  if (!globalThis.homeworkReminderInterval) {
    globalThis.homeworkReminderInterval = setInterval(runHomework, 60_000);
    globalThis.homeworkReminderInterval.unref?.();
  }

  /**
   * The tournament heartbeat.
   *
   * Without this, tournaments only advanced as a side effect of somebody
   * loading a page: an event with nobody watching would never start, never
   * pair, never flag a clock and never finish. The tick is guarded against
   * overlapping with itself, and every step it calls is idempotent, so running
   * it alongside platform cron or a second instance is safe.
   */
  const runTournamentTick = () => {
    if (globalThis.tournamentTickRunning) return;
    globalThis.tournamentTickRunning = true;
    void (async () => {
      try {
        const { runTournamentTick: tick } = await import("@/lib/tournamentLifecycle");
        await tick();
      } catch (error) {
        if (isTransientMongoStartupError(error)) {
          console.warn("Tournament lifecycle tick skipped: MongoDB primary is not ready yet.");
          return;
        }
        console.error("Tournament lifecycle tick failed", error);
        writeRuntimeLog({
          source: "instrumentation.tournamentTick",
          message: "Tournament lifecycle tick failed.",
          error,
          metadata: { automation: "tournament_lifecycle" },
        });
      } finally {
        globalThis.tournamentTickRunning = false;
      }
    })();
  };

  if (!globalThis.tournamentTickInterval) {
    globalThis.tournamentTickInterval = setInterval(runTournamentTick, TOURNAMENT_TICK_MS);
    globalThis.tournamentTickInterval.unref?.();
  }
}
