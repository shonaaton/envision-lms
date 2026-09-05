import { describe, expect, it } from "vitest";
import { createCoalescer, type CoalesceTimers } from "./coalesce";

/** A clock and timer queue under the test's control, so no test sleeps. */
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map<number, { at: number; fn: () => void }>();

  const timers: CoalesceTimers = {
    setTimeout: (fn, ms) => {
      const id = nextId++;
      scheduled.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (handle) => {
      scheduled.delete(handle as number);
    },
    now: () => now,
  };

  return {
    timers,
    advance(ms: number) {
      const target = now + ms;
      // Fire due timers in time order, allowing one to schedule another.
      for (;;) {
        const due = Array.from(scheduled.entries())
          .filter(([, entry]) => entry.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        scheduled.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
    scheduledCount: () => scheduled.size,
  };
}

describe("createCoalescer", () => {
  it("sends the first value immediately", () => {
    const sent: string[] = [];
    const clock = fakeTimers();
    const coalescer = createCoalescer(1000, (value: string) => sent.push(value), clock.timers);

    coalescer.push("a");
    expect(sent).toEqual(["a"]);
  });

  it("collapses a burst into a single follow-up send", () => {
    const sent: string[] = [];
    const clock = fakeTimers();
    const coalescer = createCoalescer(1000, (value: string) => sent.push(value), clock.timers);

    coalescer.push("a");
    coalescer.push("b");
    coalescer.push("c");
    coalescer.push("d");
    expect(sent).toEqual(["a"]);

    clock.advance(1000);
    expect(sent).toEqual(["a", "d"]);
  });

  it("always ends on the latest value, never a stale one", () => {
    const sent: number[] = [];
    const clock = fakeTimers();
    const coalescer = createCoalescer(1000, (value: number) => sent.push(value), clock.timers);

    for (let index = 1; index <= 20; index += 1) {
      coalescer.push(index);
      clock.advance(50);
    }
    clock.advance(2000);
    expect(sent[sent.length - 1]).toBe(20);
  });

  it("sends immediately again once the interval has passed quietly", () => {
    const sent: string[] = [];
    const clock = fakeTimers();
    const coalescer = createCoalescer(1000, (value: string) => sent.push(value), clock.timers);

    coalescer.push("a");
    clock.advance(3000);
    coalescer.push("b");
    expect(sent).toEqual(["a", "b"]);
  });

  it("does not send anything when nothing was pushed", () => {
    const sent: string[] = [];
    const clock = fakeTimers();
    createCoalescer(1000, (value: string) => sent.push(value), clock.timers);
    clock.advance(5000);
    expect(sent).toEqual([]);
  });

  it("does not re-send the same value when the cooldown expires with nothing pending", () => {
    const sent: string[] = [];
    const clock = fakeTimers();
    const coalescer = createCoalescer(1000, (value: string) => sent.push(value), clock.timers);

    coalescer.push("a");
    clock.advance(5000);
    expect(sent).toEqual(["a"]);
    expect(coalescer.pending()).toBe(false);
  });

  it("bounds sends over a long run of rapid updates", () => {
    const sent: number[] = [];
    const clock = fakeTimers();
    const coalescer = createCoalescer(1000, (value: number) => sent.push(value), clock.timers);

    // 100 updates across 10 seconds: at one per second plus the leading edge,
    // this must not turn into 100 broadcasts.
    for (let index = 0; index < 100; index += 1) {
      coalescer.push(index);
      clock.advance(100);
    }
    clock.advance(2000);
    expect(sent.length).toBeLessThanOrEqual(12);
    expect(sent[sent.length - 1]).toBe(99);
  });

  it("flushes a pending value on demand", () => {
    const sent: string[] = [];
    const clock = fakeTimers();
    const coalescer = createCoalescer(1000, (value: string) => sent.push(value), clock.timers);

    coalescer.push("a");
    coalescer.push("b");
    expect(coalescer.pending()).toBe(true);
    coalescer.flush();
    expect(sent).toEqual(["a", "b"]);
    expect(coalescer.pending()).toBe(false);
  });

  it("drops a pending value when cancelled", () => {
    const sent: string[] = [];
    const clock = fakeTimers();
    const coalescer = createCoalescer(1000, (value: string) => sent.push(value), clock.timers);

    coalescer.push("a");
    coalescer.push("b");
    coalescer.cancel();
    clock.advance(5000);
    expect(sent).toEqual(["a"]);
  });

  it("leaves no timer running once things go quiet", () => {
    const clock = fakeTimers();
    const coalescer = createCoalescer(1000, () => {}, clock.timers);
    coalescer.push("a");
    clock.advance(5000);
    expect(clock.scheduledCount()).toBe(0);
  });
});
