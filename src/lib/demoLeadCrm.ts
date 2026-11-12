import "server-only";

import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { ownerCandidates } from "@/lib/demoLeadOwner";
import { demoLeadOwnerForTurn, demoLeadRotationNames, resolveDemoLeadRotation } from "@/lib/demoLeadRotation";
import {
  DEMO_AGE_GROUP_VALUES,
  DEMO_CHILD_LEVEL_VALUES,
  DEMO_LEAD_STAGE_VALUES,
  DEMO_REQUEST_KIND,
  MANUAL_LEAD_SOURCES,
  SUBMITTED_DEMO_REQUEST,
  demoLeadStage,
  demoLeadStageLabel,
  manualLeadSourceLabel,
  type DemoLeadStage,
} from "@/lib/demoRequest";
import { CONTACT_INTEREST_VALUES, ONLINE_INTEREST, contactDisplayPhone } from "@/lib/contactEnquiries";
import { exactNationalNumber, exactPhoneNumberProblem } from "@/lib/phoneCountryCodes";
import { demoSlotLabel } from "@/lib/demoRequestSlots";
import { LEAD_CHANNELS, summarizeLeadSource, type LeadChannel, type LeadSourceSummary } from "@/lib/leadSource";
import {
  REMINDERS_PER_LEAD_MAX,
  REMINDER_NOTE_MAX,
  callLogText,
  checkReminderTime,
  isDemoLeadCallOutcome,
  missedCallReminderTime,
  parseMissedCallReminderChoice,
} from "@/lib/demoLeadCalls";
import { formatAcademyDateTime } from "@/lib/academyTime";
import {
  cancelDemoLeadCallTask,
  cancelDemoLeadReminderTask,
  reassignDemoLeadReminderTasks,
  raiseDemoRequestTask,
  reassignDemoRequestTask,
  resolveDemoLeadCallTask,
  resolveDemoLeadReminderTasks,
} from "@/lib/tasks/taskTriggers";
import { ContactMessage, DemoLeadRotation } from "@/models/ContactMessage";
import { DemoLeadReminder } from "@/models/DemoLeadReminder";
import { User } from "@/models/User";
import { WhatsAppOtp } from "@/models/WhatsAppOtp";

/**
 * The Demo Leads CRM: every request from the free demo form
 * (/book-free-demo-class/form), and nothing else.
 *
 * Each lead is given to one salesperson in turn once it is submitted, which
 * means once the family has entered the WhatsApp code (see SUBMITTED_DEMO_REQUEST).
 * Admins and built-in sub-admins see every lead; anyone on a named access role
 * (the salespeople, marketing) sees only the leads they own, and every write
 * here re-checks that, so a guessed id opens nothing.
 */

const ROTATION_KEY = "demo-request";
const LIST_LIMIT = 300;

export type DemoLeadViewer = { id: string; name: string; seesAll: boolean };

export async function demoLeadViewer(viewer: { id: string; name: string }): Promise<DemoLeadViewer> {
  await dbConnect();
  const user: any = Types.ObjectId.isValid(viewer.id) ? await User.findById(viewer.id).select("role accessRole").lean() : null;
  const seesAll = user?.role === "admin" || (user?.role === "sub-admin" && !user?.accessRole);
  return { id: viewer.id, name: viewer.name, seesAll };
}

/** The salespeople the form's leads rotate between, in order. */
export async function demoLeadRotation() {
  return resolveDemoLeadRotation(demoLeadRotationNames(), await ownerCandidates());
}

/**
 * Gives an unowned lead to whoever's turn it is. Safe to call twice: the turn
 * is only spent on a lead that still has no owner. Returns the lead as it now is.
 */
