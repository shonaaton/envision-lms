declare global {
  var askCoachReminderInterval: ReturnType<typeof setInterval> | undefined;
  var homeworkReminderInterval: ReturnType<typeof setInterval> | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || (globalThis.askCoachReminderInterval && globalThis.homeworkReminderInterval)) return;

  const { processDueAskCoachEmailReminders } = await import("@/lib/askCoachEmailReminders");
  const { processDueHomeworkEmailReminders } = await import("@/lib/homeworkEmailReminders");
  const run = () => {
    void processDueAskCoachEmailReminders().catch((error) => {
      console.error("Scheduled Ask Coach unread email processing failed", error);
    });
    void processDueHomeworkEmailReminders().catch((error) => {
      console.error("Scheduled homework email reminder processing failed", error);
    });
  };

  const startupTimer = setTimeout(run, 5_000);
  startupTimer.unref?.();

  if (!globalThis.askCoachReminderInterval) {
    globalThis.askCoachReminderInterval = setInterval(run, 60_000);
    globalThis.askCoachReminderInterval.unref?.();
  }
  if (!globalThis.homeworkReminderInterval) {
    globalThis.homeworkReminderInterval = setInterval(run, 60_000);
    globalThis.homeworkReminderInterval.unref?.();
  }
}
