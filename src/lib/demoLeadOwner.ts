import "server-only";

import { Types } from "mongoose";
import { formatAcademyDateTime } from "@/lib/academyTime";
import { recordActivity } from "@/lib/activity";
import { emailKey, phoneKey } from "@/lib/crm/identity";
import { matchLeadOwner, ownerSignals, type LeadOwnerCandidate } from "@/lib/crm/leadOwner";
import { dbConnect } from "@/lib/db";
import { SALES_ACCESS_ROLE_NAME_KEY } from "@/lib/demoNotificationRecipients";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { normalizeGoogleMeetUrl } from "@/lib/meetingUrl";
import { AccessRole } from "@/models/AccessRole";
import { Booking } from "@/models/Booking";
import { CrmLeadRecord } from "@/models/CrmLeadRecord";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * Routing demo leads to the salesperson who owns them.
 *
 * Kraya assigns each lead through an attribute named after the salesperson
 * ("Sayandeb Lead", "Shazib Lead"); the mirror keeps it on
 * `CrmLeadRecord.attributes`. That owner - not the whole sales bench - is who
 * has to act, so:
 *
 * - a demo booking is stamped with `salesOwner`, the owner is told, and the demo
 *   shows on their dashboard with the Google Meet link to sit in on the class;
 * - a demo account that signed up but never requested a demo is flagged to its
 *   owner after a grace period, so the lead gets a call instead of expiring.
 *
 * Booking attribution runs from both directions because either can arrive
 * first: the booking route (lead already mirrored) and the Kraya webhook (owner
 * attribute lands later). The `salesOwnerNotifiedAt` claim notifies once.
 */

export const LEAD_OWNER_DASHBOARD_HREF = "/dashboard";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Demo accounts are valid for 14 days; older ones are not worth chasing from here. */
const DEMO_ACCOUNT_WINDOW_MS = 14 * DAY_MS;

/** Demos still ahead of the class - the only ones worth routing to an owner. */
const ATTRIBUTABLE_DEMO_STATUSES = ["REQUESTED", "COACH_ASSIGNED", "APPROVED", "CLASSROOM_CREATED", "RESCHEDULE_REQUESTED"];
const HIDDEN_DEMO_STATUSES = ["CLOSED", "CANCELLED"];
const STUDENT_FIELDS = "name email phone countryCode parentName createdAt demoExpiresAt";

export type LeadOwnerEvent = "booked" | "rescheduled" | "confirmed";

export type ResolvedLeadOwner = { userId: string; name: string; attributeKey: string; crmLeadId: string };

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/** Hours to wait before an unbooked demo account is flagged - most parents book within minutes. */
export function unbookedFollowUpDelayMs() {
  const raw = String(process.env.DEMO_UNBOOKED_FOLLOWUP_HOURS ?? "").trim();
  const hours = raw ? Number(raw) : NaN;
  return (Number.isFinite(hours) && hours >= 0 ? hours : 2) * HOUR_MS;
}

async function salesRoleIds() {
  const roles: any[] = await AccessRole.find({ nameKey: SALES_ACCESS_ROLE_NAME_KEY, archivedAt: null }).select("_id").lean();
  return roles.map((role) => String(role._id));
}

/** Staff accounts a lead can belong to: admins, sub-admins and anyone on a named role. */
async function ownerCandidates(): Promise<LeadOwnerCandidate[]> {
  const [users, salesIds]: [any[], string[]] = await Promise.all([
    User.find({
      isActive: { $ne: false },
      role: { $ne: "student" },
      $or: [{ role: { $in: ["admin", "sub-admin"] } }, { accessRole: { $ne: null } }],
    })
      .select("_id name email accessRole")
      .lean(),
    salesRoleIds(),
  ]);
  const sales = new Set(salesIds);
  return users.map((user) => ({
    userId: String(user._id),
    name: String(user.name || ""),
    email: String(user.email || ""),
    isSales: Boolean(user.accessRole && sales.has(String(user.accessRole))),
  }));
}

export async function isSalesStaff(userId: string) {
  if (!Types.ObjectId.isValid(userId)) return false;
  const [user, salesIds]: [any, string[]] = await Promise.all([
    User.findById(userId).select("accessRole").lean(),
    salesRoleIds(),
  ]);
  return Boolean(user?.accessRole && salesIds.includes(String(user.accessRole)));
}

/**
 * The lead owner for each student, from their mirrored CRM record. One pass over
 * the mirror and the staff directory however many students are asked about, so
 * list pages can label every row.
 */
