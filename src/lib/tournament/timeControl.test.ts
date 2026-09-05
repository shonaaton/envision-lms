import { describe, expect, it } from "vitest";
import { berserkClock, formatTimeControl, resolveTimeControl, TIME_CONTROL_PRESETS, timeControlToMs } from "./timeControl";

describe("resolveTimeControl", () => {
  it("reads the new seconds field when present", () => {
    expect(resolveTimeControl({ initialClockSeconds: 90, incrementSeconds: 2 })).toEqual({
      initialSeconds: 90,
      incrementSeconds: 2,
    });
  });

  it("falls back to legacy whole minutes so historical tournaments keep working", () => {
    expect(resolveTimeControl({ timeControlMinutes: 10, incrementSeconds: 5 })).toEqual({
      initialSeconds: 600,
      incrementSeconds: 5,
    });
  });

  it("prefers the seconds field when a tournament carries both", () => {
    expect(resolveTimeControl({ initialClockSeconds: 30, timeControlMinutes: 10 }).initialSeconds).toBe(30);
  });

  it("supports sub-minute controls the legacy field could not express", () => {
    expect(resolveTimeControl({ initialClockSeconds: 30, incrementSeconds: 0 }).initialSeconds).toBe(30);
  });

  it("never returns a negative clock", () => {
    expect(resolveTimeControl({ timeControlMinutes: -5, incrementSeconds: -2 })).toEqual({
      initialSeconds: 0,
      incrementSeconds: 0,
    });
  });

  it("converts to milliseconds for storage", () => {
    expect(timeControlToMs({ initialSeconds: 180, incrementSeconds: 2 })).toEqual({ initialMs: 180000, incrementMs: 2000 });
  });
});

describe("formatTimeControl", () => {
  it("uses minutes for whole-minute controls", () => {
    expect(formatTimeControl({ initialSeconds: 180, incrementSeconds: 2 })).toBe("3+2");
  });

  it("uses seconds for sub-minute controls", () => {
    expect(formatTimeControl({ initialSeconds: 30, incrementSeconds: 0 })).toBe("30s+0");
  });
});

describe("presets", () => {
  it("covers the standard ladder", () => {
    expect(TIME_CONTROL_PRESETS.map((preset) => preset.label)).toEqual([
      "1+0",
      "1+1",
      "2+1",
      "3+0",
      "3+2",
      "5+0",
      "5+3",
      "10+0",
      "10+5",
      "15+10",
    ]);
  });

  it("labels every preset consistently with its own values", () => {
    for (const preset of TIME_CONTROL_PRESETS) {
      expect(formatTimeControl(preset)).toBe(preset.label);
    }
  });
});

describe("berserkClock", () => {
  it("halves the clock and removes the increment", () => {
    expect(berserkClock({ initialSeconds: 300, incrementSeconds: 3 })).toEqual({ initialSeconds: 150, incrementSeconds: 0 });
  });

  it("removes only the increment when the base time is small relative to it", () => {
    expect(berserkClock({ initialSeconds: 30, incrementSeconds: 2 })).toEqual({ initialSeconds: 30, incrementSeconds: 0 });
  });

  it("still halves 1+1, where the base time exactly matches the threshold", () => {
    expect(berserkClock({ initialSeconds: 60, incrementSeconds: 1 })).toEqual({ initialSeconds: 30, incrementSeconds: 0 });
  });

  it("halves an incrementless control", () => {
    expect(berserkClock({ initialSeconds: 180, incrementSeconds: 0 })).toEqual({ initialSeconds: 90, incrementSeconds: 0 });
  });
});
