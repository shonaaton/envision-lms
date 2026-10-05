/**
 * Which students look like they are about to leave, and why.
 *
 * Pure: the sweep (retentionSweep.ts) reads the database into one
 * `RiskSnapshot` per student and this file decides. Families mostly leave at
 * two moments - when a fee renewal comes round and when a pause ends - so a
 * warning sign that shows up inside one of those windows counts for more: the
 * call has to happen before the bill or the restart date, not after.
 *
 * Severity:
 *   moderate - one on its own is only worth watching
 *   strong   - worth a call on its own
 *   window   - context, not a problem: a renewal or a return from a pause is near
 */

const DAY = 86_400_000;

/** Statuses that mean the student missed a class that did happen. */
export const MISSED_STATUSES = ["absent", "student_no_show", "not_joined"];
/** Statuses that mean the student was in the class. */
export const ATTENDED_STATUSES = ["present", "late"];

export const RISK_THRESHOLDS = {
  missedStreakModerate: 2,
  missedStreakStrong: 3,
  noClassDaysModerate: 14,
  noClassDaysStrong: 21,
  attendanceWindowDays: 28,
  attendanceRateMin: 0.6,
  attendanceRateMinClasses: 4,
  homeworkMissedInARow: 3,
  practiceQuietDays: 21,
  lowEffort: 2,
  coachChangeDays: 30,
  lowCredits: 2,
  invoiceDueDays: 7,
  pauseEndingDays: 10,
  pauseOverdueDays: 3,
  longPauseDays: 60,
  repeatPauseDays: 180,
} as const;

export type RiskLevel = "none" | "watch" | "at_risk" | "high";
export type RiskSeverity = "moderate" | "strong" | "window";

export type RiskReason = {
  code: string;
  severity: RiskSeverity;
  label: string;
  detail: string;
  /** Safe to show the coach: about the class, never about money or the family's plans. */
  coachSafe: boolean;
};

export type RiskSnapshot = {
  now: Date;
  isActive: boolean;
  /** When the student started classes - conversion date, or account creation. */
  joinedAt?: Date | null;
  /** Their marked classes in roughly the last 90 days. Order does not matter. */
  attendance: Array<{ date: Date; status: string }>;
  /** The last class they attended, looking back as far as the sweep reads. */
  lastAttendedAt?: Date | null;
  /** Homework already past its due date, most recent first or in any order. */
  homework: Array<{ dueAt: Date; submitted: boolean }>;
  /** Last Learn Chess / tactics activity, if any in the window the sweep reads. */
  lastPracticeAt?: Date | null;
  /** `effort` (1-5) on the latest monthly report the coach has written. */
  latestEffort?: number | null;
  /** When a permanent coach change last happened in one of their classrooms. */
  coachChangedAt?: Date | null;
  fees: {
    planType?: "monthly" | "credits" | null;
    creditBalance?: number | null;
    /** Earliest unpaid invoice due date (may be in the past). */
    nextInvoiceDueAt?: Date | null;
  };
  pause?: { pausedFrom: Date; pausedUntil: Date } | null;
  /** Pauses that started within the repeat window, the current one included. */
  recentPauseCount: number;
};

export type RiskResult = { level: RiskLevel; reasons: RiskReason[]; inWindow: boolean };

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY);
}

function shortDate(value: Date) {
  return value.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** Missed classes in a row, counting back from the most recent one. Excused and coach-side outcomes are skipped, not counted. */
export function missedStreak(attendance: RiskSnapshot["attendance"]) {
  const ordered = attendance
    .filter((row) => MISSED_STATUSES.includes(row.status) || ATTENDED_STATUSES.includes(row.status))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  let streak = 0;
  for (const row of ordered) {
    if (!MISSED_STATUSES.includes(row.status)) break;
    streak += 1;
  }
  return streak;
}

/** Homework missed in a row, counting back from the most recently due. */
export function homeworkMissedStreak(homework: RiskSnapshot["homework"]) {
  const ordered = [...homework].sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime());
  let streak = 0;
  for (const row of ordered) {
    if (row.submitted) break;
    streak += 1;
  }
  return streak;
}