export async function leadOwnersForStudents(students: any[]): Promise<Map<string, ResolvedLeadOwner>> {
  const result = new Map<string, ResolvedLeadOwner>();
  const list = [...new Map(students.filter((student) => student?._id).map((student) => [String(student._id), student])).values()];
  if (!list.length) return result;

  const phones = Array.from(new Set(list.map((student) => phoneKey(student.phone)).filter(Boolean)));
  const emails = Array.from(new Set(list.map((student) => emailKey(student.email)).filter(Boolean)));
  const or: any[] = [{ portalUser: { $in: list.map((student) => student._id) } }];
  if (phones.length) or.push({ phoneKey: { $in: phones } });
  if (emails.length) or.push({ emailKey: { $in: emails } });

  const records: any[] = await CrmLeadRecord.find({ $or: or })
    .select("crmLeadId portalUser phoneKey emailKey attributes attributeChangedAt lastEventAt")
    .sort({ lastEventAt: -1 })
    .lean();
  const owned = records.filter((record) => ownerSignals(record.attributes).length);
  if (!owned.length) return result;

  const candidates = await ownerCandidates();
  for (const student of list) {
    const studentId = String(student._id);
    const phone = phoneKey(student.phone);
    const email = emailKey(student.email);
    // Records are newest first; the linked account wins, then phone, then email -
    // the same strength order the rest of the CRM identity code uses.
    const record =
      owned.find((row) => String(row.portalUser || "") === studentId) ||
      (phone ? owned.find((row) => row.phoneKey === phone) : undefined) ||
      (email ? owned.find((row) => row.emailKey === email) : undefined);
    if (!record) continue;
    const match = matchLeadOwner(record.attributes, candidates, record.attributeChangedAt);
    if (match) {
      result.set(studentId, { userId: match.owner.userId, name: match.owner.name, attributeKey: match.attributeKey, crmLeadId: String(record.crmLeadId || "") });
    }
  }
  return result;
}

function contactOf(student: any) {
  return [student?.countryCode, student?.phone].filter(Boolean).join(" ").trim() || String(student?.email || "");
}

async function notifyOwner(input: {
  ownerId: string;
  student: any;
  type: string;
  title: string;
  message: string;
  dedupKey: string;
  metadata?: Record<string, unknown>;
}) {
  const owner: any = await User.findById(input.ownerId).select("_id name email").lean();
  if (!owner) return false;
  const inserted = await Notification.updateOne(
    { user: owner._id, "metadata.dedupKey": input.dedupKey },
    {
      $setOnInsert: {
        user: owner._id,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: { ...input.metadata, studentId: idOf(input.student?._id), href: LEAD_OWNER_DASHBOARD_HREF, event: "DEMO_LEAD_OWNER", dedupKey: input.dedupKey },
      },
    },
    { upsert: true }
  );
  if (!inserted.upsertedCount) return false;

  if (owner.email) {
    await sendAutomationEmail({
      to: owner.email,
      subject: `${input.title}: ${input.student?.name || "your lead"}`,
      message: [
        `Hello ${owner.name || "there"},`,
        "",
        input.message,
        `Contact: ${contactOf(input.student) || "no contact on file"}.`,
        ...(input.student?.parentName ? [`Parent: ${input.student.parentName}.`] : []),
        "",
        "Open your academy dashboard for the details.",
      ].join("\n"),
      metadata: { kind: "demo_lead_owner", event: input.type, ...input.metadata, href: LEAD_OWNER_DASHBOARD_HREF },
    }).catch(() => null);
  }
  return true;
}

async function notifyOwnerOfBooking(input: { ownerId: string; booking: any; event: LeadOwnerEvent; coachName?: string }) {
  const { booking, event } = input;
  const student = booking.student || {};
  const studentName = student.name || "Your lead";
  const scheduled = formatAcademyDateTime(booking.startAt, { timeZoneName: "short" });
  const time = event === "booked" && booking.requestedIstDateTime ? booking.requestedIstDateTime : scheduled;
  const copy: Record<LeadOwnerEvent, { title: string; message: string }> = {
    booked: { title: "Your lead booked a demo", message: `${studentName} booked a demo for ${time}. It is on your dashboard.` },
    rescheduled: { title: "Your lead changed their demo time", message: `${studentName} asked to move their demo to ${time}.` },
    confirmed: {
      title: "Your lead's demo is confirmed",
      message: `${studentName}'s demo is confirmed for ${time}${input.coachName ? ` with ${input.coachName}` : ""}. Join the Google Meet from your dashboard.`,
    },
  };
  const bookingId = idOf(booking._id);
  return notifyOwner({
    ownerId: input.ownerId,
    student,
    type: `demo.lead_owner.${event}`,
    ...copy[event],
    // One notice per event per slot: a repeat approve on the same time is not
    // news, but a move to a new time is.
    dedupKey: `demo_lead_owner:${event}:${bookingId}:${new Date(booking.startAt).toISOString()}:${input.ownerId}`,
    metadata: { booking: booking._id, bookingId },
  });
}

