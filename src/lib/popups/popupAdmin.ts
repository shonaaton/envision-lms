import "server-only";

import { Types } from "mongoose";
import { engagementSendHour, engagementWeekKey, engagementWhatsAppEnabled } from "@/lib/engagement/engagementRules";
import { safePopupHref } from "@/lib/popups/popupRules";
import { Batch } from "@/models/Batch";
import { Course } from "@/models/Course";
import { EngagementMessage } from "@/models/EngagementMessage";
import { POPUP_AUDIENCES, Popup, PopupView, type PopupAudience } from "@/models/Popup";
import { User } from "@/models/User";

const DAY = 86_400_000;
export const QUIET_AFTER_DAYS = 14;

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/** Every pop-up, newest first, with how many students saw, opened and closed it. */
export async function listPopups() {
  // A branch's pop-ups are managed from its own portal.
  const popups: any[] = await Popup.find({ branch: null }).sort({ createdAt: -1 }).limit(200).lean();
  const stats: any[] = await PopupView.aggregate([
    { $match: { popup: { $in: popups.map((popup) => popup._id) } } },
    {
      $group: {
        _id: "$popup",
        seen: { $sum: 1 },
        clicked: { $sum: { $cond: [{ $ifNull: ["$clickedAt", false] }, 1, 0] } },
        dismissed: { $sum: { $cond: [{ $ifNull: ["$dismissedAt", false] }, 1, 0] } },
      },
    },
  ]);
  const byPopup = new Map(stats.map((row) => [idOf(row._id), row]));
  return popups.map((popup) => {
    const row = byPopup.get(idOf(popup));
    return { ...popup, stats: { seen: row?.seen || 0, clicked: row?.clicked || 0, dismissed: row?.dismissed || 0 } };
  });
}

export async function popupTargets() {
  const [batches, courses, students] = await Promise.all([
    Batch.find({ isActive: { $ne: false } }, { name: 1, level: 1, students: 1 }).sort({ name: 1 }).lean(),
    Course.find({ isActive: { $ne: false } }, { name: 1 }).sort({ name: 1 }).lean(),
    User.find({ role: "student", isActive: { $ne: false } }, { name: 1, email: 1, username: 1, accountStatus: 1 }).sort({ name: 1 }).limit(1500).lean(),
  ]);
  return {
    batches: batches.map((batch: any) => ({ _id: idOf(batch), name: batch.name, detail: `${(batch.students || []).length} students` })),
    courses: courses.map((course: any) => ({ _id: idOf(course), name: course.name, detail: "Course" })),
    students: students.map((student: any) => ({ _id: idOf(student), name: student.name, detail: student.accountStatus === "demo" ? `Demo - ${student.username || student.email}` : student.username || student.email })),
  };
}

export type PopupInput = {
  title?: string;
  body?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  audience?: string;
  targetIds?: string[];
  targetLabel?: string;
  startsAt?: string;
  endsAt?: string | null;
  priority?: string;
  status?: string;
};

/** Checks and normalises a pop-up from the admin form. Returns an error message or the fields to save. */
export function validatePopupInput(input: PopupInput, options: { partial?: boolean } = {}): { error: string } | { fields: Record<string, unknown> } {
  const fields: Record<string, unknown> = {};
  const has = (key: keyof PopupInput) => !options.partial || key in input;
  if (has("title")) {
    const title = String(input.title || "").trim();
    if (!title) return { error: "Add a title." };
    if (title.length > 120) return { error: "Keep the title under 120 characters." };
    fields.title = title;
  }
  if (has("body")) {
    const body = String(input.body || "").trim();
    if (!body) return { error: "Write the message." };
    if (body.length > 1200) return { error: "Keep the message under 1,200 characters." };
    fields.body = body;
  }
  if (has("imageUrl")) {
    const imageUrl = String(input.imageUrl || "").trim();
    if (imageUrl && !/^https:\/\/\S+$/i.test(imageUrl)) return { error: "The image must be an https:// link." };
    fields.imageUrl = imageUrl;
  }
  if (has("ctaLabel") || has("ctaHref")) {
    const ctaLabel = String(input.ctaLabel || "").trim().slice(0, 40);
    const rawHref = String(input.ctaHref || "").trim();
    const ctaHref = safePopupHref(rawHref);
    if (rawHref && !ctaHref) return { error: "The button link must be a portal page (like /learn) or an https:// link." };
    if (ctaLabel && !ctaHref) return { error: "Add a link for the button, or leave the button text empty." };
    fields.ctaLabel = ctaLabel;
    fields.ctaHref = ctaLabel ? ctaHref : "";
  }
  if (has("audience")) {
    const audience = String(input.audience || "") as PopupAudience;
    if (!POPUP_AUDIENCES.includes(audience)) return { error: "Choose who should see it." };
    const targetIds = (input.targetIds || []).filter((id) => Types.ObjectId.isValid(String(id)));
    const targeted = ["batch", "course", "student", "branch_slot"].includes(audience);
    if (targeted && !targetIds.length) return { error: audience === "branch_slot" ? "Pick at least one class." : `Pick at least one ${audience}.` };
    fields.audience = audience;
    fields.targetIds = targeted ? targetIds.map((id) => new Types.ObjectId(String(id))) : [];
    fields.targetLabel = String(input.targetLabel || "").slice(0, 300);
  }
  if (has("startsAt")) {
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    if (Number.isNaN(startsAt.getTime())) return { error: "The start date is not valid." };
    fields.startsAt = startsAt;
  }
  if (has("endsAt")) {
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (endsAt && Number.isNaN(endsAt.getTime())) return { error: "The end date is not valid." };
    if (endsAt && fields.startsAt && endsAt <= (fields.startsAt as Date)) return { error: "The end date must be after the start." };
    fields.endsAt = endsAt;
  }
  if (has("priority")) fields.priority = input.priority === "high" ? "high" : "normal";
  if (has("status") && input.status) {
    if (!["draft", "active", "archived"].includes(input.status)) return { error: "Unknown status." };
    fields.status = input.status;
  }
  return { fields };
}

