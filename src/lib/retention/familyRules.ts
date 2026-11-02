/**
 * Rules for the Retention Center's family calls.
 *
 * Pure: familyCallService.ts reads the database and this file decides who is
 * a family, what the caller should bring up, who is due a call today, whether
 * a risk call is held back, what a call must record and what the family is sent.
 *
 * A family is everyone on one phone number (siblings share the parent's), so
 * one monthly call covers every child on it.
 */

import { z } from "zod";
import { academyDateKey } from "@/lib/academyTime";
import { canonicalPhone } from "@/lib/identityMatch";
import { ATTENDED_STATUSES, MISSED_STATUSES, RISK_THRESHOLDS, homeworkMissedStreak, type RiskLevel, type RiskSnapshot } from "@/lib/retention/riskRules";

const DAY = 86_400_000;

/** A family someone spoke to this recently is not handed out as a risk call again. */
export const CALL_QUIET_DAYS = 15;
/** After this many unanswered calls in a month the family drops to the bottom of the list. */
export const MONTHLY_MISSED_LIMIT = 3;

export const MISSED_OUTCOMES = ["no_answer", "busy", "switched_off"] as const;
export const CONNECTED_OUTCOME = "connected";

export const OUTCOME_LABELS: Record<string, string> = {
  connected: "Spoke to the family",
  callback_requested: "Asked us to call back",
  no_answer: "No answer",
  busy: "Busy / cut the call",
  switched_off: "Switched off / not reachable",
  wrong_number: "Wrong number",
};

export const KIND_LABELS: Record<string, string> = {
  monthly: "Monthly check-in",
  risk: "Risk call",
  callback: "Callback",
  renewal: "Renewal call",
  win_back: "Win-back call",
  other: "Other",
};

export const ACTION_LABELS: Record<string, string> = {
  timing_change: "Change class timing",
  batch_change: "Change batch",
  coach_concern: "Coach concern",
  fee_question: "Fee question",
  tech_issue: "Tech / portal issue",
  rejoin: "Wants to rejoin",
  other: "Other follow-up",
};

export function isMissedOutcome(outcome: string) {
  return (MISSED_OUTCOMES as readonly string[]).includes(outcome);
}

/** Academy (IST) month, "YYYY-MM". */
export function monthKeyOf(value: Date) {
  return academyDateKey(value).slice(0, 7);
}

/** `phone:<number>` for everyone sharing a phone, `student:<id>` when there is none. */
export function familyKeyOf(student: { _id?: unknown; phoneCanonical?: string | null; phone?: string | null; countryCode?: string | null }) {
  const phone = student.phoneCanonical || canonicalPhone(student.phone || undefined, student.countryCode || undefined);
  return phone ? `phone:${phone}` : `student:${String(student._id ?? "")}`;
}

/** True when the last call that connected is inside the quiet days. */
export function recentlyCalled(lastConnectedAt: Date | null | undefined, now: Date, days = CALL_QUIET_DAYS) {
  if (!lastConnectedAt) return false;
  return now.getTime() - new Date(lastConnectedAt).getTime() < days * DAY;
}