/**
 * Stamp a demo booking with its lead owner and tell them. Safe to call
 * repeatedly: it notifies only when the booking gains an owner or changes owner.
 */
export async function attributeDemoToLeadOwner(bookingId: string) {
  if (!Types.ObjectId.isValid(String(bookingId))) return { attributed: false, reason: "Invalid booking id." };
  await dbConnect();
  const booking: any = await Booking.findById(bookingId)
    .select("bookingType demoStatus archivedAt student startAt requestedIstDateTime salesOwner salesOwnerNotifiedAt")
    .populate("student", STUDENT_FIELDS)
    .lean();
  if (!booking || booking.bookingType !== "demo" || booking.archivedAt) return { attributed: false, reason: "Not an open demo." };
  if (!ATTRIBUTABLE_DEMO_STATUSES.includes(String(booking.demoStatus))) return { attributed: false, reason: "Demo is past routing." };
  if (!booking.student?._id) return { attributed: false, reason: "Demo has no student." };

  const owner = (await leadOwnersForStudents([booking.student])).get(String(booking.student._id));
  if (!owner) return { attributed: false, reason: "No lead owner found on the CRM record." };

  const now = new Date();
  const claimed = await Booking.updateOne(
    { _id: booking._id, $or: [{ salesOwner: { $ne: new Types.ObjectId(owner.userId) } }, { salesOwnerNotifiedAt: null }] },
    {
      $set: {
        salesOwner: owner.userId,
        salesOwnerName: owner.name,
        salesOwnerAttribute: owner.attributeKey,
        salesOwnerAttributedAt: now,
        salesOwnerNotifiedAt: now,
      },
    }
  );
  if (!claimed.modifiedCount) return { attributed: true, ownerId: owner.userId, notified: false };

  await notifyOwnerOfBooking({ ownerId: owner.userId, booking, event: "booked" });
  await recordActivity({
    targetUser: idOf(booking.student._id),
    type: "demo.lead_owner.attributed",
    label: `Demo routed to ${owner.name || "lead owner"}`,
    entityType: "Booking",
    entityId: idOf(booking._id),
    metadata: { ownerId: owner.userId, attribute: owner.attributeKey, crmLeadId: owner.crmLeadId, previousOwner: idOf(booking.salesOwner) },
  });
  return { attributed: true, ownerId: owner.userId, notified: true };
}

/** Tell the owner that their lead's demo moved or was confirmed. */
export async function notifyLeadOwnerOfDemo(input: { bookingId: string; event: Exclude<LeadOwnerEvent, "booked">; coachName?: string }) {
  if (!Types.ObjectId.isValid(String(input.bookingId))) return;
  await dbConnect();
  // A booking the webhook never got to still deserves an owner before it is confirmed.
  const routed = await attributeDemoToLeadOwner(input.bookingId);
  const booking: any = await Booking.findById(input.bookingId)
    .select("startAt requestedIstDateTime salesOwner student")
    .populate("student", STUDENT_FIELDS)
    .lean();
  if (!booking?.salesOwner) return;
  // A just-routed owner already heard about the booking at its new time.
  if (routed.notified && input.event === "rescheduled") return;
  await notifyOwnerOfBooking({ ownerId: idOf(booking.salesOwner), booking, event: input.event, coachName: input.coachName });
}

/**
 * Kraya webhook entry point: the lead's owner may have only just arrived, so
 * route any open demo the lead already has. Never throws into the webhook.
 */
export async function attributeLeadDemosFromCrm(input: { crmLeadId: string; userId?: string }) {
  if (!input.crmLeadId) return;
  const record: any = await CrmLeadRecord.findOne({ crmLeadId: input.crmLeadId }).select("portalUser attributes").lean();
  if (!record || !ownerSignals(record.attributes).length) return;
  const studentId = input.userId || (record.portalUser ? String(record.portalUser) : "");
  if (!studentId || !Types.ObjectId.isValid(studentId)) return;
  const bookings: any[] = await Booking.find({
    student: studentId,
    bookingType: "demo",
    archivedAt: null,
    demoStatus: { $in: ATTRIBUTABLE_DEMO_STATUSES },
  })
    .select("_id")
    .lean();
  for (const booking of bookings) {
    await attributeDemoToLeadOwner(String(booking._id)).catch((error) => console.error("Lead owner attribution failed", error));
  }
}

