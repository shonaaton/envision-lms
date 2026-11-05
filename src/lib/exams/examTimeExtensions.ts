export type ExamExtensionKind = "window" | "sitting";

/** Validate before changing any persisted time; an extension can only move it forward. */
export function examTimeExtension(input: {
  assignment: { status: string; startedAt?: unknown; availableUntil: Date | string; endsAt?: Date | string | null };
  kind: unknown;
  newDeadline: unknown;
  reason?: unknown;
  now: Date;
}) {
  const { assignment, now } = input;
  if (input.kind !== "window" && input.kind !== "sitting") throw new Error("Choose the exam deadline or the running timer.");
  const kind: ExamExtensionKind = input.kind;
  if (kind === "window" && (!["assigned", "expired"].includes(assignment.status) || assignment.startedAt)) {
    throw new Error("Only an exam that has not been started can have its start deadline extended.");
  }
  if (kind === "sitting" && assignment.status !== "in_progress") throw new Error("Only a running exam can receive extra time.");
  const previousDeadline = new Date(kind === "window" ? assignment.availableUntil : assignment.endsAt || "");
  if (!Number.isFinite(previousDeadline.getTime())) throw new Error("The exam has no valid deadline.");
  if (kind === "sitting" && previousDeadline <= now) throw new Error("This exam's timer has already ended. Assign a new exam if another attempt is needed.");
  // Require an explicit offset: a bare wall-clock time must never depend on the server timezone.
  if (typeof input.newDeadline !== "string" || !/(Z|[+-]\d{2}:\d{2})$/i.test(input.newDeadline)) throw new Error("Choose a valid new date and time.");
  const newDeadline = new Date(input.newDeadline);
  if (!Number.isFinite(newDeadline.getTime()) || newDeadline <= previousDeadline || newDeadline <= now) {
    throw new Error("The new time must be later than both the current deadline and now.");
  }
  const reason = String(input.reason || "").trim();
  if (reason.length > 300) throw new Error("Keep the reason within 300 characters.");
  return { kind, previousDeadline, newDeadline, reason };
}
