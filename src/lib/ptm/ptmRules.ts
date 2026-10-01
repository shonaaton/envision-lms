import { z } from "zod";
import { academyDateKey, academyDateTime, parseAcademyDateTimeLocal } from "@/lib/academyTime";
import { normalizeGoogleMeetUrl } from "@/lib/meetingUrl";

export const PTM_YEARLY_CREDITS = 12;
export const PTM_MIN_GAP_DAYS = 30;
export const PTM_JOIN_OPENS_MIN = 10;
export const PTM_JOIN_CLOSES_AFTER_MIN = 60;
export const PTM_LAUNCH = academyDateTime("2026-10-01");
export const PTM_STATUSES = ["requested", "approved", "scheduled", "completed", "rejected", "cancelled"] as const;
export const CREDIT_HOLDING_STATUSES = ["requested", "approved", "scheduled", "completed"];
export const OPEN_PTM_STATUSES = ["requested", "approved"];
export type PtmViewer = { id: string; role: "student" | "instructor" | "admin" | "sub-admin"; canCreate?: boolean; canApprove?: boolean; canEdit?: boolean };
export type PtmLike = { _id?: unknown; student?: unknown; coach?: unknown; status: string; ptmYear?: string; preferredAt?: Date | string; scheduledAt?: Date | string; durationMinutes?: number; feedback?: { submittedAt?: unknown }; [key: string]: any };
const ms = (value?: Date | string) => value ? new Date(value).getTime() : NaN;
const idOf = (value: any) => String(value?._id ?? value ?? "");

export function ptmYearOf(date: Date) {
  const [year, month] = academyDateKey(date).split("-").map(Number);
  const start = month >= 10 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

export function ptmCreditSummary(ptmsThisYear: PtmLike[], now = new Date()) {
  const holding = ptmsThisYear.filter(p => (!p.ptmYear || p.ptmYear === ptmYearOf(now)) && CREDIT_HOLDING_STATUSES.includes(p.status));
  const held = holding.filter(p => OPEN_PTM_STATUSES.includes(p.status)).length;
  const used = holding.length - held;
  return {
    total: PTM_YEARLY_CREDITS, used, held, remaining: Math.max(0, PTM_YEARLY_CREDITS - holding.length),
    nextEligibleAt: nextPtmEligibleAt(holding),
    openRequest: holding.find(p => OPEN_PTM_STATUSES.includes(p.status)) ? idOf(holding.find(p => OPEN_PTM_STATUSES.includes(p.status))!._id) || true : null,
  };
}

/** Also used with all years: a yearly reset does not waive the 30-day gap. */
export function nextPtmEligibleAt(ptms: PtmLike[]) {
  const dates = ptms.filter(p => CREDIT_HOLDING_STATUSES.includes(p.status)).map(p => ms(p.scheduledAt ?? p.preferredAt)).filter(Number.isFinite);
  return dates.length ? new Date(Math.max(...dates) + PTM_MIN_GAP_DAYS * 86400_000).toISOString() : null;
}

export function ptmEndAt(ptm: PtmLike) { return ms(ptm.scheduledAt) + (ptm.durationMinutes ?? 30) * 60_000; }
export function isJoinWindowOpen(ptm: PtmLike, now = new Date()) {
  return ["scheduled", "completed"].includes(ptm.status) && now.getTime() >= ms(ptm.scheduledAt) - PTM_JOIN_OPENS_MIN * 60_000 && now.getTime() <= ptmEndAt(ptm) + PTM_JOIN_CLOSES_AFTER_MIN * 60_000;
}
export function canGiveFeedback(ptm: PtmLike, now = new Date()) {
  return ["scheduled", "completed"].includes(ptm.status) && now.getTime() >= ptmEndAt(ptm) && !ptm.feedback?.submittedAt;
}

const date = z.union([z.string().min(1), z.date()]).transform(v => parseAcademyDateTimeLocal(v)).refine(v => Number.isFinite(v.getTime()), "Choose a valid date and time.");
const note = z.string().trim().max(2000).optional().default("");
export const requestPtmSchema = z.object({ coach: z.string().regex(/^[a-f0-9]{24}$/i, "Choose a coach."), preferredAt: date, preferredNote: note, reason: z.string().trim().min(10, "Please describe the topic in at least 10 characters.").max(2000) });
export const approvePtmSchema = z.object({ action: z.literal("approve") });
export const rejectPtmSchema = z.object({ action: z.literal("reject"), rejectionReason: z.string().trim().min(1, "Enter a rejection reason.").max(2000) });
export const schedulePtmSchema = z.object({ action: z.enum(["schedule", "reschedule"]), scheduledAt: date, durationMinutes: z.number().int().min(5).max(120).default(30), meetingUrl: z.string().transform(normalizeGoogleMeetUrl).refine(Boolean, "Enter a valid Google Meet room URL.") });
export const cancelPtmSchema = z.object({ action: z.literal("cancel"), cancelReason: z.string().trim().min(1, "Enter a cancellation reason.").max(2000) });
export const feedbackPtmSchema = z.object({ action: z.literal("feedback"), rating: z.number().int().min(1).max(5), preparedness: z.number().int().min(1).max(5), clarity: z.number().int().min(1).max(5), comments: note });
export const ptmActionSchema = z.union([approvePtmSchema, rejectPtmSchema, schedulePtmSchema, cancelPtmSchema, feedbackPtmSchema]);
export type PtmActionInput = z.infer<typeof ptmActionSchema>;

/** Explicit allowlist: populated documents and new private fields cannot leak. */
export function serializePtm(source: PtmLike, viewer: PtmViewer) {
  const p = typeof source.toObject === "function" ? source.toObject() : source;
  const staff = viewer.role === "admin" || viewer.role === "sub-admin";
  const result: Record<string, any> = { _id: idOf(p._id), student: idOf(p.student), coach: idOf(p.coach), classroom: idOf(p.classroom) };
  for (const key of ["studentName", "coachName", "ptmYear", "status", "preferredNote", "reason", "rejectionReason", "cancelReason", "durationMinutes"]) result[key] = p[key] ?? null;
  for (const key of ["preferredAt", "approvedAt", "rejectedAt", "cancelledAt", "scheduledAt", "createdAt", "updatedAt"]) result[key] = p[key] ? new Date(p[key]).toISOString() : null;
  result.hasMeeting = Boolean(p.meetingUrl);
  result.feedbackSubmitted = Boolean(p.feedback?.submittedAt);
  if (staff) {
    result.meetingUrl = p.meetingUrl || "";
    result.feedback = p.feedback?.submittedAt ? { rating: p.feedback.rating, preparedness: p.feedback.preparedness, clarity: p.feedback.clarity, comments: p.feedback.comments || "", submittedAt: new Date(p.feedback.submittedAt).toISOString() } : null;
    for (const key of ["approvedBy", "rejectedBy", "cancelledBy", "scheduledBy"]) result[key] = idOf(p[key]);
  }
  return result;
}
