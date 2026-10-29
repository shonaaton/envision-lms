import "server-only";

import { Types } from "mongoose";
import { academyDateTime } from "@/lib/academyTime";
import { exitStudentId as idOf } from "@/lib/classroomStudentExits";
import { dbConnect } from "@/lib/db";
import { academyWeekday, engagementWeekKey, hasAnythingToReport, nextClassLabel } from "@/lib/engagement/engagementRules";
import { STUDENT_FIELDS, loadWeeklySnapshots } from "@/lib/engagement/weeklySnapshot";
import {
  BADGE_FRESH_DAYS,
  FEEDBACK_FRESH_DAYS,
  HOMEWORK_DUE_WINDOW_MS,
  campaignIsLive,
  campaignMatches,
  choosePopup,
  isRecapDay,
  popupRank,
  safePopupHref,
  type PopupCandidate,
  type PopupViewState,
} from "@/lib/popups/popupRules";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { StudentReward } from "@/models/ClassroomLive";
import { MonthlyFeedback } from "@/models/MonthlyFeedback";
import { Popup, PopupView } from "@/models/Popup";
import { User } from "@/models/User";
import { BranchStudent } from "@/models/Branch";

const DAY = 86_400_000;
const KEY_PATTERN = /^(campaign:[a-f0-9]{24}|auto:[a-z_]+:[A-Za-z0-9_-]+)$/;

export function isPopupKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

export type PopupPayload = Omit<PopupCandidate, "createdAt">;

/**
 * The one pop-up this student should see now, or null - and it is counted as
 * seen. Cheap candidates (admin pop-ups, report, badge) are read first; the
 * homework and recap ones need the weekly snapshot, so they are only worked
 * out when nothing ahead of them in the order is waiting.
 */
export async function nextPopupFor(userId: string, now = new Date()): Promise<PopupPayload | null> {
  await dbConnect();
  const user: any = await User.findById(userId).select(`${STUDENT_FIELDS} branch`).lean();
  if (!user || user.role !== "student" || user.isActive === false) return null;
  const views = await readViews(user._id);
  const isDemo = user.accountStatus === "demo";

  const candidates: PopupCandidate[] = [...(await campaignCandidates(user, now))];
  if (!isDemo) {
    candidates.push(...(await feedbackCandidate(user._id, now)), ...(await badgeCandidate(user._id, now)));
  }
  let chosen = choosePopup(candidates, views);
  if (!isDemo && !user.isPaused && (!chosen || popupRank(chosen.kind) > popupRank("homework"))) {
    candidates.push(...(await snapshotCandidates(user, now)));
    chosen = choosePopup(candidates, views);
  }
  if (!chosen) return null;
  await markSeen(user._id, chosen, now);
  const { createdAt: _createdAt, ...payload } = chosen;
  return payload;
}

async function readViews(userId: any) {
  const rows: any[] = await PopupView.find({ user: userId }).select("key seenCount dismissedAt clickedAt").lean();
  return new Map<string, PopupViewState>(rows.map((row) => [row.key, row]));
}

async function campaignCandidates(user: any, now: Date): Promise<PopupCandidate[]> {
  const campaigns: any[] = await Popup.find({ status: "active", startsAt: { $lte: now } }).sort({ createdAt: -1 }).limit(50).lean();
  const live = campaigns.filter((campaign) => campaignIsLive(campaign, now));
  if (!live.length) return [];
  const needsMembership = live.some((campaign) => campaign.audience === "batch" || campaign.audience === "course");
  const [batchIds, courseIds] = needsMembership ? await membershipOf(user) : [[], []];
  const slotIds = user.branch && live.some((campaign) => campaign.audience === "branch_slot")
    ? ((await BranchStudent.findOne({ user: user._id }).select("slots").lean()) as any)?.slots?.map((slot: unknown) => String(slot)) || []
    : [];
  const student = { id: idOf(user), accountStatus: user.accountStatus, batchIds, courseIds, branch: user.branch || null, slotIds };
  return live
    .filter((campaign) => campaignMatches(campaign, student))
    .map((campaign) => ({
      key: `campaign:${idOf(campaign)}`,
      kind: campaign.priority === "high" ? "campaign_high" : "campaign",
      title: campaign.title,
      body: campaign.body,
      imageUrl: campaign.imageUrl || "",
      ctaLabel: campaign.ctaLabel || "",
      ctaHref: safePopupHref(campaign.ctaHref),
      createdAt: campaign.createdAt,
    }));
}

async function membershipOf(user: any): Promise<[string[], string[]]> {
  const [batches, courses] = await Promise.all([
    Batch.find({ students: user._id }).distinct("_id"),
    Classroom.find({ students: user._id, isActive: { $ne: false }, isSessionInstance: { $ne: true }, status: { $ne: "cancelled" } }).distinct("course"),
  ]);
  const batchIds = new Set([...(user.batches || []), ...batches].map(idOf));
  return [Array.from(batchIds), courses.filter(Boolean).map(idOf)];
}

