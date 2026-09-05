/**
 * Rate-coalescing for broadcasts.
 *
 * In a busy arena, boards finish continuously and each one changes the
 * standings. Sending every change to every client is wasteful, but dropping
 * changes leaves clients holding a stale table. Coalescing does both correctly:
 * the first change goes out immediately, changes during the cooldown collapse
 * into one, and the last value always wins.
 */

export type Coalescer<T> = {
  push: (value: T) => void;
  /** Send anything pending right now. */
  flush: () => void;
  cancel: () => void;
  pending: () => boolean;
};

export type CoalesceTimers = {
  setTimeout: (fn: () => void, ms: number) => any;
  clearTimeout: (handle: any) => void;
  now: () => number;
};

const defaultTimers: CoalesceTimers = {
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    (handle as any).unref?.();
    return handle;
  },
  clearTimeout: (handle) => clearTimeout(handle),
  now: () => Date.now(),
};

export function createCoalescer<T>(intervalMs: number, send: (value: T) => void, timers: CoalesceTimers = defaultTimers): Coalescer<T> {
  let lastSentAt = -Infinity;
  let pendingValue: T | null = null;
  let hasPending = false;
  let handle: any = null;

  const emit = (value: T) => {
    lastSentAt = timers.now();
    pendingValue = null;
    hasPending = false;
    send(value);
  };

  const onTimer = () => {
    handle = null;
    if (hasPending) emit(pendingValue as T);
  };

  return {
    push(value: T) {
      const elapsed = timers.now() - lastSentAt;
      if (elapsed >= intervalMs && !handle) {
        emit(value);
        // Hold the floor open so a burst right after this one still coalesces.
        handle = timers.setTimeout(onTimer, intervalMs);
        return;
      }
      pendingValue = value;
      hasPending = true;
      if (!handle) handle = timers.setTimeout(onTimer, Math.max(0, intervalMs - elapsed));
    },
    flush() {
      if (handle) {
        timers.clearTimeout(handle);
        handle = null;
      }
      if (hasPending) emit(pendingValue as T);
    },
    cancel() {
      if (handle) {
        timers.clearTimeout(handle);
        handle = null;
      }
      pendingValue = null;
      hasPending = false;
    },
    pending() {
      return hasPending;
    },
  };
}