/**
 * The weekly WhatsApp at a glance: last four weeks by kind and outcome, who
 * opted out, the latest sends, and students who have stopped opening the portal.
 */
export async function engagementOverview(now = new Date()) {
  const weekKeys = [0, 1, 2, 3].map((weeks) => engagementWeekKey(new Date(now.getTime() - weeks * 7 * DAY)));
  const quietBefore = new Date(now.getTime() - QUIET_AFTER_DAYS * DAY);
  const activeStudents = { role: "student", isActive: { $ne: false }, accountStatus: { $ne: "demo" } };
  const [weeks, optOuts, recent, quiet, quietCount, neverSeenCount] = await Promise.all([
    EngagementMessage.aggregate([
      { $match: { weekKey: { $in: weekKeys } } },
      { $group: { _id: { weekKey: "$weekKey", kind: "$kind", status: "$status" }, count: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $match: { ...activeStudents, "engagementOptOut.optedOut": true } },
      { $group: { _id: "$engagementOptOut.via", count: { $sum: 1 } } },
    ]),
    EngagementMessage.find({ weekKey: { $in: weekKeys.slice(0, 2) } }).sort({ updatedAt: -1 }).limit(60).populate("student", "name username").lean(),
    User.find({ ...activeStudents, isPaused: { $ne: true }, lastSeenAt: { $lt: quietBefore } }).select("name username lastSeenAt phone").sort({ lastSeenAt: 1 }).limit(50).lean(),
    User.countDocuments({ ...activeStudents, isPaused: { $ne: true }, lastSeenAt: { $lt: quietBefore } }),
    User.countDocuments({ ...activeStudents, isPaused: { $ne: true }, lastSeenAt: { $exists: false } }),
  ]);
  const weekRows = weekKeys.map((weekKey) => {
    const rows = (weeks as any[]).filter((row) => row._id.weekKey === weekKey);
    const count = (filter: (id: any) => boolean) => rows.filter((row) => filter(row._id)).reduce((sum, row) => sum + row.count, 0);
    return {
      weekKey,
      digest: count((id) => id.kind === "digest"),
      nudge: count((id) => id.kind === "nudge"),
      sent: count((id) => id.status === "sent"),
      failed: count((id) => id.status === "failed"),
      pending: count((id) => id.status === "template_pending" || id.status === "claimed"),
    };
  });
  return {
    enabled: engagementWhatsAppEnabled(),
    sendHour: engagementSendHour(),
    weeks: weekRows,
    optOuts: {
      total: (optOuts as any[]).reduce((sum, row) => sum + row.count, 0),
      byStop: (optOuts as any[]).find((row) => row._id === "whatsapp_stop")?.count || 0,
      byAdmin: (optOuts as any[]).find((row) => row._id === "admin")?.count || 0,
    },
    recent: (recent as any[]).map((row) => ({
      _id: idOf(row),
      weekKey: row.weekKey,
      student: row.student ? { _id: idOf(row.student), name: row.student.name || row.student.username } : null,
      kind: row.kind,
      status: row.status,
      error: row.error || "",
      sentAt: row.sentAt || null,
    })),
    quiet: (quiet as any[]).map((row) => ({ _id: idOf(row), name: row.name || row.username, lastSeenAt: row.lastSeenAt })),
    quietCount,
    neverSeenCount,
  };
}