async function feedbackCandidate(userId: any, now: Date): Promise<PopupCandidate[]> {
  const report: any = await MonthlyFeedback.findOne({ student: userId, status: "sent", sentAt: { $gte: new Date(now.getTime() - FEEDBACK_FRESH_DAYS * DAY) } })
    .sort({ sentAt: -1 })
    .select("month sentAt")
    .lean();
  if (!report) return [];
  const monthLabel = monthName(report.month);
  return [{
    key: `auto:feedback:${idOf(report)}`,
    kind: "feedback",
    title: `Your ${monthLabel} progress report is ready`,
    body: "Your coach has written about how the month went: what went well and what to work on next. Have a look together with your parents.",
    ctaLabel: "Read the report",
    ctaHref: "/feedback",
    createdAt: report.sentAt,
  }];
}

async function badgeCandidate(userId: any, now: Date): Promise<PopupCandidate[]> {
  const reward: any = await StudentReward.findOne({ student: userId, badge: { $nin: [null, ""] }, createdAt: { $gte: new Date(now.getTime() - BADGE_FRESH_DAYS * DAY) } })
    .sort({ createdAt: -1 })
    .select("badge reason xp createdAt")
    .lean();
  if (!reward) return [];
  return [{
    key: `auto:badge:${idOf(reward)}`,
    kind: "badge",
    title: `New badge: ${reward.badge}`,
    body: reward.reason ? `${reward.reason}. Well done - keep it going!` : "Well done - keep it going!",
    ctaLabel: "See my rewards",
    ctaHref: "/dashboard",
    createdAt: reward.createdAt,
  }];
}

/** Homework due within 48 hours and, Monday to Wednesday, last week's recap. */
async function snapshotCandidates(user: any, now: Date): Promise<PopupCandidate[]> {
  const result: PopupCandidate[] = [];
  const weekKey = engagementWeekKey(now);
  const weekStart = academyDateTime(weekKey, "00:00");
  const thisWeek = (await loadWeeklySnapshots([user], weekStart, now)).get(idOf(user));
  if (!thisWeek?.audience.inClass) return result;
  const task = thisWeek.snapshot.task;
  if (task.kind === "homework" && task.dueAt && task.dueAt > now && task.dueAt.getTime() - now.getTime() <= HOMEWORK_DUE_WINDOW_MS) {
    const homeworkId = task.href.split("/").pop() || "";
    result.push({
      key: `auto:homework:${homeworkId}`,
      kind: "homework",
      title: "Homework due soon",
      body: `"${task.title}" is due ${nextClassLabel(task.dueAt)}. A few minutes today keeps you on track.`,
      ctaLabel: "Start homework",
      ctaHref: task.href,
      createdAt: task.dueAt,
    });
  }
  if (isRecapDay(academyWeekday(now))) {
    const lastWeekKey = engagementWeekKey(new Date(weekStart.getTime() - 12 * 60 * 60_000));
    const lastWeek = (await loadWeeklySnapshots([user], academyDateTime(lastWeekKey, "00:00"), weekStart)).get(idOf(user));
    if (lastWeek && hasAnythingToReport(lastWeek.snapshot)) {
      const snap = lastWeek.snapshot;
      result.push({
        key: `auto:recap:${lastWeekKey}`,
        kind: "recap",
        title: "Your week in review",
        body: `Classes attended: ${snap.classesAttended} of ${snap.classesScheduled}. Homework done: ${snap.homeworkSubmitted}. Puzzles and lessons solved: ${snap.puzzlesSolved + snap.lessonsCompleted}. XP earned: ${snap.xpEarned}. Next class: ${nextClassLabel(thisWeek.snapshot.nextClassAt)}.`,
        ctaLabel: snap.puzzlesSolved + snap.lessonsCompleted > 0 ? "Keep practising" : "Try a puzzle",
        ctaHref: task.href,
        createdAt: weekStart,
      });
    }
  }
  return result;
}

async function markSeen(userId: any, candidate: PopupCandidate, now: Date) {
  const popupId = candidate.key.startsWith("campaign:") ? new Types.ObjectId(candidate.key.slice("campaign:".length)) : undefined;
  await PopupView.updateOne(
    { user: userId, key: candidate.key },
    { $setOnInsert: { firstSeenAt: now, ...(popupId ? { popup: popupId } : {}) }, $set: { lastSeenAt: now }, $inc: { seenCount: 1 } },
    { upsert: true }
  ).catch((error: any) => {
    if (error?.code !== 11000) throw error;
  });
}

/** The student closed the pop-up or pressed its button. Either way it does not come back. */
export async function recordPopupAction(userId: string, key: string, action: "dismiss" | "click", now = new Date()) {
  await dbConnect();
  const popupId = key.startsWith("campaign:") ? new Types.ObjectId(key.slice("campaign:".length)) : undefined;
  await PopupView.updateOne(
    { user: userId, key },
    {
      $set: action === "click" ? { clickedAt: now } : { dismissedAt: now },
      $setOnInsert: { firstSeenAt: now, lastSeenAt: now, seenCount: 1, ...(popupId ? { popup: popupId } : {}) },
    },
    { upsert: true }
  );
}

function monthName(month: string) {
  const [year, value] = String(month || "").split("-").map(Number);
  if (!year || !value) return "monthly";
  return new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, value - 1, 1)));
}
