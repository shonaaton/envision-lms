/**
 * Time control resolution.
 *
 * Historical tournaments store whole minutes in `timeControlMinutes`. New
 * tournaments store `initialClockSeconds`, which can express sub-minute
 * controls. Everything reads through `resolveTimeControl` so both shapes keep
 * working and no historical event changes behaviour.
 */

export type TimeControl = {
  initialSeconds: number;
  incrementSeconds: number;
};

export type TimeControlSource = {
  initialClockSeconds?: number | null;
  timeControlMinutes?: number | null;
  incrementSeconds?: number | null;
};

export const TIME_CONTROL_PRESETS: Array<{ label: string; initialSeconds: number; incrementSeconds: number }> = [
  { label: "1+0", initialSeconds: 60, incrementSeconds: 0 },
  { label: "1+1", initialSeconds: 60, incrementSeconds: 1 },
  { label: "2+1", initialSeconds: 120, incrementSeconds: 1 },
  { label: "3+0", initialSeconds: 180, incrementSeconds: 0 },
  { label: "3+2", initialSeconds: 180, incrementSeconds: 2 },
  { label: "5+0", initialSeconds: 300, incrementSeconds: 0 },
  { label: "5+3", initialSeconds: 300, incrementSeconds: 3 },
  { label: "10+0", initialSeconds: 600, incrementSeconds: 0 },
  { label: "10+5", initialSeconds: 600, incrementSeconds: 5 },
  { label: "15+10", initialSeconds: 900, incrementSeconds: 10 },
];

export function resolveTimeControl(source: TimeControlSource): TimeControl {
  const explicit = Number(source?.initialClockSeconds || 0);
  const legacyMinutes = Number(source?.timeControlMinutes || 0);
  const initialSeconds = explicit > 0 ? explicit : Math.max(0, legacyMinutes) * 60;
  return {
    initialSeconds: Math.max(0, Math.round(initialSeconds)),
    incrementSeconds: Math.max(0, Math.round(Number(source?.incrementSeconds || 0))),
  };
}

export function timeControlToMs(control: TimeControl) {
  return { initialMs: control.initialSeconds * 1000, incrementMs: control.incrementSeconds * 1000 };
}

export function formatTimeControl(control: TimeControl) {
  const { initialSeconds, incrementSeconds } = control;
  if (initialSeconds > 0 && initialSeconds % 60 === 0) return `${initialSeconds / 60}+${incrementSeconds}`;
  return `${initialSeconds}s+${incrementSeconds}`;
}

/**
 * Berserk clock penalty, following Lichess: the clock is halved, unless the
 * base time is small relative to the increment, in which case only the
 * increment is forfeited. Increment is always removed.
 */
export function berserkClock(control: TimeControl) {
  const noTimePenalty = control.initialSeconds < control.incrementSeconds * 60;
  const initialSeconds = noTimePenalty ? control.initialSeconds : Math.floor(control.initialSeconds / 2);
  return { initialSeconds, incrementSeconds: 0 };
}

/** Berserk is only allowed when it actually costs the player something. */
export function canBerserkTimeControl(control: TimeControl) {
  return control.initialSeconds > 0;
}
