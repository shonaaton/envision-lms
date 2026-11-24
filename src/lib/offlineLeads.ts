import "server-only";

import { Types } from "mongoose";
import { getCentrePage } from "@/lib/centrePages";
import { dbConnect } from "@/lib/db";
import { leadFromOfflineCrm } from "@/lib/branch/leads";
import { sendGraphMessage } from "@/lib/whatsappMeta";
import { normalizeWhatsAppNumber, sanitizeWhatsAppParameter } from "@/lib/whatsappAutomation";
import { renderWhatsAppTemplatePreview } from "@/lib/whatsappTemplateRegistry";
import { ContactMessage } from "@/models/ContactMessage";
import { OfflineLead, OFFLINE_BRANCHES, type OfflineBranch } from "@/models/OfflineLead";
import { WhatsAppMessage } from "@/models/WhatsApp";
import {
  OFFLINE_LEAD_ASSIGNMENT_TEMPLATE,
  OFFLINE_LEAD_REMINDER_TEMPLATE,
  offlineLeadOutcomePayload,
  parseOfflineLeadOutcomePayload,
} from "./offlineLeadRules";

export type OfflineLeadActor = { id: string; name: string; seesAll?: boolean };
export type OfflineLeadInput = {
  branch: string;
  parentName: string;
  studentName?: string;
  countryCode?: string;
  phone: string;
  email?: string;
  note?: string;
};

const LABELS: Record<OfflineBranch, string> = {
  bowbazar: "Bowbazar",
  "new-alipore": "New Alipore",
  haridevpur: "Haridevpur",
  "jodhpur-park": "Jodhpur Park",
};

export const OFFLINE_BRANCH_OPTIONS = OFFLINE_BRANCHES.map((value) => ({ value, label: LABELS[value] }));

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function branchValue(value: string): OfflineBranch | null {
  return (OFFLINE_BRANCHES as readonly string[]).includes(value) ? (value as OfflineBranch) : null;
}

function phoneParts(countryCode: string, phone: string) {
  const code = `+${countryCode.replace(/\D/g, "") || "91"}`;
  const national = phone.replace(/\D/g, "");
  const full = normalizeWhatsAppNumber(`${code}${national}`);
  return { code, national, full };
}

function centre(branch: OfflineBranch) {
  const page = getCentrePage(branch);
  if (!page) throw new Error(`The ${LABELS[branch]} centre page is missing.`);
  return page;
}

function valuesFor(lead: any) {
  const page = centre(lead.branch);
  const phone = `${lead.countryCode || ""} ${lead.phone || ""}`.trim();
  return [
    page.contactName,
    LABELS[lead.branch as OfflineBranch],
    lead.parentName,
    lead.studentName || "Not shared",
    phone,
    lead.email || "Not shared",
    lead.note || "No note",
  ].map((value) => sanitizeWhatsAppParameter(value) || "Not shared");
}

function outcomeComponents(id: string) {
  return [
    { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: offlineLeadOutcomePayload(id, "converted") }] },
    { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: offlineLeadOutcomePayload(id, "lost") }] },
  ];
}

async function logOutbound(lead: any, templateName: string, values: string[], result: { metaMessageId?: string; error?: string }) {
  const recipient = String(lead.centreContactPhone || "").replace(/\D/g, "");
  await WhatsAppMessage.create({
    phoneNumber: normalizeWhatsAppNumber(recipient),
    contactName: lead.centreContactName,
    direction: "outbound",
    messageType: "template",
    text: renderWhatsAppTemplatePreview(templateName, values),
    templateName,
    templateLanguage: "en",
    status: result.metaMessageId ? "accepted" : "failed",
    metaMessageId: result.metaMessageId || undefined,
    error: result.error || "",
    rawPayload: { sender: "meta", metadata: { automation: "offline_lead", offlineLeadId: String(lead._id) }, templateVariables: values },
    sentAt: new Date(),
  }).catch(() => undefined);
}

