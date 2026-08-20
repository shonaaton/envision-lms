declare global {
  var askCoachReminderInterval: ReturnType<typeof setInterval> | undefined;
  var homeworkReminderInterval: ReturnType<typeof setInterval> | undefined;
  var reminderStartupTimer: ReturnType<typeof setTimeout> | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || (globalThis.askCoachReminderInterval && globalThis.homeworkReminderInterval)) return;

  const { processDueAskCoachEmailReminders } = await import("@/lib/askCoachEmailReminders");
  const { processDueHomeworkEmailReminders } = await import("@/lib/homeworkEmailReminders");
  const { notifyFailure } = await import("@/lib/failureNotifications");
  const runAskCoach = () => {
    void processDueAskCoachEmailReminders().catch((error) => {
      console.error("Scheduled Ask Coach unread email processing failed", error);
      void notifyFailure({ title: "Scheduled Ask Coach unread email processing failed", error, metadata: { automation: "ask_coach_email_reminders" } });
    });
  };
  const runHomework = () => {
    void processDueHomeworkEmailReminders().catch((error) => {
      console.error("Scheduled homework email reminder processing failed", error);
      void notifyFailure({ title: "Scheduled homework email reminder processing failed", error, metadata: { automation: "homework_email_reminders" } });
    });
  };
  const runStartup = () => {
    runAskCoach();
    runHomework();
  };

  if (!globalThis.reminderStartupTimer) {
    globalThis.reminderStartupTimer = setTimeout(runStartup, 5_000);
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