export async function assignDemoLeadOwner(leadId: unknown) {
  await dbConnect();
  const unowned = { _id: leadId, kind: DEMO_REQUEST_KIND, salesOwner: null };
  const lead: any = await ContactMessage.findOne(unowned).select("phone countryCode").lean();
  if (!lead) return ContactMessage.findById(leadId).lean();

  const rotation = await demoLeadRotation();
  if (!rotation.length) {
    console.error("[demo-leads] nobody in the rotation matches a staff account; lead left unassigned", demoLeadRotationNames());
    return ContactMessage.findById(leadId).lean();
  }

  // A family who fills the form again (a second child, a second try) stays with
  // the salesperson who already has their number, and does not use up a turn.
  const earlier: any = await ContactMessage.findOne({ kind: DEMO_REQUEST_KIND, phone: lead.phone, countryCode: lead.countryCode, salesOwner: { $ne: null } })
    .sort({ createdAt: -1 })
    .select("salesOwner")
    .lean();
  const sameOwner = earlier ? rotation.find((candidate) => candidate.userId === String(earlier.salesOwner)) : undefined;
  let owner = sameOwner;
  if (!owner) {
    const counter: any = await DemoLeadRotation.findOneAndUpdate({ key: ROTATION_KEY }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
    owner = demoLeadOwnerForTurn(Number(counter?.seq || 1), rotation)!;
  }
  const how = sameOwner ? ", who already has this number" : " by rotation";
  const now = new Date();
  const claimed: any = await ContactMessage.findOneAndUpdate(
    unowned,
    {
      $set: { salesOwner: owner.userId, salesOwnerName: owner.name || owner.email, salesAssignedAt: now },
      $push: { leadLog: { kind: "owner", text: `Assigned to ${owner.name || owner.email}${how}`, byName: "System", at: now } },
    },
    { new: true },
  ).lean();
  if (claimed) {
    // A lead older than the CRM already has a call task in the sales pool.
    await reassignDemoRequestTask(leadId, owner.userId);
    return claimed;
  }
  return ContactMessage.findById(leadId).lean();
}

/** Leads saved before the CRM existed, oldest first so the turns follow the order they arrived in. */
async function assignLeadsWithoutOwner() {
  const waiting: any[] = await ContactMessage.find({ kind: DEMO_REQUEST_KIND, salesOwner: null, ...SUBMITTED_DEMO_REQUEST }).sort({ createdAt: 1 }).limit(100).select("_id").lean();
  for (const lead of waiting) await assignDemoLeadOwner(lead._id);
}

/** `lead` opens one lead on its own: the link in a reminder email and task. */
export type DemoLeadFilters = { stage: DemoLeadStage | "all"; owner: string; query: string; channel: LeadChannel | "all"; lead: string };

export function parseDemoLeadFilters(params: Record<string, string | string[] | undefined>): DemoLeadFilters {
  const single = (key: string) => {
    const value = params[key];
    return String(Array.isArray(value) ? value[0] : value || "").trim();
  };
  const stage = single("stage");
  const owner = single("owner");
  const channel = single("source");
  const lead = single("lead");
  return {
    stage: (DEMO_LEAD_STAGE_VALUES as readonly string[]).includes(stage) ? (stage as DemoLeadStage) : "all",
    owner: owner === "none" || Types.ObjectId.isValid(owner) ? owner : "all",
    query: single("q").slice(0, 80),
    channel: LEAD_CHANNELS.some((item) => item.value === channel) ? (channel as LeadChannel) : "all",
    lead: Types.ObjectId.isValid(lead) ? lead : "",
  };
}

export function demoLeadsHref(filters: DemoLeadFilters, change: Partial<DemoLeadFilters> = {}) {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.stage !== "all") params.set("stage", next.stage);
  if (next.owner !== "all") params.set("owner", next.owner);
  if (next.query) params.set("q", next.query);
  if (next.channel !== "all") params.set("source", next.channel);
  if (next.lead) params.set("lead", next.lead);
  const search = params.toString();
  return search ? `/sales/leads?${search}` : "/sales/leads";
}