function attendanceReasons(snapshot: RiskSnapshot): RiskReason[] {
  const t = RISK_THRESHOLDS;
  const streak = missedStreak(snapshot.attendance);
  // One attendance problem is one reason: the streak, the gap since the last
  // class and a low rate usually describe the same missed weeks, and counting
  // all three would turn two absences into a "high" on their own.
  if (streak >= t.missedStreakModerate) {
    return [{
      code: "missed_streak",
      severity: streak >= t.missedStreakStrong ? "strong" : "moderate",
      label: `Missed ${streak} classes in a row`,
      detail: `The last ${streak} marked classes were missed.`,
      coachSafe: true,
    }];
  }

  const since = snapshot.lastAttendedAt || snapshot.joinedAt || null;
  if (since) {
    const days = daysBetween(since, snapshot.now);
    if (days >= t.noClassDaysModerate) {
      return [{
        code: "no_class",
        severity: days >= t.noClassDaysStrong ? "strong" : "moderate",
        label: `No class attended in ${days} days`,
        detail: snapshot.lastAttendedAt ? `Last attended on ${shortDate(snapshot.lastAttendedAt)}.` : "Has not attended a class since joining.",
        coachSafe: true,
      }];
    }
  }

  const windowStart = snapshot.now.getTime() - t.attendanceWindowDays * DAY;
  const recent = snapshot.attendance.filter((row) => row.date.getTime() >= windowStart);
  const attended = recent.filter((row) => ATTENDED_STATUSES.includes(row.status)).length;
  const missed = recent.filter((row) => MISSED_STATUSES.includes(row.status)).length;
  const counted = attended + missed;
  if (counted >= t.attendanceRateMinClasses && attended / counted < t.attendanceRateMin) {
    return [{
      code: "low_attendance",
      severity: "moderate",
      label: `Attended ${attended} of ${counted} classes in 4 weeks`,
      detail: `${Math.round((attended / counted) * 100)}% attendance over the last four weeks.`,
      coachSafe: true,
    }];
  }
  return [];
}

function engagementReasons(snapshot: RiskSnapshot): RiskReason[] {
  const t = RISK_THRESHOLDS;
  const reasons: RiskReason[] = [];
  const homeworkStreak = homeworkMissedStreak(snapshot.homework);
  if (homeworkStreak >= t.homeworkMissedInARow) {
    reasons.push({
      code: "homework_missed",
      severity: "moderate",
      label: `Last ${homeworkStreak} homework not done`,
      detail: `${homeworkStreak} assignments in a row passed their due date without a submission.`,
      coachSafe: true,
    });
  }
  // Only a student who used to practise can stop; one who never did is not a change.
  if (snapshot.lastPracticeAt) {
    const quiet = daysBetween(snapshot.lastPracticeAt, snapshot.now);
    if (quiet >= t.practiceQuietDays) {
      reasons.push({
        code: "practice_stopped",
        severity: "moderate",
        label: `Stopped practising (${quiet} days)`,
        detail: `No Learn Chess or tactics activity since ${shortDate(snapshot.lastPracticeAt)}.`,
        coachSafe: true,
      });
    }
  }
  if (typeof snapshot.latestEffort === "number" && snapshot.latestEffort > 0 && snapshot.latestEffort <= t.lowEffort) {
    reasons.push({
      code: "low_effort",
      severity: "moderate",
      label: `Effort rated ${snapshot.latestEffort}/5`,
      detail: "The coach rated effort low on the latest monthly report.",
      coachSafe: true,
    });
  }
  if (snapshot.coachChangedAt && daysBetween(snapshot.coachChangedAt, snapshot.now) <= t.coachChangeDays) {
    reasons.push({
      code: "coach_changed",
      severity: "moderate",
      label: "New coach this month",
      detail: `Their class changed coach on ${shortDate(snapshot.coachChangedAt)}.`,
      coachSafe: false,
    });
  }
  return reasons;
}

function renewalWindow(snapshot: RiskSnapshot): RiskReason[] {
  const t = RISK_THRESHOLDS;
  const { fees } = snapshot;
  if (fees.planType === "credits" && typeof fees.creditBalance === "number" && fees.creditBalance <= t.lowCredits) {
    return [{
      code: "renewal_credits",
      severity: "window",
      label: fees.creditBalance <= 0 ? "Credits used up" : `${fees.creditBalance} credit${fees.creditBalance === 1 ? "" : "s"} left`,
      detail: "A recharge decision is coming up.",
      coachSafe: false,
    }];
  }
  if (fees.nextInvoiceDueAt) {
    const days = daysBetween(snapshot.now, fees.nextInvoiceDueAt);
    if (days <= t.invoiceDueDays) {
      return [{
        code: "renewal_invoice",
        severity: "window",
        label: days < 0 ? `Fee overdue by ${-days} day${days === -1 ? "" : "s"}` : `Fee due ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}`,
        detail: `Invoice due on ${shortDate(fees.nextInvoiceDueAt)}.`,
        coachSafe: false,
      }];
    }
  }
  return [];
}

