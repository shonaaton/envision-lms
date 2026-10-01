import { z } from "zod";
import { academyDateKey, academyDateTime, formatAcademyDateTime } from "@/lib/academyTime";
import { getSessionStart } from "@/lib/classroomSessions";

/**
 * Staff leave: coaches and sub-admins (never marketing staff) ask for a full or
 * half day off, an approver decides, and a coach's classes get a substitute.
 *
 * Credits are optional per person. An admin who never grants someone credits
 * leaves them unlimited; once granted, the balance is a running one (it never
 * resets) and an approval takes 1 for a full day, 0.5 for a half day.
 */

export const LEAVE_TYPES = ["full_day", "half_day"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const LEAVE_STATUSES = ["requested", "approved", "rejected", "cancelled", "expired"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export const OPEN_LEAVE_STATUSES = ["requested", "approved"];
export const LEAVE_CREDIT_ENTRY_TYPES = ["grant", "adjustment", "deduction", "refund", "limit_removed"] as const;

export const FULL_DAY_NOTICE_HOURS = 24;
export const DEFAULT_HALF_DAY_NOTICE_HOURS = 3;
export const MAX_HALF_DAY_CLASSES = 2;
/** How far ahead a leave may be asked for. */
export const MAX_LEAVE_DAYS_AHEAD = 180;
/** The access role whose sub-admins sit outside the leave system. */
export const MARKETING_ACCESS_ROLE_NAME_KEY = "marketing";
export const LEAVE_HREF = "/leave";

export type LeaveViewer = {
  id: string;
  name: string;
  role: "instructor" | "admin" | "sub-admin";
  canApply: boolean;
  isApprover: boolean;
  canManageCredits: boolean;
};

export type LeaveSessionLike = { classroom?: unknown; sessionId: string; title?: string; start: Date | string; end?: Date | string | null; studentCount?: number };

const idOf = (value: any) => String(value?._id ?? value ?? "");
const iso = (value: unknown) => (value ? new Date(value as any).toISOString() : null);

export function halfDayNoticeHours(raw: unknown = process.env.LEAVE_HALF_DAY_NOTICE_HOURS) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return DEFAULT_HALF_DAY_NOTICE_HOURS;
  const hours = Number(raw);
  return Number.isFinite(hours) && hours >= 0 ? hours : DEFAULT_HALF_DAY_NOTICE_HOURS;
}

export function creditCost(type: LeaveType) {
  return type === "full_day" ? 1 : 0.5;
}

export function isMarketingRoleName(roleName: unknown) {
  return String(roleName || "").trim().toLowerCase() === MARKETING_ACCESS_ROLE_NAME_KEY;
}

/** Coaches and sub-admins apply; admins approve instead, and marketing staff are outside the system. */
export function canApplyForLeave(role: unknown, accessRoleName?: unknown) {
  if (isMarketingRoleName(accessRoleName)) return false;
  return role === "instructor" || role === "sub-admin";
}

export function leaveTypeLabel(type: string) {
  return type === "full_day" ? "Full day" : "Half day";
}

export function formatCredits(value: number) {
  const rounded = Math.round(Number(value || 0) * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const start = academyDateTime(value, "00:00");
  return Number.isFinite(start.getTime()) && academyDateKey(start) === value;
}

/** The day as a readable label, e.g. "Sat, 4 Oct 2026". */
export function leaveDayLabel(dateKey: string) {
  return formatAcademyDateTime(academyDateTime(dateKey, "12:00"), { weekday: "short", hour: undefined, minute: undefined });
}

function timeLabel(value: Date | string) {
  return formatAcademyDateTime(value, { day: undefined, month: undefined, year: undefined });
}

/** "6:00 pm I2-100, 7:30 pm B1-20" - the classes a leave covers, for messages. */
export function describeLeaveSessions(sessions: LeaveSessionLike[]) {
  if (!sessions.length) return "No classes";
  return [...sessions]
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .map((session) => `${timeLabel(session.start)} ${session.title || "Class"}`)
    .join(", ");
}

/** When the leave begins: the first chosen class of a half day, otherwise the start of the day. */
export function leaveStartsAt(input: { type: LeaveType; dateKey: string; sessions: LeaveSessionLike[] }) {
  if (input.type === "half_day" && input.sessions.length) {
    return new Date(Math.min(...input.sessions.map((session) => new Date(session.start).getTime())));
  }
  return academyDateTime(input.dateKey, "00:00");
}

/**
 * Why a leave cannot be applied for now, or null when it can.
 *
 * - Full day: at least 24 hours before the day begins (IST midnight).
 * - Half day with classes: a few hours before the first chosen class.
 * - Half day without classes (a sub-admin, or a coach with none that day): today or later.
 */
export function noticeError(
  input: { type: LeaveType; dateKey: string; sessions: LeaveSessionLike[] },
  now = new Date(),
  halfDayHours = halfDayNoticeHours()
) {
  const todayKey = academyDateKey(now);
  if (input.dateKey < todayKey) return "Choose today or a later date.";
  if (input.type === "full_day") {
    const deadline = new Date(academyDateTime(input.dateKey, "00:00").getTime() - FULL_DAY_NOTICE_HOURS * 3600_000);
    if (now.getTime() > deadline.getTime()) {
      return `Full-day leave must be applied for at least ${FULL_DAY_NOTICE_HOURS} hours before the day starts (by ${formatAcademyDateTime(deadline)} IST).`;
    }
    return null;
  }
  if (!input.sessions.length) return null;
  const firstClass = leaveStartsAt(input);
  const deadline = new Date(firstClass.getTime() - halfDayHours * 3600_000);
  if (now.getTime() > deadline.getTime()) {
    return `Half-day leave must be applied for at least ${halfDayHours} hour${halfDayHours === 1 ? "" : "s"} before the first chosen class (by ${formatAcademyDateTime(deadline)} IST).`;
  }
  return null;
}

/** Credits not already promised to other pending requests. */
export function availableCredits(balance: number, pendingCosts: number[]) {
  const held = pendingCosts.reduce((sum, cost) => sum + Number(cost || 0), 0);
  return { held, available: Math.max(0, Number(balance || 0) - held) };
}

/** Null when the applicant may apply, else the reason. No account means no limit. */
export function creditCheckError(account: { balance: number } | null | undefined, pendingCosts: number[], cost: number) {
  if (!account) return null;
  const { held, available } = availableCredits(account.balance, pendingCosts);
  if (available + 1e-9 >= cost) return null;
  const heldNote = held > 0 ? ` (${formatCredits(held)} held by your pending requests)` : "";
  return `You have ${formatCredits(available)} leave credit${available === 1 ? "" : "s"} available${heldNote}, and this leave needs ${formatCredits(cost)}. Ask an admin for more credits.`;
}

/** Who teaches this class now: a substitute, the coach frozen by a hand-over, or the classroom's coach. */
export function effectiveCoachId(session: any, classroom: any) {
  return idOf(session?.substituteCoach || session?.assignedCoach || classroom?.coach || classroom?.instructor);
}

/**
 * A class on a leave no longer needs cover once someone else teaches it, or it
 * was cancelled, rescheduled away from the leave day, or removed.
 */
export function isSessionCovered(session: any, classroom: any, applicantId: string, dateKey: string) {
  if (!session || !classroom) return true;
  if (["cancelled", "rescheduled"].includes(String(session.status || ""))) return true;
  const start = getSessionStart(session);
  if (start && academyDateKey(start) !== dateKey) return true;
  return effectiveCoachId(session, classroom) !== String(applicantId);
}

const dateKeySchema = z.string().trim().refine(isValidDateKey, "Choose a valid date.");
export const applyLeaveSchema = z.object({
  type: z.enum(LEAVE_TYPES),
  date: dateKeySchema,
  sessionIds: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  reason: z.string().trim().min(5, "Please give a reason (at least 5 characters).").max(1000),
});
export const leaveActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string({ required_error: "Enter a reason for rejecting." }).trim().min(1, "Enter a reason for rejecting.").max(1000) }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(1000).optional().default("") }),
]);
const userIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, "Choose a staff member.");
export const leaveCreditActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("adjust"),
    userId: userIdSchema,
    amount: z.number().refine((value) => value !== 0 && Math.abs(value) <= 365 && Number.isInteger(value * 2), "Enter a non-zero amount in steps of 0.5."),
    note: z.string().trim().max(500).optional().default(""),
  }),
  z.object({ action: z.literal("remove_limit"), userId: userIdSchema, note: z.string().trim().max(500).optional().default("") }),
]);

