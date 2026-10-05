/**
 * Why a family left or paused. A fixed list so the retention page can count
 * them; the free-text note beside it carries the detail.
 *
 * Keys are stored on `User.exitReason.category` and
 * `StudentPause.reasonCategory`. Add keys freely, but never rename one - the
 * old records would stop matching their label.
 */
export const EXIT_REASONS = [
  { key: "fees", label: "Fees / cost" },
  { key: "timing", label: "Class timing" },
  { key: "studies", label: "Exams / studies" },
  { key: "lost_interest", label: "Lost interest" },
  { key: "coach_concern", label: "Coach / teaching concern" },
  { key: "other_academy", label: "Joined another academy" },
  { key: "health_family", label: "Health / family" },
  { key: "moved_travel", label: "Moved / travel" },
  { key: "tech_issues", label: "Online / tech issues" },
  { key: "other", label: "Other" },
] as const;

export type ExitReasonKey = (typeof EXIT_REASONS)[number]["key"];

export const PAUSE_REASONS = [
  { key: "exams", label: "Exams" },
  { key: "holiday_travel", label: "Holiday / travel" },
  { key: "medical", label: "Medical" },
  { key: "fees", label: "Fees" },
  { key: "schedule", label: "Schedule clash" },
  { key: "other", label: "Other" },
] as const;

export type PauseReasonKey = (typeof PAUSE_REASONS)[number]["key"];

export const EXIT_REASON_KEYS = EXIT_REASONS.map((reason) => reason.key) as ExitReasonKey[];
export const PAUSE_REASON_KEYS = PAUSE_REASONS.map((reason) => reason.key) as PauseReasonKey[];

export function isExitReason(value: unknown): value is ExitReasonKey {
  return typeof value === "string" && (EXIT_REASON_KEYS as string[]).includes(value);
}

export function isPauseReason(value: unknown): value is PauseReasonKey {
  return typeof value === "string" && (PAUSE_REASON_KEYS as string[]).includes(value);
}

export function exitReasonLabel(key: unknown) {
  return EXIT_REASONS.find((reason) => reason.key === key)?.label || "Not recorded";
}

export function pauseReasonLabel(key: unknown) {
  return PAUSE_REASONS.find((reason) => reason.key === key)?.label || "Not recorded";
}

/** Longest note kept with an exit or pause reason. */
export const REASON_NOTE_MAX = 500;
