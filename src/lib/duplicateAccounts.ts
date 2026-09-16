import { Types } from "mongoose";
import { recordActivity } from "@/lib/activity";
import { canonicalEmail, canonicalPhone, duplicateReasonSummary, type DuplicateReason } from "@/lib/identityMatch";
import { demoManagementUsers, DEMO_MANAGEMENT_HREF } from "@/lib/demoWorkflow";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * Duplicate accounts are flagged for a human, never refused.
 *
 * The academy's families are the reason. A second child signs up on the same
 * parent's phone and frequently the same parent's inbox, and that is a real
 * second student who has to be able to register. A hard block on a shared
 * phone - which is what the old "a free demo has already been completed for
 * this phone number" check did - turned every sibling into a support ticket,
 * while still missing the case it was written for, because the same person
 * spelling their Gmail with a dot got a clean run at it.
 *
 * So both accounts are created, and the newer one carries a pending review
 * that the Demo Center shows until an admin says which it is.
 */

export type DuplicateMatch = {
  user: any;
  name: string;
  email: string;
  username: string;
  accountStatus: string;
  reasons: DuplicateReason[];
  createdAt?: Date;
};

const MATCH_FIELDS = "name email username accountStatus phone countryCode createdAt";

/**
 * Accounts that share an inbox or a handset with this one.
 *
 * Blank keys are never matched on: every account with no phone on file would
 * otherwise be a duplicate of every other one.
 */
export async function findDuplicateCandidates(input: {
  userId?: string;
  email?: string;
  phone?: string;
  countryCode?: string;
}): Promise<DuplicateMatch[]> {
  const emailKey = canonicalEmail(input.email);
  const phoneKey = canonicalPhone(input.phone, input.countryCode);
  const rawPhone = String(input.phone || "").trim();
  const clauses: any[] = [];
  if (emailKey) clauses.push({ emailCanonical: emailKey });
  if (phoneKey) clauses.push({ phoneCanonical: phoneKey });
  // Accounts that predate the match keys have none to be found by, so the raw
  // phone is searched alongside them until `scripts/backfill-identity-keys.ts`
  // has run. It catches the exact-match case the old check caught; the folded
  // spellings need the backfill. Whether a row that turns up this way is really
  // a match is decided below, from its own details, so a stale key cannot
  // manufacture one.
  if (rawPhone) clauses.push({ phone: rawPhone, phoneCanonical: { $in: [null, ""] } });
  if (!clauses.length) return [];

  const filter: any = { $or: clauses };
  if (input.userId && Types.ObjectId.isValid(input.userId)) filter._id = { $ne: new Types.ObjectId(input.userId) };
  const candidates = await User.find(filter).select(MATCH_FIELDS).sort({ createdAt: 1 }).limit(20).lean();

  return (candidates as any[]).map((candidate) => {
    const reasons: DuplicateReason[] = [];
    if (emailKey && canonicalEmail(candidate.email) === emailKey) reasons.push("email");
    if (phoneKey && canonicalPhone(candidate.phone, candidate.countryCode) === phoneKey) reasons.push("phone");
    return {
      user: candidate._id,
      name: candidate.name || "",
      email: candidate.email || "",
      username: candidate.username || "",
      accountStatus: candidate.accountStatus || "",
      reasons,
      createdAt: candidate.createdAt,
    };
  }).filter((match) => match.reasons.length);
}

/**
 * Flag a freshly created account if an older one already holds its details.
 *
 * Called after the account exists, and never allowed to fail the signup: a
 * notification that does not send is worth less than an account that does not
 * get created. Returns the matches so the caller can log what it found.
 */
export async function flagDuplicateAccount(user: any): Promise<DuplicateMatch[]> {
  const userId = String(user?._id || "");
  if (!userId) return [];
  const matches = await findDuplicateCandidates({
    userId,
    email: user.email,
    phone: user.phone,
    countryCode: user.countryCode,
  });
  if (!matches.length) return [];

  const reasons = [...new Set(matches.flatMap((match) => match.reasons))];
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        duplicateReview: {
          status: "pending",
          reasons,
          matches,
          flaggedAt: new Date(),
        },
      },
    }
  );

  const existing = matches.map((match) => `${match.name || "Unnamed"} (${match.email || "no email"})`).join(", ");
  const message = `${user.name || "A new account"} (${user.email || "no email"}) matches an existing account: ${existing}. ${duplicateReasonSummary(reasons)}. This is often a sibling - review it before treating it as a duplicate.`;
  await notifyDuplicateFlag(userId, message).catch((error) => console.error("Duplicate account notification failed", error));
  await recordActivity({
    actor: userId,
    targetUser: userId,
    type: "user.duplicate.flagged",
    label: "Flagged as a possible duplicate account",
    entityType: "User",
    entityId: userId,
    metadata: { reasons, matches: matches.map((match) => String(match.user)), event: "DUPLICATE_ACCOUNT_FLAGGED" },
  }).catch(() => undefined);
  return matches;
}

async function notifyDuplicateFlag(userId: string, message: string) {
  const admins = await demoManagementUsers();
  if (!admins.length) return;
  await Notification.insertMany(
    admins.map((admin: any) => ({
      user: admin._id,
      type: "user.duplicate.flagged",
      title: "Possible duplicate account",
      message,
      metadata: { duplicateUser: userId, href: `${DEMO_MANAGEMENT_HREF}?tab=duplicates`, event: "DUPLICATE_ACCOUNT_FLAGGED" },
    }))
  );
}

/** An admin's ruling on a flag. Nothing is deleted either way - the decision is recorded. */
export async function reviewDuplicateFlag(input: {
  userId: string;
  decision: "cleared" | "confirmed";
  actorId?: string;
  actorName?: string;
  note?: string;
}) {
  if (!Types.ObjectId.isValid(input.userId)) throw new Error("That account no longer exists.");
  const user: any = await User.findById(input.userId).select("name duplicateReview").lean();
  if (!user?.duplicateReview?.status) throw new Error("That account is not flagged for review.");
  await User.updateOne(
    { _id: input.userId },
    {
      $set: {
        "duplicateReview.status": input.decision,
        "duplicateReview.reviewedAt": new Date(),
        "duplicateReview.reviewedBy": input.actorId && Types.ObjectId.isValid(input.actorId) ? input.actorId : undefined,
        "duplicateReview.reviewedByName": input.actorName || "",
        "duplicateReview.note": input.note || "",
      },
    }
  );
  await recordActivity({
    actor: input.actorId,
    targetUser: input.userId,
    type: "user.duplicate.reviewed",
    label: input.decision === "cleared" ? "Cleared a duplicate flag - separate people" : "Confirmed a duplicate account",
    entityType: "User",
    entityId: input.userId,
    metadata: { decision: input.decision, note: input.note || "", event: "DUPLICATE_ACCOUNT_REVIEWED" },
  }).catch(() => undefined);
  return { name: user.name || "The account", decision: input.decision };
}

/** Accounts waiting on a ruling, newest first. */
export async function pendingDuplicateReviews(limit = 100) {
  return User.find({ "duplicateReview.status": "pending" }, { passwordHash: 0, tempPassword: 0 })
    .sort({ "duplicateReview.flaggedAt": -1 })
    .limit(limit)
    .lean();
}