async function sendCentreTemplate(lead: any, templateName: string, values: string[]) {
  const id = String(lead._id);
  try {
    const { metaMessageId } = await sendGraphMessage({
      to: String(lead.centreContactPhone || "").replace(/\D/g, ""),
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components: [
          { type: "body", parameters: values.map((text) => ({ type: "text", text })) },
          ...outcomeComponents(id),
        ],
      },
    });
    await logOutbound(lead, templateName, values, { metaMessageId });
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "WhatsApp send failed");
    await logOutbound(lead, templateName, values, { error: message });
    return { ok: false as const, error: message.slice(0, 500) };
  }
}

async function create(input: OfflineLeadInput, actor: OfflineLeadActor, sourceDemoLead?: any) {
  const branch = branchValue(clean(input.branch, 30));
  if (!branch) return { ok: false as const, error: "Choose an offline branch." };
  const parentName = clean(input.parentName, 120);
  if (parentName.length < 2) return { ok: false as const, error: "Enter the parent's name." };
  const parsedPhone = phoneParts(clean(input.countryCode, 8), clean(input.phone, 30));
  if (parsedPhone.full.length < 10 || parsedPhone.full.length > 15) return { ok: false as const, error: "Enter a valid WhatsApp number." };
  const email = clean(input.email, 160).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false as const, error: "Enter a valid email address or leave it blank." };

  await dbConnect();
  if (sourceDemoLead) {
    const existing: any = await OfflineLead.findOne({ sourceDemoLead: sourceDemoLead._id }).lean();
    if (existing) return { ok: true as const, id: String(existing._id), existing: true };
  }
  const page = centre(branch);
  const now = new Date();
  const external = branch !== "bowbazar";
  const lead: any = await OfflineLead.create({
    branch,
    parentName,
    studentName: clean(input.studentName, 120),
    countryCode: parsedPhone.code,
    phone: parsedPhone.national,
    email,
    note: clean(input.note, 1500),
    source: sourceDemoLead ? "demo_crm" : "manual",
    sourceDemoLead: sourceDemoLead?._id,
    createdBy: Types.ObjectId.isValid(actor.id) ? actor.id : undefined,
    createdByName: actor.name,
    centreContactName: page.contactName,
    centreContactPhone: page.phone,
    day5DueAt: external ? new Date(now.getTime() + 5 * 86_400_000) : undefined,
    day10DueAt: external ? new Date(now.getTime() + 10 * 86_400_000) : undefined,
    history: [{ kind: "created", text: `Created for ${LABELS[branch]}`, byName: actor.name, at: now }],
  });

  if (sourceDemoLead) {
    await ContactMessage.updateOne(
      { _id: sourceDemoLead._id, offlineLead: null },
      {
        $set: { offlineLead: lead._id, offlineBranch: branch },
        $push: { leadLog: { kind: "stage", text: `Moved to Offline Leads: ${LABELS[branch]}`, by: actor.id, byName: actor.name, at: now } },
      },
    );
  }

  if (branch === "bowbazar") {
    try {
      const bowbazar: any = await leadFromOfflineCrm("bowbazar", lead.toObject());
      await OfflineLead.updateOne(
        { _id: lead._id },
        { $set: { bowbazarLead: bowbazar._id, assignmentSentAt: new Date() }, $push: { history: { kind: "sent", text: "Routed to the Bowbazar Lead Center; the family received live slots and fees.", byName: "System", at: new Date() } } },
      );
    } catch (error) {
      await OfflineLead.updateOne({ _id: lead._id }, { $set: { assignmentError: String(error).slice(0, 500) } });
    }
  } else {
    const sent = await sendCentreTemplate(lead.toObject(), OFFLINE_LEAD_ASSIGNMENT_TEMPLATE, valuesFor(lead));
    await OfflineLead.updateOne(
      { _id: lead._id },
      sent.ok
        ? { $set: { assignmentSentAt: new Date() }, $push: { history: { kind: "sent", text: `WhatsApp sent to ${page.contactName}.`, byName: "System", at: new Date() } } }
        : { $set: { assignmentError: sent.error } },
    );
  }
  return { ok: true as const, id: String(lead._id), existing: false };
}