export type LeaveCoverage = Record<string, { covered: boolean; substituteName?: string | null }>;

export function leaveSessionKey(classroomId: unknown, sessionId: unknown) {
  return `${idOf(classroomId)}:${String(sessionId || "")}`;
}

export type SerializedLeaveSession = {
  classroom: string;
  sessionId: string;
  title: string;
  start: string | null;
  end: string | null;
  studentCount: number;
  /** null when coverage was not worked out (past or undecided leave). */
  covered: boolean | null;
  substituteName: string | null;
};

/** Explicit allowlist: nothing else on the document leaves the server. */
export function serializeLeave(source: any, coverage?: LeaveCoverage) {
  const leave = typeof source?.toObject === "function" ? source.toObject() : source;
  return {
    _id: idOf(leave._id),
    applicant: idOf(leave.applicant),
    applicantName: leave.applicantName || "",
    applicantRole: leave.applicantRole,
    type: leave.type as LeaveType,
    dateKey: leave.dateKey as string,
    startsAt: iso(leave.startsAt),
    reason: leave.reason || "",
    status: leave.status as LeaveStatus,
    creditCost: Number(leave.creditCost || 0),
    creditCharged: Number(leave.creditCharged || 0),
    decidedByName: leave.decidedByName || "",
    decidedAt: iso(leave.decidedAt),
    rejectionReason: leave.rejectionReason || "",
    cancelReason: leave.cancelReason || "",
    cancelledAt: iso(leave.cancelledAt),
    coveredAt: iso(leave.coveredAt),
    createdAt: iso(leave.createdAt),
    sessions: (leave.sessions || []).map((session: any): SerializedLeaveSession => {
      const key = leaveSessionKey(session.classroom, session.sessionId);
      return {
        classroom: idOf(session.classroom),
        sessionId: String(session.sessionId),
        title: session.title || "Class",
        start: iso(session.start),
        end: iso(session.end),
        studentCount: Number(session.studentCount || 0),
        covered: coverage?.[key]?.covered ?? null,
        substituteName: coverage?.[key]?.substituteName ?? null,
      };
    }) as SerializedLeaveSession[],
  };
}
export type SerializedLeave = ReturnType<typeof serializeLeave>;
