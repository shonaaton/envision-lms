import "server-only";

import crypto from "crypto";
import { CrmLeadRecord } from "@/models/CrmLeadRecord";

/**
 * Meta Conversion Leads: every Kraya stage move, reported to Meta as a CRM event.
 *
 * Meta learns which lead-ad leads become students from these events, so each
 * move is sent once with the stage name as the event name. The funnel mapping
 * (which stage counts as qualified, converted, ...) is done in Events Manager,
 * not here - renaming a stage in Kraya only needs a remap there.
 *
 * Deliberately outside `mirror.ts`: the mirror records only and must never make
 * an outbound call. The webhook and the sales stage route call this after the
 * mirror has taken the move.
 */

const GRAPH_VERSION = "v25.0";
/** Meta rejects CRM events older than this. */
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Where a Kraya custom attribute may hold Meta's own lead id, checked in order. */
const META_LEAD_ID_KEYS = ["meta_lead_id", "fb_lead_id", "facebook_lead_id", "leadgen_id", "meta_leadgen_id", "fb_leadgen_id"];

export function metaCrmConfig() {
  return {
    enabled: String(process.env.META_CRM_EVENTS_ENABLED || "").trim().toLowerCase() === "true",
    datasetId: String(process.env.META_CRM_DATASET_ID || process.env.META_PIXEL_ID || "").trim(),
    accessToken: String(process.env.META_CRM_ACCESS_TOKEN || process.env.META_CONVERSIONS_API_ACCESS_TOKEN || "").trim(),
    leadEventSource: String(process.env.META_CRM_LEAD_EVENT_SOURCE || "Kraya").trim(),
    testEventCode: String(process.env.META_CRM_TEST_EVENT_CODE || "").trim(),
    leadIdAttribute: String(process.env.META_LEAD_ID_ATTRIBUTE || "").trim(),
  };
}

function sha256(value: string) {
  return value ? crypto.createHash("sha256").update(value).digest("hex") : "";
}

/** Meta wants digits only, country code included, no leading zeros. */
export function metaPhone(raw?: string | null) {
  const digits = String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  if (digits.length === 10) {
    const countryCode = String(process.env.CRM_DEFAULT_COUNTRY_CODE || "91").replace(/\D/g, "");
    return `${countryCode}${digits}`;
  }
  return digits;
}

/**
 * Meta's lead id, not Kraya's. Kraya's `lead_id` is its own small integer and
 * would match nothing on Meta, so it is never sent. Meta's id only exists when
 * the lead came from a lead ad and Kraya kept it as a custom attribute.
 */
export function metaLeadIdFrom(attributes: Record<string, any> | null | undefined, attributeKey = "") {
  const source = attributes || {};
  const keys = attributeKey ? [attributeKey, ...META_LEAD_ID_KEYS] : META_LEAD_ID_KEYS;
  for (const key of keys) {
    const value = String(source[key] ?? "").trim();
    if (/^\d{15,17}$/.test(value)) return value;
  }
  return "";
}

/** Stable per lead, stage and moment, so a retried send is deduplicated by Meta. */
export function metaEventId(crmLeadId: string, stage: string, eventTime: number) {
  return `kraya-${crmLeadId}-${sha256(stage.toLowerCase()).slice(0, 12)}-${eventTime}`;
}

export type LeadStageEventInput = {
  crmLeadId: string;
  stage: string;
  at: Date;
  email?: string | null;
  phone?: string | null;
  attributes?: Record<string, any> | null;
};

