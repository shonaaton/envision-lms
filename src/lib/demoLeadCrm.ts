import "server-only";

import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { ownerCandidates } from "@/lib/demoLeadOwner";
import {
  campaignCapiReady,
  demoConvertedEventId,
  demoSlotEventId,
  sendDemoLeadMetaEvent,
  type DemoLeadEventBrowser,
} from "@/lib/demoLeadMetaEvents";
import { demoLeadOwnerForTurn, demoLeadRotationNames, resolveDemoLeadRotation } from "@/lib/demoLeadRotation";
import { DEMO_LEAD_STAGE_VALUES, DEMO_REQUEST_KIND, demoLeadStage, demoLeadStageLabel, type DemoLeadStage } from "@/lib/demoRequest";
import { demoSlotLabel } from "@/lib/demoRequestSlots";
import { reassignDemoRequestTask, resolveDemoLeadCallTask } from "@/lib/tasks/taskTriggers";
import { ContactMessage, DemoLeadRotation } from "@/models/ContactMessage";
import { User } from "@/models/User";

/**
 * The Demo Leads CRM: every request from the free demo form
 * (/book-free-demo-class/form), and nothing else.
 *
 * Each lead is given to one salesperson in turn when the form is first saved.
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
  const waiting: any[] = await ContactMessage.find({ kind: DEMO_REQUEST_KIND, salesOwner: null }).sort({ createdAt: 1 }).limit(100).select("_id").lean();
  for (const lead of waiting) await assignDemoLeadOwner(lead._id);
}

export type DemoLeadFilters = { stage: DemoLeadStage | "all"; owner: string; query: string };

export function parseDemoLeadFilters(params: Record<string, string | string[] | undefined>): DemoLeadFilters {
  const single = (key: string) => {
    const value = params[key];
    return String(Array.isArray(value) ? value[0] : value || "").trim();
  };
  const stage = single("stage");
  const owner = single("owner");
  return {
    stage: (DEMO_LEAD_STAGE_VALUES as readonly string[]).includes(stage) ? (stage as DemoLeadStage) : "all",
    owner: owner === "none" || Types.ObjectId.isValid(owner) ? owner : "all",
    query: single("q").slice(0, 80),
  };
}

export function demoLeadsHref(filters: DemoLeadFilters, change: Partial<DemoLeadFilters> = {}) {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.stage !== "all") params.set("stage", next.stage);
  if (next.owner !== "all") params.set("owner", next.owner);
  if (next.query) params.set("q", next.query);
  const search = params.toString();
  return search ? `/sales/leads?${search}` : "/sales/leads";
}

export type DemoLeadRow = {
  id: string;
  name: string;
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
  const scope: Record<string, unknown> = { kind: DEMO_REQUEST_KIND };
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
  if (filters.query) {
    const pattern = new RegExp(filters.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    where.$or = [{ name: pattern }, { phone: pattern }];
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
  if (stage === "demo_taken") await reportDemoBooked(leadId);
  if (stage === "converted") await reportDemoConverted(leadId);
  return true;
}

/**
 * Tells Meta a demo was booked, once per lead. Called when the family picks a
 * slot on the thank-you page (`browser` is theirs) and when sales moves the
 * lead to "Demo taken" - whichever comes first, since a demo arranged on a
 * call never passes through the thank-you page.
 */
export async function reportDemoBooked(leadId: string, browser?: DemoLeadEventBrowser) {
  if (!campaignCapiReady()) return;
  await dbConnect();
  const lead: any = await ContactMessage.findOneAndUpdate(
    { _id: leadId, kind: DEMO_REQUEST_KIND, metaScheduleAt: null },
    { $set: { metaScheduleAt: new Date() } },
    { new: true },
  ).lean();
  if (lead) await sendDemoLeadMetaEvent({ lead, eventName: "Schedule", eventId: demoSlotEventId(leadId), browser });
}

/** Tells Meta the lead became a student, once per lead, however often the stage is set again. */
async function reportDemoConverted(leadId: string) {
  if (!campaignCapiReady()) return;
  const lead: any = await ContactMessage.findOneAndUpdate(
    { _id: leadId, kind: DEMO_REQUEST_KIND, metaConvertedAt: null },
    { $set: { metaConvertedAt: new Date() } },
    { new: true },
  ).lean();
  if (lead) await sendDemoLeadMetaEvent({ lead, eventName: "CompleteRegistration", eventId: demoConvertedEventId(leadId) });
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
