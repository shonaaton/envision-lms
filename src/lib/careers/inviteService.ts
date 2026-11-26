import "server-only";

import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { recordActivity } from "@/lib/activity";
import { LIVE_STAGES, isPostingAcceptingApplications } from "@/lib/careers/careersConfig";
import { sendInvite } from "@/lib/careers/careersMessages";
import {
  AUTO_REMINDER_AFTER_MS,
  AUTO_REMINDER_HOURS_IST,
  RESEND_COOLDOWN_MS,
  canResendNow,
  inviteStatus,
  istHour,
  parseInviteLines,
  type InviteStatus,
} from "@/lib/careers/inviteConfig";
import { JobApplication, JobInvite, JobPosting } from "@/models/Careers";

/**
 * "Invite applicants": the team adds people by name + WhatsApp number, each
 * gets a WhatsApp (career_invite, off until Meta approves it) and an email if
 * one was given, with their own link to the opening's form. The link fills in
 * name / number / email and ties the application back to the invite. People
 * who have not applied can be sent the link again (24-hour gap), and one
 * automatic reminder goes 3 days after the invite.
 */

type Actor = { id: string; name?: string | null };
const str = (value: unknown) => (value == null ? "" : String(value));
const oid = (value: unknown) => (typeof value === "string" && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : undefined);

function newToken() {
  return globalThis.crypto.randomUUID().replace(/-/g, "");
}

export function inviteLink(slug: string, token: string) {
  const base = resolvePublicAppUrl(undefined, { allowRequestHeaders: false }) || "https://envisionchessacademy.com";
  return `${base}/careers/${encodeURIComponent(slug)}?invite=${token}&apply=1`;
}

