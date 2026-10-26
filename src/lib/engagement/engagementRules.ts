import { academyDateKey, academyTimeOfDay, formatAcademyDateTime } from "@/lib/academyTime";

/**
 * The weekly engagement WhatsApp: one message per student per week, either a
 * progress digest or a practice nudge. Pure - the job (weeklyEngagementJob.ts)
 * loads the numbers and this decides what, if anything, goes out.
 */

const DAY = 86_400_000;

export const DIGEST_TEMPLATE = "weekly_progress_digest";
export const NUDGE_TEMPLATE = "practice_nudge";
/** Days without any practice or portal visit before a nudge replaces the digest. */
export const NUDGE_AFTER_DAYS = 7;

/** IST hour on Sunday from which the week's messages go out. */
export function engagementSendHour() {
  const hour = Number(process.env.ENGAGEMENT_SEND_HOUR);
  return Number.isInteger(hour) && hour >= 0 && hour <= 21 ? hour : 18;
}
/** Sends stop at this hour; anything unsent (a template Meta has not approved) waits for next week. */
export const ENGAGEMENT_SEND_UNTIL_HOUR = 22;

export function engagementWhatsAppEnabled() {
  return String(process.env.ENGAGEMENT_WHATSAPP_ENABLED || "").toLowerCase() === "true";
}

function weekdayOfKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function shiftKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday, in academy time. */
export function academyWeekday(now: Date) {
  return weekdayOfKey(academyDateKey(now));
}

/** Academy date of the Monday that starts the week `now` falls in. */
export function engagementWeekKey(now: Date) {
  const today = academyDateKey(now);
  const weekday = weekdayOfKey(today); // 0 = Sunday
  return shiftKey(today, weekday === 0 ? -6 : 1 - weekday);
}

/** True on Sunday between the send hour and the cut-off, academy time. */
export function inSendWindow(now: Date) {
  if (weekdayOfKey(academyDateKey(now)) !== 0) return false;
  const hour = Number(academyTimeOfDay(now).split(":")[0]);
  return hour >= engagementSendHour() && hour < ENGAGEMENT_SEND_UNTIL_HOUR;
}

export type WeeklyAudience = {
  role?: string;
  accountStatus?: string;
  isActive?: boolean;
  isPaused?: boolean;
  optedOut?: boolean;
  phone?: string;
  /** In at least one running classroom right now. */
  inClass: boolean;
};

export type PendingTask = { kind: "homework" | "learn" | "tactics"; label: string; href: string; title?: string; dueAt?: Date | null };

export type WeeklySnapshot = {
  studentName: string;
  classesScheduled: number;
  classesAttended: number;
  homeworkSubmitted: number;
  puzzlesSolved: number;
  lessonsCompleted: number;
  xpEarned: number;
  nextClassAt: Date | null;
  /** Latest homework submission, puzzle, Learn Chess attempt or reward, any time. */
  lastActivityAt: Date | null;
  lastSeenAt: Date | null;
  joinedAt: Date | null;
  /** The one thing a nudge points to. */
  task: PendingTask;
};

export type WeeklyDecision =
  | { kind: "skip"; reason: string }
  | { kind: "digest"; templateName: string; bodyParameters: string[] }
  | { kind: "nudge"; templateName: string; bodyParameters: string[]; idleDays: number };

export function audienceSkipReason(audience: WeeklyAudience) {
  if (audience.role !== "student") return "not_student";
  if (audience.accountStatus === "demo") return "demo";
  if (audience.isActive === false) return "inactive";
  if (audience.isPaused) return "paused";
  if (audience.optedOut) return "opted_out";
  if (!String(audience.phone || "").replace(/[^\d]/g, "")) return "no_phone";
  if (!audience.inClass) return "not_in_class";
  return "";
}

export function idleDays(snapshot: Pick<WeeklySnapshot, "lastActivityAt" | "lastSeenAt" | "joinedAt">, now: Date) {
  const times = [snapshot.lastActivityAt, snapshot.lastSeenAt].filter(Boolean).map((value) => new Date(value as Date).getTime());
  const last = times.length ? Math.max(...times) : snapshot.joinedAt ? new Date(snapshot.joinedAt).getTime() : null;
  if (last === null) return NUDGE_AFTER_DAYS;
  return Math.max(0, Math.floor((now.getTime() - last) / DAY));
}

export function nextClassLabel(value: Date | null) {
  if (!value) return "to be scheduled";
  return formatAcademyDateTime(value, { weekday: "short", day: "numeric", month: "short", year: undefined });
}

export function hasAnythingToReport(snapshot: WeeklySnapshot) {
  return snapshot.classesScheduled > 0
    || snapshot.classesAttended > 0
    || snapshot.homeworkSubmitted > 0
    || snapshot.puzzlesSolved > 0
    || snapshot.lessonsCompleted > 0;
}

/**
 * Digest or nudge for one student this week.
 *
 * A nudge goes to a family whose child has not practised or opened the portal
 * for NUDGE_AFTER_DAYS, but never two weeks running: the week after a nudge
 * the family gets the digest instead (or nothing, if there is nothing to say),
 * so an idle student is not reminded every single Sunday.
 */
export function decideWeeklyMessage(input: {
  audience: WeeklyAudience;
  snapshot: WeeklySnapshot;
  now: Date;
  previousKind?: "digest" | "nudge" | null;
  portalUrl: string;
}): WeeklyDecision {
  const skip = audienceSkipReason(input.audience);
  if (skip) return { kind: "skip", reason: skip };
  const { snapshot, now, portalUrl } = input;
  const name = snapshot.studentName || "your child";
  const idle = idleDays(snapshot, now);
  if (idle >= NUDGE_AFTER_DAYS && input.previousKind !== "nudge") {
    return {
      kind: "nudge",
      templateName: NUDGE_TEMPLATE,
      idleDays: idle,
      bodyParameters: [name, String(idle), snapshot.task.label, portalLink(portalUrl, snapshot.task.href)],
    };
  }
  if (!hasAnythingToReport(snapshot)) return { kind: "skip", reason: "nothing_to_report" };
  return {
    kind: "digest",
    templateName: DIGEST_TEMPLATE,
    bodyParameters: [
      name,
      String(snapshot.classesAttended),
      String(snapshot.classesScheduled),
      String(snapshot.homeworkSubmitted),
      String(snapshot.puzzlesSolved + snapshot.lessonsCompleted),
      nextClassLabel(snapshot.nextClassAt),
      portalLink(portalUrl, "/dashboard"),
    ],
  };
}

export function portalLink(portalUrl: string, href: string) {
  return `${portalUrl.replace(/\/+$/, "")}${href.startsWith("/") ? href : `/${href}`}`;
}

/** The task a nudge names: pending homework first, then Learn Chess, then puzzles. */
export function pickTask(input: { pendingHomework?: { id: string; title: string; dueAt?: Date | null } | null; canLearnChess: boolean }): PendingTask {
  const homework = input.pendingHomework;
  if (homework) {
    return { kind: "homework", label: `the homework "${homework.title}"`, href: `/homework/${homework.id}`, title: homework.title, dueAt: homework.dueAt ?? null };
  }
  if (input.canLearnChess) return { kind: "learn", label: "the next Learn Chess lesson", href: "/learn" };
  return { kind: "tactics", label: "a few puzzles in the Tactics Trainer", href: "/play/tactics-trainer" };
}
