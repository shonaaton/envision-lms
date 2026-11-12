import "server-only";

import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { ownerCandidates } from "@/lib/demoLeadOwner";
import { demoLeadOwnerForTurn, demoLeadRotationNames, resolveDemoLeadRotation } from "@/lib/demoLeadRotation";
import { DEMO_LEAD_STAGE_VALUES, DEMO_REQUEST_KIND, SUBMITTED_DEMO_REQUEST, demoLeadStage, demoLeadStageLabel, type DemoLeadStage } from "@/lib/demoRequest";
import { demoSlotLabel } from "@/lib/demoRequestSlots";
import { LEAD_CHANNELS, summarizeLeadSource, type LeadChannel, type LeadSourceSummary } from "@/lib/leadSource";
import { cancelDemoLeadCallTask, reassignDemoRequestTask, resolveDemoLeadCallTask } from "@/lib/tasks/taskTriggers";
import { ContactMessage, DemoLeadRotation } from "@/models/ContactMessage";
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

export type DemoLeadFilters = { stage: DemoLeadStage | "all"; owner: string; query: string; channel: LeadChannel | "all" };

export function parseDemoLeadFilters(params: Record<string, string | string[] | undefined>): DemoLeadFilters {
  const single = (key: string) => {
    const value = params[key];
    return String(Array.isArray(value) ? value[0] : value || "").trim();
  };
  const stage = single("stage");
  const owner = single("owner");
  const channel = single("source");
  return {
    stage: (DEMO_LEAD_STAGE_VALUES as readonly string[]).includes(stage) ? (stage as DemoLeadStage) : "all",
    owner: owner === "none" || Types.ObjectId.isValid(owner) ? owner : "all",
    query: single("q").slice(0, 80),
    channel: LEAD_CHANNELS.some((item) => item.value === channel) ? (channel as LeadChannel) : "all",
  };
}

export function demoLeadsHref(filters: DemoLeadFilters, change: Partial<DemoLeadFilters> = {}) {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.stage !== "all") params.set("stage", next.stage);
  if (next.owner !== "all") params.set("owner", next.owner);
  if (next.query) params.set("q", next.query);
  if (next.channel !== "all") params.set("source", next.channel);
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
  stage: DemoLeadStage;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  log: Array<{ kind: string; text: string; byName: string; at: string }>;
};

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

  const rows: DemoLeadRow[] = (docs as any[]).map((doc) => ({
    id: String(doc._id),
    name: String(doc.name || ""),
    source: summarizeLeadSource(doc.leadSource),
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
      text: String(entry.text || ""),
      byName: String(entry.byName || ""),
      at: new Date(entry.at || doc.createdAt).toISOString(),
    })),
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

/** Admins only: hand a lead to the other salesperson. Does not move the rotation. */
export async function reassignDemoLead(viewer: DemoLeadViewer, leadId: string, ownerId: string) {
  if (!viewer.seesAll || !Types.ObjectId.isValid(leadId)) return false;
  const owner = (await demoLeadRotation()).find((candidate) => candidate.userId === ownerId);
  if (!owner) return false;
  await dbConnect();
  const now = new Date();
  const result = await ContactMessage.updateOne(
    { _id: leadId, kind: DEMO_REQUEST_KIND, salesOwner: { $ne: new Types.ObjectId(ownerId) } },
    {
      $set: { salesOwner: owner.userId, salesOwnerName: owner.name || owner.email, salesAssignedAt: now },
      $push: { leadLog: { kind: "owner", text: `Reassigned to ${owner.name || owner.email}`, by: viewer.id, byName: viewer.name, at: now } },
    },
  );
  if (!result.modifiedCount) return false;
  await reassignDemoRequestTask(leadId, owner.userId);
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
  await WhatsAppOtp.deleteOne({ reference: leadId }).catch(() => undefined);
  return { name: String(deleted.name || ""), phone: `${deleted.countryCode || ""}${deleted.phone || ""}` };
}
