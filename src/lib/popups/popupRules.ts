/**
 * Which pop-up a student sees when they open the portal. Pure; the loading
 * lives in popupService.ts. At most one pop-up per visit, in this order:
 *
 *   1. a high-priority admin pop-up
 *   2. the monthly report is ready
 *   3. a new badge
 *   4. homework due within 48 hours
 *   5. last week's recap (Monday to Wednesday)
 *   6. any other admin pop-up
 */

export const POPUP_KINDS = ["campaign_high", "feedback", "badge", "homework", "recap", "campaign"] as const;
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
};

export type PopupViewState = { seenCount?: number; dismissedAt?: Date | null; clickedAt?: Date | null };

/**
 * Done with: closed or acted on. A recap is a summary, not a call to action,
 * so having seen it once is enough.
 */
export function isHandled(candidate: Pick<PopupCandidate, "kind">, view?: PopupViewState | null) {
  if (!view) return false;
  if (view.dismissedAt || view.clickedAt) return true;
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

export type StudentShape = { id: string; accountStatus?: string; batchIds: string[]; courseIds: string[]; branch?: string | null; slotIds?: string[] };

export function campaignIsLive(campaign: CampaignShape, now: Date) {
  if (campaign.status !== "active") return false;
  if (campaign.startsAt && new Date(campaign.startsAt) > now) return false;
  if (campaign.endsAt && new Date(campaign.endsAt) <= now) return false;
  return true;
}

/** Demo accounts only see pop-ups written for demo students; enrolled students never see those. */
export function campaignMatches(campaign: CampaignShape, student: StudentShape) {
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

/** A link the pop-up button may open: a portal path or an https URL, nothing else. */
export function safePopupHref(value?: string | null) {
  const href = String(value || "").trim();
  if (!href) return "";
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return /^https:\/\/[^\s]+$/i.test(href) ? href : "";
}