/** "Aarav", "Aarav and Riya", "Aarav, Riya and Kabir" - first names only. */
export function childNames(names: string[]) {
  const first = names.map((name) => String(name || "").trim().split(/\s+/)[0]).filter(Boolean);
  if (first.length <= 1) return first[0] || "your child";
  return `${first.slice(0, -1).join(", ")} and ${first[first.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Talking points: what the child is and is not doing
// ---------------------------------------------------------------------------

export type TalkingPoint = { code: string; label: string; tone: "gap" | "good" };

export type PointExtras = {
  /** Last time the student opened the portal (hourly stamp). */
  lastSeenAt?: Date | null;
  puzzlesLast30?: number;
  lessonsLast30?: number;
  /** An exam assigned and not yet taken. */
  pendingExam?: { label: string; availableUntil?: Date | null; started: boolean } | null;
};

function days(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY);
}

function shortDate(value: Date) {
  return value.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/**
 * Plain words the caller can say to the parent. Gaps come first; the good
 * news is there so the call is not only a list of complaints.
 */
export function talkingPoints(snapshot: RiskSnapshot, extras: PointExtras = {}): TalkingPoint[] {
  const points: TalkingPoint[] = [];
  const now = snapshot.now;
  const paused = Boolean(snapshot.pause);

  if (!paused) {
    const recent = snapshot.attendance.filter((row) => row.date.getTime() >= now.getTime() - RISK_THRESHOLDS.attendanceWindowDays * DAY);
    const attended = recent.filter((row) => ATTENDED_STATUSES.includes(row.status)).length;
    const missed = recent.filter((row) => MISSED_STATUSES.includes(row.status)).length;
    if (missed > 0) points.push({ code: "attendance", label: `Missed ${missed} of the last ${attended + missed} classes (4 weeks)`, tone: "gap" });
    else if (attended >= 2) points.push({ code: "attendance_good", label: `Attended all ${attended} classes in the last 4 weeks`, tone: "good" });

    const homework = snapshot.homework;
    const notDone = homework.filter((row) => !row.submitted).length;
    if (notDone > 0) {
      const streak = homeworkMissedStreak(homework);
      points.push({
        code: "homework",
        label: `Homework not submitted: ${notDone} of the last ${homework.length}${streak >= 2 ? ` (the last ${streak} in a row)` : ""}`,
        tone: "gap",
      });
    } else if (homework.length >= 2) {
      points.push({ code: "homework_good", label: `Submitted all ${homework.length} recent homework`, tone: "good" });
    }
  }

  const practiced = (extras.puzzlesLast30 || 0) + (extras.lessonsLast30 || 0);
  if (!snapshot.lastPracticeAt) {
    points.push({ code: "practice", label: "Not practising on the online portal (no puzzles or lessons in 3 months)", tone: "gap" });
  } else {
    const quiet = days(snapshot.lastPracticeAt, now);
    if (quiet >= 7) points.push({ code: "practice", label: `No practice on the online portal for ${quiet} days`, tone: "gap" });
    else if (practiced > 0) points.push({ code: "practice_good", label: `Practising online: ${extras.puzzlesLast30 || 0} puzzles and ${extras.lessonsLast30 || 0} lessons this month`, tone: "good" });
  }

  if (!extras.lastSeenAt) {
    points.push({ code: "portal", label: "Has not opened the student portal recently", tone: "gap" });
  } else if (days(extras.lastSeenAt, now) >= 14) {
    points.push({ code: "portal", label: `Has not opened the student portal for ${days(extras.lastSeenAt, now)} days`, tone: "gap" });
  }

  if (typeof snapshot.latestEffort === "number" && snapshot.latestEffort > 0 && snapshot.latestEffort <= RISK_THRESHOLDS.lowEffort) {
    points.push({ code: "effort", label: `Coach rated effort ${snapshot.latestEffort}/5 on the last monthly report`, tone: "gap" });
  }

  if (extras.pendingExam) {
    const until = extras.pendingExam.availableUntil ? ` (closes ${shortDate(extras.pendingExam.availableUntil)})` : "";
    points.push({
      code: "exam",
      label: extras.pendingExam.started ? `${extras.pendingExam.label} exam started but not submitted${until}` : `${extras.pendingExam.label} exam assigned, not taken yet${until}`,
      tone: "gap",
    });
  }

  if (snapshot.pause) {
    points.push({ code: "pause", label: `On a pause until ${shortDate(snapshot.pause.pausedUntil)}`, tone: "gap" });
  }

  return [...points.filter((point) => point.tone === "gap"), ...points.filter((point) => point.tone === "good")];
}

// ---------------------------------------------------------------------------
// Who is due a call
// ---------------------------------------------------------------------------

export type QueueInput = {
  /** Worst open flag across the children. */
  flagLevel: RiskLevel;
  renewalSoon: boolean;
  lastConnectedAt: Date | null;
  /** This academy month's calls, any order. */
  callsThisMonth: Array<{ at: Date; outcome: string }>;
  /** The latest callback asked for and not yet followed by a call that connected. */
  pendingCallbackAt: Date | null;
};

export type MonthState = "done" | "callback" | "missed" | "unreachable" | "not_called";

export type QueueState = {
  state: MonthState;
  missedThisMonth: number;
  lastAttemptAt: Date | null;
  dueToday: boolean;
  priority: number;
  /** Why it is on today's list, most important first. */
  why: string[];
};

/**
 * Callbacks first, then open high and at-risk flags nobody has spoken to
 * lately, then renewals, then whoever has waited longest. A family that did
 * not answer today comes back tomorrow; one that has missed three calls this
 * month sinks to the bottom.
 */
export function queueState(input: QueueInput, now: Date): QueueState {
  const calls = [...input.callsThisMonth].sort((a, b) => b.at.getTime() - a.at.getTime());
  const connected = calls.some((call) => call.outcome === CONNECTED_OUTCOME);
  const missedThisMonth = calls.filter((call) => isMissedOutcome(call.outcome)).length;
  const lastAttemptAt = calls[0]?.at || null;
  const today = academyDateKey(now);
  const triedToday = Boolean(lastAttemptAt && academyDateKey(lastAttemptAt) === today);
  const callbackDue = Boolean(input.pendingCallbackAt && academyDateKey(input.pendingCallbackAt) <= today);
  const quiet = recentlyCalled(input.lastConnectedAt, now);

  const state: MonthState = connected ? "done"
    : input.pendingCallbackAt ? "callback"
    : missedThisMonth >= MONTHLY_MISSED_LIMIT ? "unreachable"
    : missedThisMonth > 0 ? "missed"
    : "not_called";

  const why: string[] = [];
  let priority = 0;
  if (callbackDue) {
    priority = Math.max(priority, 100);
    why.push("Callback due");
  }
  if (!quiet && (input.flagLevel === "high" || input.flagLevel === "at_risk")) {
    priority = Math.max(priority, input.flagLevel === "high" ? 90 : 80);
    why.push(input.flagLevel === "high" ? "High risk" : "At risk");
  }
  if (!connected) {
    if (input.renewalSoon) {
      priority = Math.max(priority, 60);
      why.push("Renewal soon");
    }
    const waited = input.lastConnectedAt ? Math.min(60, days(input.lastConnectedAt, now)) : 60;
    priority = Math.max(priority, 30 + Math.round(waited / 3));
    why.push(input.lastConnectedAt ? `Last spoke ${days(input.lastConnectedAt, now)}d ago` : "Never called");
    if (missedThisMonth >= MONTHLY_MISSED_LIMIT) priority -= 25;
  }

  return {
    state,
    missedThisMonth,
    lastAttemptAt,
    // A family tried today waits for tomorrow, unless they asked for a callback today.
    dueToday: priority > 0 && (!triedToday || callbackDue),
    priority,
    why,
  };
}

/** Calendar days left in the academy month, today included. */
export function daysLeftInMonth(now: Date) {
  const [year, month, day] = academyDateKey(now).split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return last - day + 1;
}

export function dailyTarget(remaining: number, now: Date) {
  return remaining > 0 ? Math.ceil(remaining / daysLeftInMonth(now)) : 0;
}

// ---------------------------------------------------------------------------
// What a call records
// ---------------------------------------------------------------------------

const objectId = z.string().regex(/^[0-9a-f]{24}$/i);
const text = (max: number) => z.string().trim().max(max).optional().default("");

export const familyCallSchema = z.object({
  studentId: objectId,
  kind: z.enum(["monthly", "risk", "callback", "renewal", "win_back", "other"]).default("monthly"),
  outcome: z.enum(["connected", "callback_requested", "no_answer", "busy", "switched_off", "wrong_number"]),
  durationMinutes: z.coerce.number().int().min(0).max(180).optional(),
  satisfaction: z.coerce.number().int().min(1).max(5).optional(),
  leavingIntent: z.enum(["no", "maybe", "yes"]).optional(),
  answers: z.array(z.object({
    questionId: objectId,
    studentId: objectId.optional(),
    answer: z.string().trim().max(1000),
  })).max(100).default([]),
  extraQuestions: z.array(z.object({ question: z.string().trim().min(1).max(300), answer: z.string().trim().max(1000).default("") })).max(20).default([]),
  notes: text(4000),
  parentSummary: text(400),
  coachNote: text(1000),
  talkingPoints: z.array(z.object({ studentId: objectId, code: z.string().max(40), label: z.string().max(300), discussed: z.boolean().default(false) })).max(60).default([]),
  actionItems: z.array(z.object({
    type: z.enum(["timing_change", "batch_change", "coach_concern", "fee_question", "tech_issue", "rejoin", "other"]),
    note: z.string().trim().min(3, "Say what needs doing for each follow-up.").max(1000),
  })).max(10).default([]),
  callbackAt: z.coerce.date().optional().nullable(),
  sendMessage: z.boolean().default(true),
  settleFlag: z.object({ flagId: objectId, outcome: z.enum(["stayed", "paused", "left", "false_alarm"]), note: text(1000) }).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.outcome === "connected") {
    if (!value.satisfaction) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["satisfaction"], message: "Rate how happy the family is (1-5)." });
    if (!value.leavingIntent && value.kind !== "win_back") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["leavingIntent"], message: "Ask whether they plan to pause or stop." });
    if (!value.notes.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["notes"], message: "Write a few lines on what the family said." });
  }
  if (value.outcome === "callback_requested" && !value.callbackAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["callbackAt"], message: "Pick when to call back." });
  }
  if (value.settleFlag && value.outcome !== "connected") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["settleFlag"], message: "A flag can only be settled after speaking to the family." });
  }
});

export type FamilyCallInput = z.infer<typeof familyCallSchema>;

// ---------------------------------------------------------------------------
// What the family is sent
// ---------------------------------------------------------------------------

/** WhatsApp body parameters may not hold new lines, tabs or long runs of spaces. */
export function oneLine(value: string, max = 300) {
  const flat = String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export const DEFAULT_PARENT_SUMMARY = "We will keep you posted on progress.";

export function summaryMessage(input: { parentName: string; callerName: string; children: string; parentSummary: string; discussed: string[] }) {
  const summary = oneLine(input.parentSummary) || DEFAULT_PARENT_SUMMARY;
  const greeting = input.parentName || "there";
  const caller = input.callerName || "our team";
  return {
    whatsappParams: [greeting, caller, input.children, summary],
    subject: `Thank you for speaking with us about ${input.children}`,
    email: [
      `Hello ${greeting},`,
      `Thank you for speaking with ${caller} from Envision Chess Academy today about ${input.children}'s chess classes.`,
      input.discussed.length ? `What we talked about:\n${input.discussed.map((line) => `• ${line}`).join("\n")}` : "",
      `What we agreed: ${summary}`,
      "If anything else comes up, just reply to this email or message us on WhatsApp.",
      "Team Envision Chess Academy",
    ].filter(Boolean).join("\n\n"),
  };
}

export function missedMessage(input: { parentName: string; children: string }) {
  const greeting = input.parentName || "there";
  return {
    whatsappParams: [greeting, input.children],
    subject: "We tried to reach you - Envision Chess Academy",
    email: [
      `Hello ${greeting},`,
      `A representative from Envision Chess Academy tried to reach you today regarding ${input.children}'s chess classes.`,
      "We will try again soon. You can also reply to this email or message us on WhatsApp with a convenient time to call.",
      "Team Envision Chess Academy",
    ].join("\n\n"),
  };
}
