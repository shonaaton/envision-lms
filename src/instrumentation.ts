declare global {
  var askCoachReminderInterval: ReturnType<typeof setInterval> | undefined;
  var homeworkReminderInterval: ReturnType<typeof setInterval> | undefined;
  var reminderStartupTimer: ReturnType<typeof setTimeout> | undefined;
}

const REMINDER_STARTUP_DELAY_MS = 30_000;

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
  const runAskCoach = () => {
    void processDueAskCoachEmailReminders().catch((error) => {
      if (isTransientMongoStartupError(error)) {
        console.warn("Scheduled Ask Coach unread email processing skipped: MongoDB primary is not ready yet.");
        return;
      }
      console.error("Scheduled Ask Coach unread email processing failed", error);
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
}