/** Recent, active demo accounts that have never requested a demo class. */
async function unbookedDemoAccounts(input: { createdAfter: Date; createdBefore?: Date; limit: number }) {
  const accounts: any[] = await User.find({
    role: "student",
    accountStatus: "demo",
    isActive: { $ne: false },
    createdAt: { $gte: input.createdAfter, ...(input.createdBefore ? { $lte: input.createdBefore } : {}) },
  })
    .select(STUDENT_FIELDS)
    .sort({ createdAt: -1 })
    .limit(input.limit)
    .lean();
  if (!accounts.length) return [];
  // Any demo booking at all - even one later cancelled - means the lead did ask,
  // and belongs to the demo funnel's own follow-up, not this one.
  const booked = new Set((await Booking.distinct("student", { bookingType: "demo", student: { $in: accounts.map((account) => account._id) } })).map(String));
  return accounts.filter((account) => !booked.has(String(account._id)));
}

/**
 * Scheduled sweep, run with the demo reminders cron.
 *
 * - Flags each demo account that signed up but has not requested a demo to its
 *   lead owner, once, after `DEMO_UNBOOKED_FOLLOWUP_HOURS` (default 2).
 * - Routes open demos that were booked before the lead had an owner attribute.
 */
export async function processLeadOwnerFollowUps(now = new Date()) {
  await dbConnect();
  const accounts = await unbookedDemoAccounts({
    createdAfter: new Date(now.getTime() - DEMO_ACCOUNT_WINDOW_MS),
    createdBefore: new Date(now.getTime() - unbookedFollowUpDelayMs()),
    limit: 500,
  });
  const owners = await leadOwnersForStudents(accounts);

  let followUpsSent = 0;
  for (const account of accounts) {
    const owner = owners.get(String(account._id));
    if (!owner) continue;
    const sent = await notifyOwner({
      ownerId: owner.userId,
      student: account,
      type: "demo.lead_owner.unbooked",
      title: "Your lead has not booked a demo",
      message: `${account.name || "A lead"} created a demo account on ${formatAcademyDateTime(account.createdAt, { timeZoneName: "short" })} but has not requested a demo class yet. Please call them and help them pick a time.`,
      dedupKey: `demo_lead_owner:unbooked:${String(account._id)}:${owner.userId}`,
      metadata: { demoUserId: String(account._id) },
    }).catch(() => false);
    if (sent) followUpsSent++;
  }

  const unrouted: any[] = await Booking.find({
    bookingType: "demo",
    archivedAt: null,
    salesOwner: null,
    demoStatus: { $in: ATTRIBUTABLE_DEMO_STATUSES },
  })
    .select("_id")
    .limit(100)
    .lean();
  let bookingsRouted = 0;
  for (const booking of unrouted) {
    const result = await attributeDemoToLeadOwner(String(booking._id)).catch(() => null);
    if (result?.attributed) bookingsRouted++;
  }

  return { unbookedAccounts: accounts.length, withoutOwner: accounts.length - owners.size, followUpsSent, bookingsRouted };
}

const DEMO_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Requested",
  COACH_ASSIGNED: "Coach assigned",
  APPROVED: "Confirmed",
  CLASSROOM_CREATED: "Confirmed",
  RESCHEDULE_REQUESTED: "Reschedule requested",
  ASSESSMENT_PENDING: "Assessment pending",
  COMPLETED: "Completed",
  STUDENT_NO_SHOW: "Student no-show",
  ABSENT: "Absent",
  CONVERTED: "Converted",
};

export type DemoBoardScope = "mine" | "all";

export type LeadOwnerDemoView = {
  id: string;
  studentName: string;
  parentName: string;
  contact: string;
  statusLabel: string;
  confirmed: boolean;
  needsNewTime: boolean;
  startAt: string;
  endAt: string;
  timeLabel: string;
  coachName: string;
  meetingUrl: string;
  ownerName: string;
};

export type UnbookedAccountView = {
  id: string;
  studentName: string;
  parentName: string;
  contact: string;
  signedUpLabel: string;
  /** Past the follow-up delay, i.e. the owner has been (or is about to be) nudged. */
  overdue: boolean;
  ownerName: string;
};

