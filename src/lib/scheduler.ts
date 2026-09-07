import { notifyFailure } from "@/lib/failureNotifications";
import { writeRuntimeLog } from "@/lib/runtimeLogger";

/**
 * The in-process job runner.
 *
 * Each background job used to carry its own copy of the same scaffolding: a
 * global interval handle, a bespoke catch block, a transient-Mongo check, a
 * runtime log line and a failure notification. Adding a job meant copying about
 * twenty lines and remembering every piece. Jobs are now declared in one table
 * and all of that happens once, here.
 *
 * Every job must be idempotent. They run alongside whatever platform cron calls
 * the HTTP endpoints, and a job that overruns its interval is skipped rather
 * than run concurrently with itself.
 */

export type ScheduledJob = {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
  /** Skip the shared startup delay — used by the tournament heartbeat. */
  runImmediately?: boolean;
  /** Suppress the admin failure alert; still logged. Noisy or low-stakes jobs. */
  silentFailure?: boolean;
};

declare global {
  var lmsSchedulerHandles: Array<ReturnType<typeof setInterval>> | undefined;
  var lmsSchedulerRunning: Set<string> | undefined;
  var lmsSchedulerStartupTimer: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Give MongoDB time to elect a primary before the first sweep. Without this
 * every job fails once on a cold boot and pages an admin about it.
 */
const STARTUP_DELAY_MS = 30_000;

/**
 * A cold start races the replica set. These are expected for a few seconds
 * after boot and must not reach the failure alerts.
 */
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

function runJob(job: ScheduledJob) {
  const running = (globalThis.lmsSchedulerRunning ||= new Set());
  if (running.has(job.name)) return;
  running.add(job.name);

  void (async () => {
    try {
      await job.run();
    } catch (error) {
      if (isTransientMongoStartupError(error)) {
        console.warn(`Scheduled job "${job.name}" skipped: MongoDB primary is not ready yet.`);
        return;
      }
      console.error(`Scheduled job "${job.name}" failed`, error);
      writeRuntimeLog({
        source: `scheduler.${job.name}`,
        message: `Scheduled job "${job.name}" failed.`,
        error,
        metadata: { automation: job.name },
      });
      if (!job.silentFailure) {
        void notifyFailure({
          title: `Scheduled job "${job.name}" failed`,
          error,
          metadata: { automation: job.name },
        });
      }
    } finally {
      running.delete(job.name);
    }
  })();
}

export function startScheduler(jobs: ScheduledJob[]) {
  if (globalThis.lmsSchedulerHandles?.length) return;

  const handles: Array<ReturnType<typeof setInterval>> = [];
  const delayed = jobs.filter((job) => !job.runImmediately);

  for (const job of jobs) {
    const handle = setInterval(() => runJob(job), job.intervalMs);
    handle.unref?.();
    handles.push(handle);
    if (job.runImmediately) runJob(job);
  }

  if (delayed.length && !globalThis.lmsSchedulerStartupTimer) {
    globalThis.lmsSchedulerStartupTimer = setTimeout(() => {
      for (const job of delayed) runJob(job);
    }, STARTUP_DELAY_MS);
    globalThis.lmsSchedulerStartupTimer.unref?.();
  }

  globalThis.lmsSchedulerHandles = handles;
}