/** Returns the request body, or a reason the event cannot be sent. */
export function buildLeadStageEvent(input: LeadStageEventInput, config = metaCrmConfig()): { body: string; eventId: string } | { skip: string } {
  const stage = String(input.stage || "").trim();
  if (!stage) return { skip: "No stage." };
  if (Date.now() - input.at.getTime() > MAX_EVENT_AGE_MS) return { skip: "Stage move is older than Meta's 7-day window." };

  const leadId = metaLeadIdFrom(input.attributes, config.leadIdAttribute);
  const em = sha256(String(input.email || "").trim().toLowerCase());
  const ph = sha256(metaPhone(input.phone));
  if (!leadId && !em && !ph) return { skip: "Lead has no Meta lead id, email or phone to match on." };

  const eventTime = Math.floor(input.at.getTime() / 1000);
  const eventId = metaEventId(input.crmLeadId, stage, eventTime);
  const payload: Record<string, any> = {
    data: [
      {
        action_source: "system_generated",
        custom_data: {
          event_source: "crm",
          lead_event_source: config.leadEventSource,
        },
        event_name: stage,
        event_time: eventTime,
        event_id: eventId,
        user_data: {
          ...(em ? { em: [em] } : {}),
          ...(ph ? { ph: [ph] } : {}),
          ...(leadId ? { lead_id: leadId } : {}),
        },
      },
    ],
  };
  if (config.testEventCode) payload.test_event_code = config.testEventCode;

  // Meta's lead id is an int64 and can exceed Number.MAX_SAFE_INTEGER, so it is
  // carried as a string and written into the JSON as a bare number literal.
  const body = JSON.stringify(payload).replace(/"lead_id":"(\d{15,17})"/, '"lead_id":$1');
  return { body, eventId };
}

export type MetaSyncResult = { sent: boolean; eventId?: string; reason?: string };

/**
 * Report one stage move to Meta. Never throws - a Meta outage must not cost the
 * webhook its 200 or fail a salesperson's stage change.
 *
 * The claim on `metaSentStage` is what keeps a move from being sent twice: a
 * stage set from the portal is pushed to Kraya, and Kraya's webhook for that
 * same move can land before the portal route finishes. Whichever arrives first
 * claims the stage; the other finds it taken. Returning to an earlier stage
 * later still sends, because the claim moved on in between.
 */
export async function syncLeadStageToMeta(input: { crmLeadId: string; stage: string }): Promise<MetaSyncResult> {
  const config = metaCrmConfig();
  if (!config.enabled) return { sent: false, reason: "META_CRM_EVENTS_ENABLED is not true." };
  if (!config.datasetId || !config.accessToken) return { sent: false, reason: "Meta dataset id or access token is missing." };

  const stage = String(input.stage || "").trim();
  if (!input.crmLeadId || !stage) return { sent: false, reason: "No lead id or stage." };

  const now = new Date();
  let previous: any;
  try {
    previous = await CrmLeadRecord.findOneAndUpdate(
      { crmLeadId: input.crmLeadId, metaSentStage: { $ne: stage } },
      { $set: { metaSentStage: stage, metaSentAt: now } },
      { new: false },
    ).lean();
  } catch (error) {
    console.error("Meta CRM event claim failed", error);
    return { sent: false, reason: "Could not claim the stage for sending." };
  }
  if (!previous) return { sent: false, reason: "Already sent for this stage." };

  const release = async (error: string) => {
    // Give the claim back so the next move of this stage can try again.
    await CrmLeadRecord.updateOne(
      { crmLeadId: input.crmLeadId, metaSentStage: stage },
      { $set: { metaSentStage: previous.metaSentStage ?? null, metaSyncError: error } },
    ).catch(() => undefined);
  };

  const built = buildLeadStageEvent(
    { crmLeadId: input.crmLeadId, stage, at: now, email: previous.email, phone: previous.phone, attributes: previous.attributes },
    config,
  );
  if ("skip" in built) {
    await release(built.skip);
    return { sent: false, reason: built.skip };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${config.datasetId}/events?access_token=${encodeURIComponent(config.accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: built.body,
    });
    if (!response.ok) {
      const message = (await response.text().catch(() => "")).slice(0, 500);
      throw new Error(`Meta CRM event "${stage}" failed: ${response.status} ${message}`);
    }
  } catch (error: any) {
    console.error("Meta CRM event failed", error);
    await release(String(error?.message || error).slice(0, 500));
    return { sent: false, eventId: built.eventId, reason: "Meta rejected or did not receive the event." };
  }

  await CrmLeadRecord.updateOne(
    { crmLeadId: input.crmLeadId },
    { $set: { metaEventId: built.eventId }, $unset: { metaSyncError: "" } },
  ).catch(() => undefined);
  return { sent: true, eventId: built.eventId };
}