export function shapeInvite(row: any, slug: string) {
  return {
    id: str(row._id),
    posting: str(row.posting),
    postingTitle: str(row.postingTitle),
    name: str(row.name),
    email: str(row.email),
    countryCode: str(row.countryCode),
    phone: str(row.phone),
    status: inviteStatus(row) as InviteStatus,
    link: slug ? inviteLink(slug, str(row.token)) : "",
    openedAt: row.openedAt ? new Date(row.openedAt).toISOString() : null,
    appliedAt: row.appliedAt ? new Date(row.appliedAt).toISOString() : null,
    application: row.application ? str(row.application) : null,
    lastSentAt: row.lastSentAt ? new Date(row.lastSentAt).toISOString() : null,
    canResend: !row.appliedAt && !row.cancelledAt && canResendNow(row.lastSentAt),
    sendCount: Number(row.sendCount) || 0,
    sends: (row.sends || []).map((send: any) => ({ kind: str(send.kind), at: send.at ? new Date(send.at).toISOString() : null, whatsapp: Boolean(send.whatsapp), email: Boolean(send.email), byName: str(send.byName) })),
    createdByName: str(row.createdByName),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}
export type InviteView = ReturnType<typeof shapeInvite>;

async function deliver(invite: any, slug: string, kind: "invite" | "resend" | "auto", byName: string) {
  const sent = await sendInvite({ ...invite, link: inviteLink(slug, invite.token) }, kind !== "invite");
  const at = new Date();
  await JobInvite.updateOne(
    { _id: invite._id },
    { $set: { lastSentAt: at }, $inc: { sendCount: 1 }, $push: { sends: { kind, at, whatsapp: Boolean(sent.whatsapp), email: Boolean(sent.email), byName } } }
  );
  return sent;
}

export type CreateInvitesResult = {
  invited: { name: string; phone: string; whatsapp: boolean; email: boolean }[];
  skipped: { name: string; phone: string; reason: string }[];
  problems: { line: number; text: string; error: string }[];
};

/** Invites everyone in `text` (one person per line) to `postingId`. */
export async function createInvites(postingId: string, text: string, defaultCountryCode: string, actor: Actor): Promise<CreateInvitesResult> {
  await dbConnect();
  const posting: any = Types.ObjectId.isValid(postingId) ? await JobPosting.findById(postingId).lean() : null;
  if (!posting) throw new Error("Pick the opening to invite people to.");
  if (!isPostingAcceptingApplications(posting)) throw new Error("This opening is not taking applications. Open it (and check its closing date) before inviting people.");
  const parsed = parseInviteLines(text, defaultCountryCode || "+91");
  if (!parsed.rows.length && !parsed.problems.length) throw new Error("Add at least one person: a name and a WhatsApp number.");

  const result: CreateInvitesResult = { invited: [], skipped: [], problems: parsed.problems };
  const byName = actor.name || "Admin";
  for (const row of parsed.rows) {
    const phoneLabel = `${row.countryCode} ${row.phone}`;
    const applied: any = await JobApplication.findOne({ posting: posting._id, countryCode: row.countryCode, phone: row.phone, awaitingCode: { $ne: true } }).select("stage").lean();
    if (applied && LIVE_STAGES.includes(applied.stage)) {
      result.skipped.push({ name: row.name, phone: phoneLabel, reason: "already applied" });
      continue;
    }
    const existing: any = await JobInvite.findOne({ posting: posting._id, countryCode: row.countryCode, phone: row.phone, cancelledAt: null, appliedAt: null }).lean();
    if (existing) {
      result.skipped.push({ name: row.name, phone: phoneLabel, reason: "already invited - use Resend" });
      continue;
    }
    const invite: any = (
      await JobInvite.create({
        posting: posting._id,
        postingTitle: posting.title,
        name: row.name,
        email: row.email,
        countryCode: row.countryCode,
        phone: row.phone,
        token: newToken(),
        createdBy: oid(actor.id),
        createdByName: byName,
      })
    ).toObject();
    const sent = await deliver(invite, posting.slug, "invite", byName);
    result.invited.push({ name: row.name, phone: phoneLabel, whatsapp: sent.whatsapp, email: sent.email });
  }
  if (result.invited.length) {
    await recordActivity({
      actor: actor.id,
      type: "careers.invites.created",
      label: `Invited ${result.invited.length} ${result.invited.length === 1 ? "person" : "people"} to apply for "${posting.title}"`,
      entityType: "JobPosting",
      entityId: str(posting._id),
    });
  }
  return result;
}

export type InviteFilters = { posting?: string; status?: string; q?: string };

export async function listInvites(filters: InviteFilters, limit = 500) {
  await dbConnect();
  const base: Record<string, any> = {};
  if (filters.posting && Types.ObjectId.isValid(filters.posting)) base.posting = new Types.ObjectId(filters.posting);
  if (filters.q) {
    const pattern = new RegExp(filters.q.slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    base.$or = [{ name: pattern }, { phone: pattern }, { email: pattern }];
  }
  const byStatus: Record<string, Record<string, any>> = {
    waiting: { appliedAt: null, cancelledAt: null },
    invited: { appliedAt: null, cancelledAt: null, openedAt: null },
    opened: { appliedAt: null, cancelledAt: null, openedAt: { $ne: null } },
    applied: { appliedAt: { $ne: null } },
    cancelled: { appliedAt: null, cancelledAt: { $ne: null } },
    all: {},
  };
  const status = byStatus[filters.status || ""] ? filters.status || "waiting" : "waiting";
  const [rows, counts, postings] = await Promise.all([
    JobInvite.find({ ...base, ...byStatus[status] }).sort({ createdAt: -1 }).limit(limit).lean() as Promise<any[]>,
    Promise.all(Object.entries(byStatus).map(async ([key, query]) => [key, await JobInvite.countDocuments({ ...base, ...query })] as const)),
    JobPosting.find({}).select("slug").lean() as Promise<any[]>,
  ]);
  const slugs = new Map(postings.map((row) => [str(row._id), str(row.slug)]));
  return { invites: rows.map((row) => shapeInvite(row, slugs.get(str(row.posting)) || "")), counts: Object.fromEntries(counts) as Record<string, number> };
}

async function postingSlug(postingId: unknown) {
  const posting: any = await JobPosting.findById(postingId).select("slug status closesAt").lean();
  return posting;
}

/** Sends one invite's link again. Refuses inside the 24-hour gap, after applying, or once cancelled. */
export async function resendInvite(id: string, actor: Actor) {
  await dbConnect();
  const invite: any = Types.ObjectId.isValid(id) ? await JobInvite.findById(id).lean() : null;
  if (!invite) throw new Error("This invite no longer exists.");
  if (invite.appliedAt) throw new Error(`${invite.name} has already applied.`);
  if (invite.cancelledAt) throw new Error("This invite was cancelled.");
  if (!canResendNow(invite.lastSentAt)) throw new Error(`${invite.name} was messaged in the last 24 hours. Try again later.`);
  const posting = await postingSlug(invite.posting);
  if (!posting || !isPostingAcceptingApplications(posting)) throw new Error("This opening is not taking applications any more.");
  // Claim the send, so a double click messages them once.
  const claimed = await JobInvite.updateOne(
    { _id: invite._id, appliedAt: null, cancelledAt: null, $or: [{ lastSentAt: null }, { lastSentAt: { $lte: new Date(Date.now() - RESEND_COOLDOWN_MS) } }] },
    { $set: { lastSentAt: new Date() } }
  );
  if (!claimed.modifiedCount) throw new Error(`${invite.name} was just messaged.`);
  const sent = await deliver(invite, posting.slug, "resend", actor.name || "Admin");
  const fresh: any = await JobInvite.findById(id).lean();
  return { invite: shapeInvite(fresh, posting.slug), sent };
}

/** "Resend to all": everyone not applied (optionally for one opening) whose last message is over 24 hours old. */
export async function resendAllWaiting(postingId: string | undefined, actor: Actor) {
  await dbConnect();
  const query: Record<string, any> = {
    appliedAt: null,
    cancelledAt: null,
    $or: [{ lastSentAt: null }, { lastSentAt: { $lte: new Date(Date.now() - RESEND_COOLDOWN_MS) } }],
  };
  if (postingId && Types.ObjectId.isValid(postingId)) query.posting = new Types.ObjectId(postingId);
  const rows: any[] = await JobInvite.find(query).sort({ createdAt: 1 }).limit(300).select("_id").lean();
  const tally = { sent: 0, skipped: 0, whatsapp: 0, email: 0 };
  for (const row of rows) {
    try {
      const { sent } = await resendInvite(str(row._id), actor);
      tally.sent += 1;
      if (sent.whatsapp) tally.whatsapp += 1;
      if (sent.email) tally.email += 1;
    } catch {
      tally.skipped += 1;
    }
  }
  if (tally.sent) {
    await recordActivity({ actor: actor.id, type: "careers.invites.resent", label: `Resent the application link to ${tally.sent} invited ${tally.sent === 1 ? "person" : "people"}`, entityType: "JobInvite" });
  }
  return tally;
}

export async function cancelInvite(id: string, actor: Actor) {
  await dbConnect();
  const updated: any = await JobInvite.findOneAndUpdate({ _id: id, appliedAt: null }, { $set: { cancelledAt: new Date() } }, { new: true }).lean();
  if (!updated) throw new Error("This invite cannot be cancelled (already applied, or gone).");
  void actor;
  const posting = await postingSlug(updated.posting);
  return shapeInvite(updated, posting?.slug || "");
}

export async function restoreInvite(id: string) {
  await dbConnect();
  const updated: any = await JobInvite.findOneAndUpdate({ _id: id, appliedAt: null }, { $unset: { cancelledAt: 1 } }, { new: true }).lean();
  if (!updated) throw new Error("This invite no longer exists.");
  const posting = await postingSlug(updated.posting);
  return shapeInvite(updated, posting?.slug || "");
}

export async function deleteInvite(id: string) {
  await dbConnect();
  await JobInvite.deleteOne({ _id: id });
}

/**
 * The invite behind a /careers/[slug]?invite= link, for filling the form in.
 * Only for the same opening and while it has not been cancelled. Marks it
 * opened the first time.
 */
export async function inviteForForm(token: string, postingId: string) {
  const clean = String(token || "").trim();
  if (!/^[a-f0-9]{32}$/i.test(clean)) return null;
  await dbConnect();
  const invite: any = await JobInvite.findOne({ token: clean, posting: postingId, cancelledAt: null }).lean();
  if (!invite) return null;
  if (!invite.openedAt && !invite.appliedAt) await JobInvite.updateOne({ _id: invite._id, openedAt: null }, { $set: { openedAt: new Date() } });
  return { token: clean, name: str(invite.name), email: str(invite.email), countryCode: str(invite.countryCode) || "+91", phone: str(invite.phone) };
}

/** The invite id for a token on this opening, so the application can point at it. */
export async function inviteIdForToken(token: unknown, postingId: unknown) {
  const clean = String(token || "").trim();
  if (!/^[a-f0-9]{32}$/i.test(clean)) return undefined;
  const invite: any = await JobInvite.findOne({ token: clean, posting: postingId }).select("_id").lean();
  return invite?._id as Types.ObjectId | undefined;
}

/**
 * Called when an application is submitted: marks its invite applied - the
 * one whose link it came through, else any open invite to the same opening
 * for the same WhatsApp number (they may have applied from /careers directly).
 */
export async function markInviteApplied(application: { _id: unknown; posting: unknown; countryCode?: string; phone?: string; invite?: unknown }) {
  await dbConnect();
  const set = { $set: { appliedAt: new Date(), application: application._id } };
  if (application.invite) {
    const linked = await JobInvite.updateOne({ _id: application.invite, appliedAt: null }, set);
    if (linked.modifiedCount) return;
  }
  if (application.phone) {
    await JobInvite.updateMany({ posting: application.posting, countryCode: application.countryCode || "+91", phone: application.phone, appliedAt: null }, set);
  }
}

/**
 * The one automatic reminder: 3 days after the invite, to anyone who has not
 * applied and was not resent by hand since, while the opening is still taking
 * applications. Only 10:00-19:00 IST. Claimed per invite, so it goes once.
 */
export async function processInviteReminders(now = new Date()) {
  const hour = istHour(now);
  if (hour < AUTO_REMINDER_HOURS_IST.from || hour >= AUTO_REMINDER_HOURS_IST.to) return { sent: 0 };
  await dbConnect();
  const due: any[] = await JobInvite.find({
    appliedAt: null,
    cancelledAt: null,
    autoReminderAt: null,
    sendCount: 1,
    lastSentAt: { $lte: new Date(now.getTime() - AUTO_REMINDER_AFTER_MS) },
  })
    .limit(100)
    .lean();
  let sent = 0;
  const postings = new Map<string, any>();
  for (const invite of due) {
    const key = str(invite.posting);
    if (!postings.has(key)) postings.set(key, await postingSlug(invite.posting));
    const posting = postings.get(key);
    const claimed = await JobInvite.updateOne({ _id: invite._id, autoReminderAt: null, appliedAt: null, cancelledAt: null }, { $set: { autoReminderAt: now } });
    if (!claimed.modifiedCount) continue;
    if (!posting || !isPostingAcceptingApplications(posting, now)) continue;
    await deliver(invite, posting.slug, "auto", "Automatic reminder");
    sent += 1;
  }
  return { sent };
}