export async function createOfflineLead(input: OfflineLeadInput, actor: OfflineLeadActor) {
  return create(input, actor);
}

export async function moveDemoLeadOffline(demoLeadId: string, branch: string, actor: OfflineLeadActor) {
  if (!Types.ObjectId.isValid(demoLeadId)) return { ok: false as const, error: "Demo lead not found." };
  await dbConnect();
  const match: Record<string, unknown> = { _id: demoLeadId, kind: "demo_request", offlineLead: null };
  if (!actor.seesAll) match.salesOwner = actor.id;
  const source: any = await ContactMessage.findOne(match).lean();
  if (!source) return { ok: false as const, error: "This demo lead is unavailable or has already been moved." };
  return create(
    {
      branch,
      parentName: source.name,
      studentName: "",
      countryCode: source.countryCode,
      phone: source.phone,
      email: source.email,
      note: [source.preferredTime ? `Preferred call time: ${source.preferredTime}` : "", source.message || ""].filter(Boolean).join("\n"),
    },
    actor,
    source,
  );
}

export async function listOfflineLeads() {
  await dbConnect();
  const rows: any[] = await OfflineLead.find({}).sort({ createdAt: -1 }).limit(500).lean();
  return rows.map((lead) => ({
    id: String(lead._id),
    branch: lead.branch as OfflineBranch,
    branchLabel: LABELS[lead.branch as OfflineBranch],
    parentName: String(lead.parentName || ""),
    studentName: String(lead.studentName || ""),
    phone: `${lead.countryCode || ""} ${lead.phone || ""}`.trim(),
    email: String(lead.email || ""),
    note: String(lead.note || ""),
    status: lead.status as "open" | "converted" | "lost",
    source: lead.source as "manual" | "demo_crm",
    createdByName: String(lead.createdByName || ""),
    centreContactName: String(lead.centreContactName || ""),
    centreContactPhone: String(lead.centreContactPhone || ""),
    assignment: lead.assignmentSentAt ? "sent" : lead.assignmentError ? `failed: ${lead.assignmentError}` : "pending",
    day5Sent: Boolean(lead.day5SentAt),
    day10Sent: Boolean(lead.day10SentAt),
    createdAt: new Date(lead.createdAt).toISOString(),
    outcomeAt: lead.outcomeAt ? new Date(lead.outcomeAt).toISOString() : "",
    outcomeBy: String(lead.outcomeBy || ""),
  }));
}

export async function setOfflineLeadOutcome(id: string, outcome: string, byName: string) {
  if (!Types.ObjectId.isValid(id) || !["converted", "lost"].includes(outcome)) return false;
  await dbConnect();
  const now = new Date();
  const result = await OfflineLead.updateOne(
    { _id: id, status: "open" },
    {
      $set: { status: outcome, outcomeAt: now, outcomeBy: byName },
      $push: { history: { kind: "outcome", text: outcome === "converted" ? "Admission taken" : "Lead marked lost", byName, at: now } },
    },
  );
  if (result.modifiedCount) {
    // The lead lives in Demo Leads ("Offline lead" stage): note the answer there,
    // and a lost lead moves to Lost. (Converted needs an invoice there, so it is a note.)
    const lead: any = await OfflineLead.findById(id).select("sourceDemoLead branch centreContactName").lean();
    if (lead?.sourceDemoLead) {
      const label = LABELS[lead.branch as OfflineBranch] || lead.branch;
      const text = outcome === "converted" ? `${label} centre: admission taken (${byName})` : `${label} centre: lead lost (${byName})`;
      await ContactMessage.updateOne(
        { _id: lead.sourceDemoLead },
        {
          ...(outcome === "lost" ? { $set: { leadStage: "lost", leadStageAt: now } } : {}),
          $push: { leadLog: { kind: outcome === "lost" ? "stage" : "note", text, byName: lead.centreContactName || byName, at: now } },
        },
      ).catch(() => undefined);
    }
  }
  return Boolean(result.modifiedCount);
}