export type DemoLeadRow = {
  id: string;
  name: string;
  source: LeadSourceSummary;
  email: string;
  countryCode: string;
  phone: string;
  ageGroup: string;
  childLevel: string;
  interest: string;
  preferredTime: string;
  demoSlot: string;
  whatsappVerified: boolean;
  otpFailed: boolean;
  /** Typed in by a salesperson, so there was never a WhatsApp code to check. */
  manual: boolean;
  stage: DemoLeadStage;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  log: Array<{ kind: string; outcome: string; text: string; byName: string; at: string }>;
  /** Reminders still waiting to fire ("scheduled") or fired with no call logged since ("sent"), soonest first. */
  reminders: Array<{ id: string; dueAt: string; note: string; status: "scheduled" | "sent"; forId: string; forName: string; byName: string }>;
};

/** The Source column for a lead added by hand: how the family reached us, and who typed it in. */
function manualLeadSummary(doc: any): LeadSourceSummary {
  const how = manualLeadSourceLabel(doc.manualSource);
  return {
    channel: "manual",
    headline: `Added by hand · ${how}`,
    details: [
      { label: "How they reached us", value: how },
      { label: "Added by", value: String(doc.addedByName || "") },
    ].filter((item) => item.value),
  };
}

/** What the viewer may see, before any filter they chose. */
function scopeFor(viewer: DemoLeadViewer): Record<string, unknown> {
  // A request still waiting for its WhatsApp code was never submitted.
  const scope: Record<string, unknown> = { kind: DEMO_REQUEST_KIND, ...SUBMITTED_DEMO_REQUEST };
  if (!viewer.seesAll) scope.salesOwner = new Types.ObjectId(viewer.id);
  return scope;
}

function stageMatch(stage: DemoLeadStage) {
  return stage === "new" ? { $in: ["new", null] } : stage;
}

