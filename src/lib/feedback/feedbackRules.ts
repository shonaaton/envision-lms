/**
 * Pure rules for monthly feedback: input schemas, who may see what, and the
 * one serializer every response goes through. No database here, so the
 * privacy rules (a student never sees the internal note) are unit-tested.
 */

import { z } from "zod";
import {
  CUSTOM_CHIP_MAX,
  INTERNAL_NOTE_MAX,
  MAX_FOCUS_AREAS,
  MAX_HIGHLIGHTS,
  PARENT_NOTE_MAX,
  PARENT_NOTE_MIN,
  RATING_SCALE,
  questionSetFor,
  requiredRatingKeys,
} from "@/lib/feedback/feedbackQuestions";

export type FeedbackViewerRole = "student" | "instructor" | "admin" | "sub-admin";
export type FeedbackViewer = { id: string; role: FeedbackViewerRole | string; canApprove?: boolean; canEdit?: boolean };

export const COACH_EDITABLE_STATUSES = ["pending", "draft", "changes_requested"];
export const REVIEWABLE_STATUSES = ["submitted"];
/** What a student (and the family) may ever see. */
export const PARENT_VISIBLE_STATUSES = ["sent"];

export const SKIP_REASONS = [
  { value: "left", label: "Student has left" },
  { value: "paused", label: "Student is on a break" },
  { value: "no_classes", label: "No classes with me this month" },
  { value: "other", label: "Other" },
] as const;

const chip = z.string().trim().min(1).max(CUSTOM_CHIP_MAX);
const ratingValue = z.number().int().min(RATING_SCALE[0].value).max(RATING_SCALE[RATING_SCALE.length - 1].value);

export const feedbackContentSchema = z.object({
  ratings: z.record(ratingValue).default({}),
  highlights: z.array(chip).max(MAX_HIGHLIGHTS).default([]),
  focusAreas: z.array(chip).max(MAX_FOCUS_AREAS).default([]),
  parentNote: z.string().trim().max(PARENT_NOTE_MAX).default(""),
  internalNote: z.string().trim().max(INTERNAL_NOTE_MAX).default(""),
});
export type FeedbackContent = z.infer<typeof feedbackContentSchema>;

export const feedbackActionSchema = z.discriminatedUnion("action", [
  feedbackContentSchema.extend({ action: z.literal("save_draft") }),
  feedbackContentSchema.extend({ action: z.literal("submit") }),
  z.object({ action: z.literal("skip"), reason: z.enum(SKIP_REASONS.map((r) => r.value) as [string, ...string[]]), note: z.string().trim().max(200).default("") }),
  z.object({
    action: z.literal("approve"),
    parentNote: z.string().trim().min(PARENT_NOTE_MIN, `The note for parents needs at least ${PARENT_NOTE_MIN} characters.`).max(PARENT_NOTE_MAX).optional(),
  }),
  z.object({ action: z.literal("request_changes"), note: z.string().trim().min(3, "Tell the coach what to change.").max(500) }),
  z.object({ action: z.literal("resend") }),
  z.object({ action: z.literal("reopen") }),
]);
export type FeedbackActionInput = z.infer<typeof feedbackActionSchema>;

export const bulkApproveSchema = z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(200) });

export function isReviewer(viewer: FeedbackViewer) {
  return (viewer.role === "admin" || viewer.role === "sub-admin") && viewer.canApprove !== false;
}

/**
 * Keeps only rating keys that belong to the tier's question set, so a stale
 * client cannot write arbitrary keys into the map.
 */
export function cleanRatings(tier: unknown, ratings: Record<string, number>) {
  const allowed = new Set(requiredRatingKeys(tier));
  return Object.fromEntries(Object.entries(ratings || {}).filter(([key]) => allowed.has(key)));
}

/** The missing pieces that stop a form from being submitted; empty when complete. */
export function isParentNoteComplete(note: unknown) {
  return String(note || "").trim().length >= PARENT_NOTE_MIN;
}

export function missingForSubmit(tier: unknown, content: Pick<FeedbackContent, "ratings" | "parentNote">) {
  const set = questionSetFor(tier);
  const labels = new Map([...set.skills.map((s) => [s.key, s.label] as const), ["effort", "Effort & focus"] as const]);
  const missing = requiredRatingKeys(tier).filter((key) => !content.ratings?.[key]).map((key) => labels.get(key) || key);
  if (!isParentNoteComplete(content.parentNote)) missing.push("the note for parents");
  return missing;
}

function idOf(value: any) {
  if (!value) return "";
  return String(value._id ?? value);
}

function ratingsObject(ratings: any): Record<string, number> {
  if (!ratings) return {};
  if (ratings instanceof Map) return Object.fromEntries(ratings);
  return { ...ratings };
}

/** Whether this viewer may see this report at all. */
export function canViewFeedback(doc: any, viewer: FeedbackViewer) {
  if (viewer.role === "admin" || viewer.role === "sub-admin") return true;
  if (viewer.role === "instructor") return idOf(doc.coach) === viewer.id;
  if (viewer.role === "student") return idOf(doc.student) === viewer.id && PARENT_VISIBLE_STATUSES.includes(doc.status);
  return false;
}

/**
 * The only shape feedback leaves the server in. Staff get everything; a
 * student gets the parent view - no internal note, no review trail, no skip
 * reason, no email diagnostics.
 */
export function serializeFeedback(doc: any, viewer: FeedbackViewer) {
  if (!canViewFeedback(doc, viewer)) return null;
  const parentView = {
    id: idOf(doc),
    month: String(doc.month || ""),
    status: String(doc.status || "pending"),
    tier: String(doc.tier || "beginner"),
    questionSetVersion: Number(doc.questionSetVersion || 1),
    studentId: idOf(doc.student),
    coachId: idOf(doc.coach),
    classroomId: idOf(doc.classroom),
    studentName: String(doc.studentName || ""),
    coachName: String(doc.coachName || ""),
    courseName: String(doc.courseName || ""),
    levelName: String(doc.levelName || ""),
    stats: {
      classesScheduled: Number(doc.stats?.classesScheduled || 0),
      classesAttended: Number(doc.stats?.classesAttended || 0),
      topicsCovered: [...(doc.stats?.topicsCovered || [])].map(String),
    },
    ratings: ratingsObject(doc.ratings),
    highlights: [...(doc.highlights || [])].map(String),
    focusAreas: [...(doc.focusAreas || [])].map(String),
    parentNote: String(doc.parentNote || ""),
    sentAt: doc.sentAt ? new Date(doc.sentAt).toISOString() : null,
  };
  if (viewer.role === "student") return { ...parentView, internalNote: undefined };
  return {
    ...parentView,
    internalNote: String(doc.internalNote || ""),
    skipReason: String(doc.skipReason || ""),
    dueAt: doc.dueAt ? new Date(doc.dueAt).toISOString() : null,
    submittedAt: doc.submittedAt ? new Date(doc.submittedAt).toISOString() : null,
    reviewedAt: doc.reviewedAt ? new Date(doc.reviewedAt).toISOString() : null,
    reviewNote: String(doc.reviewNote || ""),
    emailTo: String(doc.emailTo || ""),
    emailError: String(doc.emailError || ""),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

export type SerializedFeedback = NonNullable<ReturnType<typeof serializeFeedback>> & {
  internalNote?: string;
  skipReason?: string;
  dueAt?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string;
  emailTo?: string;
  emailError?: string;
  updatedAt?: string | null;
};