export async function resendOfflineLeadAssignment(id: string) {
  if (!Types.ObjectId.isValid(id)) return { ok: false as const, error: "Lead not found." };
  await dbConnect();
  const lead: any = await OfflineLead.findOne({ _id: id, status: "open", branch: { $ne: "bowbazar" } }).lean();
  if (!lead) return { ok: false as const, error: "Only an open non-Bowbazar lead can be resent." };
  const sent = await sendCentreTemplate(lead, OFFLINE_LEAD_ASSIGNMENT_TEMPLATE, valuesFor(lead));
  await OfflineLead.updateOne(
    { _id: lead._id },
    sent.ok
      ? { $set: { assignmentSentAt: new Date() }, $unset: { assignmentError: 1 }, $push: { history: { kind: "sent", text: `Assignment WhatsApp resent to ${lead.centreContactName}.`, byName: "System", at: new Date() } } }
      : { $set: { assignmentError: sent.error } },
  );
  return sent;
}

async function sendReminder(lead: any, day: 5 | 10) {
  const base = valuesFor(lead);
  const values = [base[0], String(day), base[1], base[2], base[4]];
  const sent = await sendCentreTemplate(lead, OFFLINE_LEAD_REMINDER_TEMPLATE, values);
  const prefix = day === 5 ? "day5" : "day10";
  await OfflineLead.updateOne(
    { _id: lead._id, status: "open" },
    sent.ok
      ? { $set: { [`${prefix}SentAt`]: new Date() }, $unset: { [`${prefix}Error`]: 1 } }
      : { $set: { [`${prefix}Error`]: sent.error }, $unset: { [`${prefix}ClaimedAt`]: 1 } },
  );
  return sent.ok;
}

export async function processDueOfflineLeadReminders(now = new Date()) {
  await dbConnect();
  const counts = { day5: 0, day10: 0 };
  for (const day of [5, 10] as const) {
    const prefix = day === 5 ? "day5" : "day10";
    for (let count = 0; count < 50; count++) {
      const lead: any = await OfflineLead.findOneAndUpdate(
        { status: "open", branch: { $ne: "bowbazar" }, [`${prefix}DueAt`]: { $lte: now }, [`${prefix}SentAt`]: null, [`${prefix}ClaimedAt`]: null },
        { $set: { [`${prefix}ClaimedAt`]: now } },
        { new: true, sort: { [`${prefix}DueAt`]: 1 } },
      ).lean();
      if (!lead) break;
      if (await sendReminder(lead, day)) counts[prefix] += 1;
    }
  }
  return counts;
}

export async function handleOfflineLeadButtonReply(message: any) {
  const payload = message?.type === "button" ? message.button?.payload : message?.type === "interactive" ? message.interactive?.button_reply?.id : "";
  const parsed = parseOfflineLeadOutcomePayload(payload);
  if (!parsed) return false;
  const changed = await setOfflineLeadOutcome(parsed.leadId, parsed.outcome, "Centre in-charge via WhatsApp");
  if (changed) {
    const lead: any = await OfflineLead.findById(parsed.leadId).lean();
    if (lead) {
      await sendGraphMessage({
        to: String(lead.centreContactPhone || "").replace(/\D/g, ""),
        type: "text",
        text: { preview_url: false, body: parsed.outcome === "converted" ? `Recorded: ${lead.parentName}'s lead has converted. Further reminders are stopped.` : `Recorded: ${lead.parentName}'s lead is lost. Further reminders are stopped.` },
      }).catch(() => undefined);
    }
  }
  return true;
}