function pauseReasons(snapshot: RiskSnapshot): RiskReason[] {
  const t = RISK_THRESHOLDS;
  const reasons: RiskReason[] = [];
  const pause = snapshot.pause;
  if (pause) {
    const untilDays = daysBetween(snapshot.now, pause.pausedUntil);
    if (untilDays <= -t.pauseOverdueDays) {
      reasons.push({
        code: "pause_overdue",
        severity: "strong",
        label: `Pause ended ${-untilDays} days ago, not back`,
        detail: `The pause ran until ${shortDate(pause.pausedUntil)} and the student has not been reinstated.`,
        coachSafe: false,
      });
    } else if (untilDays <= t.pauseEndingDays) {
      reasons.push({
        code: "pause_ending",
        severity: "window",
        label: untilDays < 0 ? "Pause just ended" : `Pause ends in ${untilDays} day${untilDays === 1 ? "" : "s"}`,
        detail: `Due back after ${shortDate(pause.pausedUntil)}.`,
        coachSafe: false,
      });
    }
    const length = daysBetween(pause.pausedFrom, snapshot.now);
    if (length >= t.longPauseDays) {
      reasons.push({
        code: "long_pause",
        severity: "moderate",
        label: `Paused for ${length} days`,
        detail: `Out of class since ${shortDate(pause.pausedFrom)}.`,
        coachSafe: false,
      });
    }
  }
  if (snapshot.recentPauseCount >= 2) {
    reasons.push({
      code: "repeat_pause",
      severity: "moderate",
      label: `${snapshot.recentPauseCount} pauses in 6 months`,
      detail: "Pausing again soon after the last break.",
      coachSafe: false,
    });
  }
  return reasons;
}

export function levelFor(reasons: RiskReason[]): RiskLevel {
  const strong = reasons.filter((reason) => reason.severity === "strong").length;
  const moderate = reasons.filter((reason) => reason.severity === "moderate").length;
  const inWindow = reasons.some((reason) => reason.severity === "window");
  if (strong >= 2 || (strong >= 1 && (moderate >= 1 || inWindow))) return "high";
  if (strong >= 1 || moderate >= 2 || (moderate >= 1 && inWindow)) return "at_risk";
  if (moderate >= 1) return "watch";
  return "none";
}

export function assessRisk(snapshot: RiskSnapshot): RiskResult {
  // Left beats paused beats active: a student who has gone is reported as
  // left, never as at risk.
  if (!snapshot.isActive) return { level: "none", reasons: [], inWindow: false };
  const reasons = snapshot.pause
    // Out of class on purpose - attendance and homework say nothing while paused.
    ? pauseReasons(snapshot)
    : [...attendanceReasons(snapshot), ...engagementReasons(snapshot), ...renewalWindow(snapshot), ...pauseReasons(snapshot)];
  const level = levelFor(reasons);
  // A window alone is not a problem; drop it so "none" carries no reasons.
  const shown = level === "none" ? [] : reasons;
  return { level, reasons: shown, inWindow: shown.some((reason) => reason.severity === "window") };
}

export const LEVEL_RANK: Record<RiskLevel, number> = { none: 0, watch: 1, at_risk: 2, high: 3 };

/** Levels that put a "call this family" task in front of the admins. */
export function needsCall(level: RiskLevel) {
  return LEVEL_RANK[level] >= LEVEL_RANK.at_risk;
}

export function levelLabel(level: RiskLevel) {
  return level === "high" ? "High risk" : level === "at_risk" ? "At risk" : level === "watch" ? "Watch" : "No risk";
}

/** The coach's heads-up: class-side reasons only, never fees or the family's plans. */
export function coachHeadsUp(studentName: string, reasons: RiskReason[]) {
  const safe = reasons.filter((reason) => reason.coachSafe);
  if (!safe.length) return null;
  const first = studentName.split(/\s+/)[0] || studentName;
  return {
    title: `${first} may be drifting away`,
    message: `${safe.map((reason) => reason.label).join(" · ")}. A warm word or a quick check-in at the next class helps. The academy team is also calling the family.`,
  };
}
