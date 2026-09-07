import "server-only";

import { CrmLeadRecord } from "@/models/CrmLeadRecord";
import { emailKey, findUserForCrmContact, phoneKey } from "@/lib/crm/identity";

/**
 * Writing the local mirror of a CRM lead.
 *
 * Kept apart from `sync.ts` on purpose. `sync.ts` decides what a stage *means* -
 * whether a demo should close, reopen, or convert - and that logic is tested and
 * load-bearing. This file only records what the CRM said, and must never change
 * a booking. Keeping the two separate means extending the mirror cannot break
 * the demo funnel.
 */

/** Payload keys the portal understands. Everything else is a custom attribute. */
const KNOWN_KEYS = new Set([
  "lead_id",
  "leadId",
  "id",
  "name",
  "phone",
  "email",
  "notes",
  "stage",
  "pipeline",
  "event_type",
  "eventType",
]);

export type KrayaPayload = Record<string, any>;

export function customAttributes(payload: KrayaPayload) {
  return Object.entries(payload || {}).reduce<Record<string, any>>((acc, [key, value]) => {
    if (KNOWN_KEYS.has(key)) return acc;
    if (value === null || value === undefined || value === "") return acc;
    acc[key] = value;
    return acc;
  }, {});
}

const MAX_STAGE_HISTORY = 100;

export type MirrorResult = {
  created: boolean;
  stageChanged: boolean;
  leadId: string;
};

/**
 * Apply one webhook payload to the mirror.
 *
 * A stage entry is appended only when the stage actually moved. Kraya sends an
 * update for any edit - a note, a phone correction, a custom field - so treating
 * every payload as a stage event would turn the timeline into noise and break the
 * "moved to closed today" counters that read from it.
 */
export async function applyKrayaPayload(payload: KrayaPayload, eventType: "create" | "update" = "update"): Promise<MirrorResult | null> {
  const crmLeadId = payload?.lead_id != null ? String(payload.lead_id) : String(payload?.id ?? "");
  if (!crmLeadId) return null;

  const phone = String(payload?.phone || "").trim();
  const email = String(payload?.email || "").trim();
  const stage = String(payload?.stage || "").trim();
  const now = new Date();

  const existing: any = await CrmLeadRecord.findOne({ crmLeadId });
  const record: any = existing || new CrmLeadRecord({ crmLeadId, firstSeenAt: now, stageHistory: [] });

  const stageChanged = Boolean(stage) && record.stage !== stage;

  if (payload?.name) record.name = String(payload.name);
  if (payload?.pipeline) record.pipeline = String(payload.pipeline);
  if (phone) {
    record.phone = phone;
    record.phoneKey = phoneKey(phone);
  }
  if (email) {
    record.email = email;
    record.emailKey = emailKey(email);
  }
  // `notes` is Kraya's field and it owns the value - an empty string from the CRM
  // is a real deletion there, so only `undefined` is treated as "not sent".
  if (payload?.notes !== undefined) record.notes = String(payload.notes || "");

  const attributes = customAttributes(payload);
  if (Object.keys(attributes).length) {
    record.attributes = { ...(record.attributes || {}), ...attributes };
  }

  if (stageChanged) {
    record.previousStage = record.stage || undefined;
    record.stage = stage;
    record.stageChangedAt = now;
    record.stageHistory = [...(record.stageHistory || []), { stage, at: now, source: "kraya" as const }].slice(-MAX_STAGE_HISTORY);
  } else if (stage && !record.stage) {
    record.stage = stage;
  }

  record.lastEventAt = now;
  record.lastEventType = eventType;
  if (!record.firstSeenAt) record.firstSeenAt = now;

  // Resolving the portal account is best-effort: most leads never become
  // students, and a lookup failure must not cost the webhook its 200.
  if (!record.portalUser && (phone || email)) {
    const user: any = await findUserForCrmContact({ phone, email }).catch(() => null);
    if (user?._id) record.portalUser = user._id;
  }

  await record.save();
  return { created: !existing, stageChanged, leadId: crmLeadId };
}

/** Records a stage the portal itself pushed, so the timeline shows who moved it. */
export async function recordPortalStageChange(input: {
  crmLeadId: string;
  stage: string;
  actorId: string;
  actorName: string;
}) {
  const now = new Date();
  const record: any = await CrmLeadRecord.findOne({ crmLeadId: input.crmLeadId });
  if (!record) return null;

  record.previousStage = record.stage || undefined;
  record.stage = input.stage;
  record.stageChangedAt = now;
  record.lastEventAt = now;
  record.lastEventType = "portal";
  record.lastPushError = undefined;
  record.stageHistory = [
    ...(record.stageHistory || []),
    { stage: input.stage, at: now, source: "portal" as const, actor: input.actorId, actorName: input.actorName },
  ].slice(-MAX_STAGE_HISTORY);

  await record.save();
  return record;
}
