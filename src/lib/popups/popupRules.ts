/**
 * Which pop-up a student sees when they open the portal. Pure; the loading
 * lives in popupService.ts. At most one pop-up per visit, in this order:
 *
 *   0. a tournament the student can still register for (every visit until
 *      they register or it can no longer be joined)
 *   1. a high-priority admin pop-up
 *   2. the monthly report is ready
 *   3. a new badge
 *   4. homework due within 48 hours
 *   5. last week's recap (Monday to Wednesday)
 *   6. any other admin pop-up
 */

export const POPUP_KINDS = ["tournament", "campaign_high", "feedback", "badge", "homework", "recap", "campaign"] as const;
export type PopupKind = (typeof POPUP_KINDS)[number];

export const HOMEWORK_DUE_WINDOW_MS = 48 * 60 * 60_000;
export const FEEDBACK_FRESH_DAYS = 30;
export const BADGE_FRESH_DAYS = 14;

export type PopupCandidate = {
  key: string;
  kind: PopupKind;
  title: string;
  body: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Newer first within the same kind. */
  createdAt?: Date | null;
  /** An admin pop-up stops after this many showings to one person. */
  maxViews?: number | null;
};

export type PopupViewState = { seenCount?: number; dismissedAt?: Date | null; clickedAt?: Date | null };

/**
 * Done with: closed or acted on. A recap is a summary, not a call to action,
 * so having seen it once is enough.
 */
export function isHandled(candidate: Pick<PopupCandidate, "kind" | "maxViews">, view?: PopupViewState | null) {
  // A tournament invitation comes back on every visit: it is only offered
  // while the student is not registered, and registering is what ends it.
  if (candidate.kind === "tournament") return false;
  if (!view) return false;
  if (view.dismissedAt || view.clickedAt) return true;
  if (candidate.maxViews && Number(view.seenCount || 0) >= candidate.maxViews) return true;
  return candidate.kind === "recap" && Number(view.seenCount || 0) > 0;
}

export function popupRank(kind: PopupKind) {
  return POPUP_KINDS.indexOf(kind);
}

export function choosePopup(candidates: PopupCandidate[], views: Map<string, PopupViewState>) {
  const open = candidates.filter((candidate) => !isHandled(candidate, views.get(candidate.key)));
  open.sort((a, b) => popupRank(a.kind) - popupRank(b.kind) || time(b.createdAt) - time(a.createdAt));
  return open[0] || null;
}

function time(value?: Date | null) {
  return value ? new Date(value).getTime() : 0;
}

export type CampaignShape = {
  audience: string;
  branch?: string | null;
  targetIds?: unknown[];
  status?: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

export type StudentShape = { id: string; role?: string; accountStatus?: string; batchIds: string[]; courseIds: string[]; branch?: string | null; slotIds?: string[] };

export function campaignIsLive(campaign: CampaignShape, now: Date) {
  if (campaign.status !== "active") return false;
  if (campaign.startsAt && new Date(campaign.startsAt) > now) return false;
  if (campaign.endsAt && new Date(campaign.endsAt) <= now) return false;
  return true;
}

/** Audiences that reach accounts other than students. */
export const ALL_ROLE_AUDIENCES = ["everyone", "all_staff"];

/**
 * `everyone` is every signed-in account (students, demo families, coaches,
 * admins, branch students too); `all_staff` is every non-student. All other
 * audiences are for students only. Demo accounts only see student pop-ups
 * written for demo students; enrolled students never see those.
 */
export function campaignMatches(campaign: CampaignShape, student: StudentShape) {
  if (campaign.audience === "everyone") return !campaign.branch || campaign.branch === (student.branch || null);
  if (campaign.audience === "all_staff") return !campaign.branch && Boolean(student.role) && student.role !== "student";
  if (student.role && student.role !== "student") return false;
  const targets = new Set((campaign.targetIds || []).map((id) => String(id)));
  const isDemo = student.accountStatus === "demo";
  // An offline branch's pop-ups are for its own students only, and the online
  // academy's are not shown to branch students at all.
  if ((campaign.branch || null) !== (student.branch || null)) return false;
  switch (campaign.audience) {
    case "branch_all":
      return true;
    case "branch_slot":
      return (student.slotIds || []).some((id) => targets.has(id));
    case "demo_students":
      return isDemo;
    case "all_students":
      return !isDemo;
    case "batch":
      return !isDemo && student.batchIds.some((id) => targets.has(id));
    case "course":
      return !isDemo && student.courseIds.some((id) => targets.has(id));
    case "student":
      return targets.has(student.id);
    default:
      return false;
  }
}

/** Recaps of last week are shown Monday to Wednesday (academy weekday 1-3). */
export function isRecapDay(weekday: number) {
  return weekday >= 1 && weekday <= 3;
}

/**
 * The image a pop-up shows: an uploaded file (/uploads/popups/...) or an https
 * link. A Google Drive "share" link points at Drive's viewer page, not the
 * picture, so it is turned into Drive's direct image address (the file must be
 * shared with "anyone with the link"). Anything else gives "".
 */
export function popupImageSrc(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\/uploads\/popups\/[a-z0-9][a-z0-9._-]{0,150}$/i.test(raw)) return raw;
  if (!/^https:\/\/\S+$/i.test(raw)) return "";
  const drive = raw.match(/^https:\/\/drive\.google\.com\/(?:file\/d\/([\w-]{10,})|(?:open|uc)\?(?:[^#]*&)?id=([\w-]{10,}))/i);
  if (drive) return `https://drive.google.com/thumbnail?id=${drive[1] || drive[2]}&sz=w1200`;
  return raw;
}

/** A link the pop-up button may open: a portal path or an https URL, nothing else. */
export function safePopupHref(value?: string | null) {
  const href = String(value || "").trim();
  if (!href) return "";
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return /^https:\/\/[^\s]+$/i.test(href) ? href : "";
}