function toDemoView(booking: any, ownerName: string): LeadOwnerDemoView {
  const student = booking.student || {};
  const status = String(booking.demoStatus || "");
  return {
    id: idOf(booking._id),
    studentName: String(student.name || "Prospect"),
    parentName: String(booking.parentName || student.parentName || ""),
    contact: contactOf(student),
    statusLabel: DEMO_STATUS_LABELS[status] || status || "Requested",
    confirmed: ["APPROVED", "CLASSROOM_CREATED"].includes(status),
    needsNewTime: Boolean(booking.needsNewTime),
    startAt: new Date(booking.startAt).toISOString(),
    endAt: new Date(booking.endAt || booking.startAt).toISOString(),
    timeLabel: formatAcademyDateTime(booking.startAt, { timeZoneName: "short" }),
    coachName: String(booking.assignedCoach?.name || ""),
    // The classroom holds the link the coach and student actually use, and it is
    // what an admin edits later; the booking copy is the fallback.
    meetingUrl: normalizeGoogleMeetUrl(booking.classroom?.meetingUrl) || normalizeGoogleMeetUrl(booking.meetingUrl),
    ownerName,
  };
}

/**
 * Demo board for a dashboard. `mine` is a salesperson's own routed demos and
 * unbooked accounts; `all` is the whole academy for admins, labelled with the
 * salesperson so they can see who is holding what.
 */
export async function getDemoBoard(input: { viewerId: string; scope: DemoBoardScope }) {
  const empty = { upcoming: [] as LeadOwnerDemoView[], recent: [] as LeadOwnerDemoView[], unbooked: [] as UnbookedAccountView[] };
  if (input.scope === "mine" && !Types.ObjectId.isValid(String(input.viewerId))) return empty;
  await dbConnect();
  const now = Date.now();
  const all = input.scope === "all";
  const base = { bookingType: "demo", archivedAt: null, ...(all ? {} : { salesOwner: input.viewerId }) };
  const populate = (query: any) =>
    query
      .select("student parentName demoStatus startAt endAt needsNewTime assignedCoach classroom meetingUrl salesOwner salesOwnerName")
      .populate("student", STUDENT_FIELDS)
      .populate("assignedCoach", "name")
      .populate("classroom", "meetingUrl")
      .lean();

  const [upcoming, recent, accounts]: [any[], any[], any[]] = await Promise.all([
    populate(
      Booking.find({
        ...base,
        demoStatus: { $in: ATTRIBUTABLE_DEMO_STATUSES },
        // Kept up for an hour past the end so the room is still reachable when a
        // class runs over.
        $or: [{ endAt: { $gte: new Date(now - HOUR_MS) } }, { needsNewTime: true }],
      })
        .sort({ startAt: 1 })
        .limit(all ? 60 : 30)
    ),
    populate(
      Booking.find({
        ...base,
        startAt: { $gte: new Date(now - DEMO_ACCOUNT_WINDOW_MS), $lt: new Date(now) },
        demoStatus: { $nin: [...HIDDEN_DEMO_STATUSES, ...ATTRIBUTABLE_DEMO_STATUSES] },
      })
        .sort({ startAt: -1 })
        .limit(all ? 20 : 10)
    ),
    unbookedDemoAccounts({ createdAfter: new Date(now - DEMO_ACCOUNT_WINDOW_MS), limit: 300 }),
  ]);

  // Demos booked before routing existed have no stamp yet; label them live so an
  // admin still sees whose they are.
  const unroutedStudents = [...upcoming, ...recent].filter((booking) => !booking.salesOwner).map((booking) => booking.student);
  const owners = await leadOwnersForStudents([...accounts, ...unroutedStudents]);
  const ownerNameOf = (booking: any) => String(booking.salesOwnerName || owners.get(idOf(booking.student?._id))?.name || "");

  const delay = unbookedFollowUpDelayMs();
  const unbooked = accounts
    .filter((account) => all || owners.get(String(account._id))?.userId === String(input.viewerId))
    .map((account) => ({
      id: String(account._id),
      studentName: String(account.name || "Prospect"),
      parentName: String(account.parentName || ""),
      contact: contactOf(account),
      signedUpLabel: formatAcademyDateTime(account.createdAt, { timeZoneName: "short" }),
      overdue: now - new Date(account.createdAt).getTime() >= delay,
      ownerName: owners.get(String(account._id))?.name || "",
    }));

  return {
    upcoming: upcoming.map((booking) => toDemoView(booking, ownerNameOf(booking))),
    recent: recent.map((booking) => toDemoView(booking, ownerNameOf(booking))),
    unbooked,
  };
}
