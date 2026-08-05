declare global {
  var askCoachReminderInterval: ReturnType<typeof setInterval> | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || globalThis.askCoachReminderInterval) return;

  const { processDueAskCoachEmailReminders } = await import("@/lib/askCoachEmailReminders");
  const run = () => {
    void processDueAskCoachEmailReminders().catch((error) => {
      console.error("Scheduled Ask Coach unread email processing failed", error);
    });
  };

  const startupTimer = setTimeout(run, 5_000);
  startupTimer.unref?.();

  globalThis.askCoachReminderInterval = setInterval(run, 60_000);
  globalThis.askCoachReminderInterval.unref?.();
}