export async function getDemoLeads(viewer: DemoLeadViewer, filters: DemoLeadFilters) {
  await dbConnect();
  if (viewer.seesAll) await assignLeadsWithoutOwner();

  const scope = scopeFor(viewer);
  // The owner filter is an admin's tool. A salesperson's scope already pins the owner to themselves.
  if (viewer.seesAll && filters.owner !== "all") scope.salesOwner = filters.owner === "none" ? null : new Types.ObjectId(filters.owner);

  const where: Record<string, unknown> = { ...scope };
  if (filters.lead) where._id = new Types.ObjectId(filters.lead);
  if (filters.stage !== "all") where.leadStage = stageMatch(filters.stage);
  // Leads from before sources were recorded have no channel and count as "Not recorded".
  if (filters.channel !== "all") where.leadChannel = filters.channel === "unknown" ? { $in: ["unknown", null] } : filters.channel;
  if (filters.query) {
    const pattern = new RegExp(filters.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    where.$or = [
      { name: pattern },
      { phone: pattern },
      { email: pattern },
      { "leadSource.utm_campaign": pattern },
      { "leadSource.utm_term": pattern },
      { "leadSource.utm_content": pattern },
    ];
  }

  const [docs, total, grouped, owners] = await Promise.all([
    ContactMessage.find(where).sort({ createdAt: -1 }).limit(LIST_LIMIT).lean(),
    ContactMessage.countDocuments(where),
    ContactMessage.aggregate([{ $match: scope }, { $group: { _id: { $ifNull: ["$leadStage", "new"] }, count: { $sum: 1 } } }]),
    viewer.seesAll ? demoLeadRotation() : Promise.resolve([]),
  ]);

  const stageCounts = Object.fromEntries([["all", 0], ...DEMO_LEAD_STAGE_VALUES.map((stage) => [stage, 0])]) as Record<DemoLeadStage | "all", number>;
  for (const entry of grouped as Array<{ _id: string; count: number }>) {
    stageCounts[demoLeadStage(entry._id)] += entry.count;
    stageCounts.all += entry.count;
  }

  const openReminders: any[] = docs.length
    ? await DemoLeadReminder.find({ lead: { $in: (docs as any[]).map((doc) => doc._id) }, status: { $in: ["scheduled", "sent"] } })
        .sort({ dueAt: 1 })
        .lean()
    : [];
  const remindersByLead = new Map<string, DemoLeadRow["reminders"]>();
  for (const reminder of openReminders) {
    const key = String(reminder.lead);
    const list = remindersByLead.get(key) || [];
    list.push({
      id: String(reminder._id),
      dueAt: new Date(reminder.dueAt).toISOString(),
      note: String(reminder.note || ""),
      status: reminder.status === "sent" ? "sent" : "scheduled",
      forId: String(reminder.assignedTo || ""),
      forName: String(reminder.assignedToName || ""),
      byName: String(reminder.createdByName || ""),
    });
    remindersByLead.set(key, list);
  }

  const rows: DemoLeadRow[] = (docs as any[]).map((doc) => ({
    id: String(doc._id),
    name: String(doc.name || ""),
    source: doc.leadEntry === "manual" ? manualLeadSummary(doc) : summarizeLeadSource(doc.leadSource),
    manual: doc.leadEntry === "manual",
    email: String(doc.email || ""),
    countryCode: String(doc.countryCode || ""),
    phone: String(doc.phone || ""),
    ageGroup: String(doc.ageGroup || ""),
    childLevel: String(doc.childLevel || ""),
    interest: String(doc.interest || ""),
    preferredTime: String(doc.preferredTime || ""),
    demoSlot: demoSlotLabel(doc.demoSlotDate, doc.demoSlotTime),
    whatsappVerified: Boolean(doc.whatsappVerifiedAt),
    otpFailed: Boolean(doc.otpFailedAt),
    stage: demoLeadStage(doc.leadStage),
    ownerId: doc.salesOwner ? String(doc.salesOwner) : "",
    ownerName: String(doc.salesOwnerName || ""),
    createdAt: new Date(doc.createdAt).toISOString(),
    log: (doc.leadLog || []).map((entry: any) => ({
      kind: String(entry.kind || "note"),
      outcome: String(entry.outcome || ""),
      text: String(entry.text || ""),
      byName: String(entry.byName || ""),
      at: new Date(entry.at || doc.createdAt).toISOString(),
    })),
    reminders: remindersByLead.get(String(doc._id)) || [],
  }));

  return {
    rows,
    total,
    stageCounts,
    owners: owners.map((owner) => ({ id: owner.userId, name: owner.name || owner.email })),
  };
}

/** The lead, if this viewer may touch it. */
function ownLead(viewer: DemoLeadViewer, leadId: string) {
  if (!Types.ObjectId.isValid(leadId)) return null;
  return { ...scopeFor(viewer), _id: new Types.ObjectId(leadId) };
}

export async function setDemoLeadStage(viewer: DemoLeadViewer, leadId: string, stage: string) {
  const match = ownLead(viewer, leadId);
  if (!match || !(DEMO_LEAD_STAGE_VALUES as readonly string[]).includes(stage)) return false;
  await dbConnect();
  const now = new Date();
  const result = await ContactMessage.updateOne(
    { ...match, leadStage: stage === "new" ? { $nin: ["new", null] } : { $ne: stage } },
    {
      $set: { leadStage: stage, leadStageAt: now },
      $push: { leadLog: { kind: "stage", text: `Moved to ${demoLeadStageLabel(stage)}`, by: viewer.id, byName: viewer.name, at: now } },
    },
  );
  if (!result.modifiedCount) return false;
  if (stage !== "new") await resolveDemoLeadCallTask(leadId, viewer.id);
  return true;
}

export async function addDemoLeadNote(viewer: DemoLeadViewer, leadId: string, text: string) {
  const match = ownLead(viewer, leadId);
  const note = text.trim().slice(0, 1000);
  if (!match || !note) return false;
  await dbConnect();
  const result = await ContactMessage.updateOne(match, { $push: { leadLog: { kind: "note", text: note, by: viewer.id, byName: viewer.name, at: new Date() } } });
  return Boolean(result.modifiedCount);
}

/**
 * Picked up or Missed, stamped with the server's clock (never a typed time),
 * with optional remarks. Any reminder that already fired for this lead is
 * settled, and a picked-up call settles the first "call this parent" task too,
 * since someone has now spoken to the family. A missed call leaves it open.
 *
 * A missed call also sets a call-back for the caller (`remindChoice`, two hours
 * by default, see missedCallReminderTime), unless they chose "Don't remind me"
 * or already have a reminder waiting on this lead, which is their own plan.
 */
export async function logDemoLeadCall(viewer: DemoLeadViewer, leadId: string, outcome: string, remarks: string, remindChoice?: unknown) {
  const match = ownLead(viewer, leadId);
  if (!match || !isDemoLeadCallOutcome(outcome)) return false;
  await dbConnect();
  const now = new Date();
  const result = await ContactMessage.updateOne(match, {
    $push: { leadLog: { kind: "call", outcome, text: callLogText(outcome, remarks), by: viewer.id, byName: viewer.name, at: now } },
  });
  if (!result.modifiedCount) return false;
  await DemoLeadReminder.updateMany({ lead: leadId, status: "sent" }, { $set: { status: "done", doneAt: now } });
  await resolveDemoLeadReminderTasks(leadId, viewer.id);
  if (outcome === "picked_up") await resolveDemoLeadCallTask(leadId, viewer.id);

  if (outcome === "missed") {
    const at = missedCallReminderTime(parseMissedCallReminderChoice(remindChoice), now);
    const waiting = at ? await DemoLeadReminder.exists({ lead: leadId, assignedTo: viewer.id, status: "scheduled" }) : true;
    if (at && !waiting) {
      const note = `Missed call at ${formatAcademyDateTime(now, { day: undefined, month: undefined, year: undefined, timeZoneName: "short" })}, try again`;
      await createDemoLeadReminder(viewer, match, at, note, "Reminder set automatically after a missed call");
    }
  }
  return true;
}

/** Saves a reminder for the viewer on a lead they may touch, and notes it in the lead's history. */
async function createDemoLeadReminder(viewer: DemoLeadViewer, match: Record<string, unknown>, at: Date, note: string, heading: string) {
  const lead: any = await ContactMessage.findOne(match).select("name").lean();
  if (!lead) return false;
  await DemoLeadReminder.create({
    lead: lead._id,
    leadName: lead.name || "",
    assignedTo: viewer.id,
    assignedToName: viewer.name,
    createdBy: viewer.id,
    createdByName: viewer.name,
    dueAt: at,
    note,
  });
  const label = formatAcademyDateTime(at, { timeZoneName: "short" });
  await ContactMessage.updateOne(match, {
    $push: { leadLog: { kind: "reminder", text: `${heading} for ${label}${note ? `: ${note}` : ""}`, by: viewer.id, byName: viewer.name, at: new Date() } },
  });
  return true;
}

export type ReminderResult = { ok: true } | { ok: false; error: string };

/** A call-back reminder for the viewer themselves: an email and a task at `dueAt`. */
export async function setDemoLeadReminder(viewer: DemoLeadViewer, leadId: string, dueAt: Date | null, noteText: string): Promise<ReminderResult> {
  const match = ownLead(viewer, leadId);
  if (!match) return { ok: false, error: "This lead is not yours to set reminders on." };
  const time = checkReminderTime(dueAt);
  if (!time.ok) return time;
  await dbConnect();
  const lead: any = await ContactMessage.findOne(match).select("name").lean();
  if (!lead) return { ok: false, error: "This lead is not yours to set reminders on." };
  const open = await DemoLeadReminder.countDocuments({ lead: lead._id, assignedTo: viewer.id, status: "scheduled" });
  if (open >= REMINDERS_PER_LEAD_MAX) return { ok: false, error: `You already have ${REMINDERS_PER_LEAD_MAX} reminders on this lead. Remove one first.` };

  await createDemoLeadReminder(viewer, match, time.at, noteText.trim().slice(0, REMINDER_NOTE_MAX), "Reminder set");
  return { ok: true };
}

/** The viewer's own open call-backs across every lead, soonest first, for the strip at the top of the page. */
export async function getMyDemoLeadReminders(viewer: DemoLeadViewer, limit = 20) {
  if (!Types.ObjectId.isValid(viewer.id)) return [];
  await dbConnect();
  const reminders: any[] = await DemoLeadReminder.find({ assignedTo: viewer.id, status: { $in: ["scheduled", "sent"] } })
    .sort({ dueAt: 1 })
    .limit(limit)
    .lean();
  return reminders.map((reminder) => ({
    id: String(reminder._id),
    leadId: String(reminder.lead),
    leadName: String(reminder.leadName || "A parent"),
    dueAt: new Date(reminder.dueAt).toISOString(),
    note: String(reminder.note || ""),
    due: reminder.status === "sent",
  }));
}

/** The person it is for removes it; admins may remove anyone's. Works before or after it fired. */
export async function cancelDemoLeadReminder(viewer: DemoLeadViewer, reminderId: string) {
  if (!Types.ObjectId.isValid(reminderId)) return false;
  await dbConnect();
  const reminder: any = await DemoLeadReminder.findOne({ _id: reminderId, status: { $in: ["scheduled", "sent"] } }).lean();
  if (!reminder) return false;
  if (!viewer.seesAll && String(reminder.assignedTo) !== viewer.id) return false;
  const match = ownLead(viewer, String(reminder.lead));
  if (!match || !(await ContactMessage.exists(match))) return false;

  const now = new Date();
  const result = await DemoLeadReminder.updateOne({ _id: reminder._id, status: reminder.status }, { $set: { status: "cancelled", cancelledAt: now } });
  if (!result.modifiedCount) return false;
  await cancelDemoLeadReminderTask(reminder._id, `${viewer.name || "Someone"} removed the reminder.`);
  const label = formatAcademyDateTime(reminder.dueAt, { timeZoneName: "short" });
  await ContactMessage.updateOne(match, {
    $push: { leadLog: { kind: "reminder", text: `Reminder for ${label} removed`, by: viewer.id, byName: viewer.name, at: now } },
  });
  return true;
}

export type ManualLeadInput = {
  name: string;
  countryCode: string;
  phone: string;
  email: string;
  ageGroup: string;
  childLevel: string;
  interest: string;
  preferredTime: string;
  manualSource: string;
  note: string;
  /** Admins only: a rotation salesperson's id, or "" for whoever's turn it is. */
  owner: string;
};

export type ManualLeadResult = { ok: true; id: string } | { ok: false; error: string; existingId?: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A lead a salesperson types in: a parent who phoned, walked in, or was
 * referred, and never filled the form (2026-11-13). It joins the same list,
 * stages, calls and reminders as a form lead, marked "Added by hand".
 *
 * One lead per WhatsApp number, as on the form: a number already in the CRM is
 * refused and the existing lead named, so nobody works a family twice. A
 * half-finished form for the number (still waiting for its code) is taken over
 * rather than duplicated. A salesperson owns what they add; an admin picks a
 * salesperson or lets the rotation choose, and that salesperson gets the usual
 * "call this parent" task.
 */
export async function addManualDemoLead(viewer: DemoLeadViewer, input: ManualLeadInput): Promise<ManualLeadResult> {
  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) return { ok: false, error: "Enter the parent's name." };
  const countryCode = `+${input.countryCode.replace(/[^\d]/g, "") || "91"}`;
  const problem = exactPhoneNumberProblem(input.phone, countryCode);
  if (problem) return { ok: false, error: problem };
  const phone = exactNationalNumber(input.phone, countryCode);
  const email = input.email.trim().toLowerCase().slice(0, 160);
  if (email && !EMAIL_PATTERN.test(email)) return { ok: false, error: "That email address doesn't look right. Leave it empty if you don't have one." };
  const manualSource = MANUAL_LEAD_SOURCES.some((item) => item.value === input.manualSource) ? input.manualSource : "";
  if (!manualSource) return { ok: false, error: "Choose how the family reached us." };

  await dbConnect();
  const existing: any = await ContactMessage.findOne({ kind: DEMO_REQUEST_KIND, countryCode, phone, ...SUBMITTED_DEMO_REQUEST })
    .sort({ createdAt: -1 })
    .select("name salesOwner salesOwnerName")
    .lean();
  if (existing) {
    const mine = viewer.seesAll || String(existing.salesOwner || "") === viewer.id;
    const owner = existing.salesOwnerName ? `, with ${existing.salesOwnerName}` : "";
    return {
      ok: false,
      error: `${contactDisplayPhone(countryCode, phone)} is already a lead (${existing.name || "no name"}${owner}). One lead per number, so it was not added again.`,
      ...(mine ? { existingId: String(existing._id) } : {}),
    };
  }

  // Owner: the salesperson themselves, or for an admin the chosen salesperson / the rotation.
  let owner: { userId: string; name: string } | null = null;
  if (!viewer.seesAll) owner = { userId: viewer.id, name: viewer.name };
  else if (input.owner) {
    const picked = (await demoLeadRotation()).find((candidate) => candidate.userId === input.owner);
    if (!picked) return { ok: false, error: "Choose a salesperson from the list." };
    owner = { userId: picked.userId, name: picked.name || picked.email };
  }

  const now = new Date();
  const how = manualLeadSourceLabel(manualSource);
  const log: Array<Record<string, unknown>> = [{ kind: "owner", text: `Added by hand by ${viewer.name} (${how})`, by: viewer.id, byName: viewer.name, at: now }];
  if (owner && owner.userId !== viewer.id) log.push({ kind: "owner", text: `Assigned to ${owner.name}`, by: viewer.id, byName: viewer.name, at: now });
  const note = input.note.trim().slice(0, 1000);
  if (note) log.push({ kind: "note", text: note, by: viewer.id, byName: viewer.name, at: now });

  const fields: Record<string, unknown> = {
    kind: DEMO_REQUEST_KIND,
    awaitingCode: false,
    // Counts as "already with sales", so the family filling the form later is refused and noted on this lead.
    announcedAt: now,
    name,
    ...(email ? { email } : {}),
    countryCode,
    phone,
    ageGroup: (DEMO_AGE_GROUP_VALUES as readonly string[]).includes(input.ageGroup) ? input.ageGroup : "",
    childLevel: (DEMO_CHILD_LEVEL_VALUES as readonly string[]).includes(input.childLevel) ? input.childLevel : "",
    interest: CONTACT_INTEREST_VALUES.includes(input.interest) ? input.interest : ONLINE_INTEREST,
    preferredTime: input.preferredTime.trim().slice(0, 120),
    leadChannel: "manual",
    leadEntry: "manual",
    manualSource,
    addedBy: viewer.id,
    addedByName: viewer.name,
    leadStage: "new",
    leadStageAt: now,
    ...(owner ? { salesOwner: owner.userId, salesOwnerName: owner.name, salesAssignedAt: now } : { salesOwner: null }),
  };

  // A form for this number abandoned at the code step is the same family: reuse its row.
  const abandoned: any = await ContactMessage.findOneAndUpdate(
    { kind: DEMO_REQUEST_KIND, countryCode, phone, awaitingCode: true },
    { $set: fields, $push: { leadLog: { $each: log } } },
    { new: true, sort: { createdAt: -1 } },
  ).lean();
  const lead: any = abandoned || (await ContactMessage.create({ ...fields, leadLog: log })).toObject();
  const id = String(lead._id);

  // The rotation spends a turn on it, exactly as for a form lead.
  const assigned: any = owner ? lead : await assignDemoLeadOwner(id);
  if (assigned?.salesOwner && String(assigned.salesOwner) !== viewer.id) await raiseDemoRequestTask(assigned);
  return { ok: true, id };
}

/** Admins only: hand a lead to the other salesperson. Does not move the rotation. */
export async function reassignDemoLead(viewer: DemoLeadViewer, leadId: string, ownerId: string) {
  if (!viewer.seesAll || !Types.ObjectId.isValid(leadId)) return false;
  const owner = (await demoLeadRotation()).find((candidate) => candidate.userId === ownerId);
  if (!owner) return false;
  await dbConnect();
  const now = new Date();
  const before: any = await ContactMessage.findOneAndUpdate(
    { _id: leadId, kind: DEMO_REQUEST_KIND, salesOwner: { $ne: new Types.ObjectId(ownerId) } },
    {
      $set: { salesOwner: owner.userId, salesOwnerName: owner.name || owner.email, salesAssignedAt: now },
      $push: { leadLog: { kind: "owner", text: `Reassigned to ${owner.name || owner.email}`, by: viewer.id, byName: viewer.name, at: now } },
    },
    { new: false },
  )
    .select("salesOwner")
    .lean();
  if (!before) return false;
  await reassignDemoRequestTask(leadId, owner.userId);
  // The previous owner's call-backs go with the lead; an admin's own reminders stay theirs.
  if (before.salesOwner) {
    const moving: any[] = await DemoLeadReminder.find({ lead: leadId, assignedTo: before.salesOwner, status: { $in: ["scheduled", "sent"] } }).select("_id").lean();
    if (moving.length) {
      await DemoLeadReminder.updateMany(
        { _id: { $in: moving.map((reminder) => reminder._id) } },
        { $set: { assignedTo: owner.userId, assignedToName: owner.name || owner.email } },
      );
      await reassignDemoLeadReminderTasks(moving.map((reminder) => reminder._id), owner.userId);
    }
  }
  return true;
}

/**
 * Removes a lead for good, with its open call task and any unused WhatsApp code.
 * Admins may delete any lead; a salesperson only the leads they own (user's
 * call, 2026-11-12), through the same scope as every other write here. The
 * rotation counter is left alone, so the next lead still goes to whoever's turn
 * it is. Returns the deleted lead's name and number for the activity log, or
 * null when nothing was deleted.
 */
export async function deleteDemoLead(viewer: DemoLeadViewer, leadId: string) {
  const match = ownLead(viewer, leadId);
  if (!match) return null;
  await dbConnect();
  const deleted: any = await ContactMessage.findOneAndDelete(match).select("name phone countryCode").lean();
  if (!deleted) return null;
  await cancelDemoLeadCallTask(leadId);
  const reminders: any[] = await DemoLeadReminder.find({ lead: leadId, status: { $in: ["scheduled", "sent"] } }).select("_id").lean();
  if (reminders.length) {
    await DemoLeadReminder.updateMany({ _id: { $in: reminders.map((reminder) => reminder._id) } }, { $set: { status: "cancelled", cancelledAt: new Date() } });
    for (const reminder of reminders) await cancelDemoLeadReminderTask(reminder._id, "The lead was deleted from the Demo Leads CRM.");
  }
  await WhatsAppOtp.deleteOne({ reference: leadId }).catch(() => undefined);
  return { name: String(deleted.name || ""), phone: `${deleted.countryCode || ""}${deleted.phone || ""}` };
}
