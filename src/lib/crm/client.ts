import { crmPipelineName, crmStageLabel, type DemoStage } from "@/lib/crm/stages";

/**
 * Outbound HTTP adapter for the CRM.
 *
 * Everything the CRM's request contract controls is isolated here and driven by
 * environment variables, so pointing this at the real endpoint is a config
 * change rather than a code change. With no credentials configured the client
 * reports `skipped` and the rest of the sync still runs and records intent.
 */
const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 1_500;

export type CrmPushResult =
  | { ok: true; skipped?: false; leadId?: string; status: number }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; reason: string; status?: number };

export type CrmPushInput = {
  crmLeadId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  stage: DemoStage;
  note?: string | null;
};

export function crmClientConfig() {
  const baseUrl = String(process.env.KRAYA_API_URL || "").trim().replace(/\/+$/, "");
  const apiKey = String(process.env.KRAYA_API_KEY || "").trim();
  return {
    baseUrl,
    apiKey,
    keyHeader: String(process.env.KRAYA_API_KEY_HEADER || "").trim() || "X-KRAYA-API-KEY",
    // Kraya's Leads API URL is already the complete upsert endpoint
    // (https://api.kraya-ai.com/api/external/<workspace>/leads), so nothing is
    // appended by default. The override exists only for a future endpoint split.
    upsertPath: String(process.env.KRAYA_LEAD_UPSERT_PATH ?? "").trim(),
    upsertMethod: (String(process.env.KRAYA_LEAD_UPSERT_METHOD || "").trim() || "POST").toUpperCase(),
    configured: Boolean(baseUrl && apiKey),
  };
}

export function isCrmConfigured() {
  return crmClientConfig().configured;
}

/**
 * The Calls API endpoint.
 *
 * Kraya exposes it as a sibling of the Leads URL under the same workspace id
 * (.../external/<workspace>/leads -> .../external/<workspace>/calls), so it is
 * derived rather than requiring a second variable to be filled in correctly. Set
 * KRAYA_CALLS_API_URL to override if the workspace ever serves it elsewhere.
 */
export function crmCallsConfig() {
  const { baseUrl, apiKey, keyHeader } = crmClientConfig();
  const explicit = String(process.env.KRAYA_CALLS_API_URL || "").trim().replace(/\/+$/, "");
  const derived = baseUrl ? baseUrl.replace(/\/leads$/i, "/calls") : "";
  const url = explicit || derived;
  return {
    url,
    apiKey,
    keyHeader,
    // A derived URL identical to the leads URL means the leads URL did not end in
    // /leads, so the guess is unsafe and the endpoint must be set explicitly.
    configured: Boolean(url && apiKey && (explicit || (derived && derived !== baseUrl))),
  };
}

export function isCrmCallLoggingConfigured() {
  return crmCallsConfig().configured;
}

async function postOnce(url: string, method: string, headers: Record<string, string>, body: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method, headers, body, signal: controller.signal });
    const text = await response.text().catch(() => "");
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { status: response.status, ok: response.ok, parsed, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Move a lead to `stage`, creating it if the CRM has no lead on that phone or
 * email. One retry only: the caller is already idempotent on stage, so a lost
 * update is corrected by the next transition rather than by hammering the CRM.
 */
export async function pushLeadStage(input: CrmPushInput): Promise<CrmPushResult> {
  return pushLeadStageLabel({ ...input, stageLabel: crmStageLabel(input.stage) });
}

/**
 * Push an arbitrary pipeline stage by its literal CRM label.
 *
 * `pushLeadStage` above only speaks the seven `DemoStage` values the demo funnel
 * owns. The sales workspace moves leads through the whole pipeline - "Qualified",
 * "Hot Lead" and whatever else the academy has named its stages - and those have
 * no enum member to map from, so the label travels as-is.
 */
export async function pushLeadStageLabel(
  input: Omit<CrmPushInput, "stage"> & { stageLabel: string },
): Promise<CrmPushResult> {
  const config = crmClientConfig();
  if (!config.configured) {
    return { ok: false, skipped: true, reason: "CRM API credentials are not configured (KRAYA_API_URL / KRAYA_API_KEY)." };
  }
  // Kraya requires name and phone, and matches an existing lead on the phone
  // number. Without one there is nothing to upsert against, so skip rather than
  // send a request the CRM will reject with a 400.
  if (!input.phone) {
    return { ok: false, skipped: true, reason: "Lead has no phone number; the CRM matches leads on phone." };
  }
  const stageLabel = String(input.stageLabel || "").trim();
  if (!stageLabel) {
    return { ok: false, skipped: true, reason: "No CRM stage label to push." };
  }

  const payload: Record<string, unknown> = {
    name: input.name || input.email || "Prospect",
    phone: input.phone,
    stage: stageLabel,
    pipeline: crmPipelineName(),
  };
  if (input.crmLeadId) payload.lead_id = input.crmLeadId;
  if (input.email) payload.email = input.email;
  if (input.note) payload.notes = input.note;

  const url = `${config.baseUrl}${config.upsertPath}`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    [config.keyHeader]: config.apiKey,
  };
  const body = JSON.stringify(payload);

  let lastReason = "CRM request failed.";
  let lastStatus: number | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await postOnce(url, config.upsertMethod, headers, body);
      if (result.ok) {
        const leadId = result.parsed?.lead_id ?? result.parsed?.id ?? result.parsed?.data?.lead_id ?? result.parsed?.data?.id;
        return { ok: true, status: result.status, leadId: leadId ? String(leadId) : undefined };
      }
      lastStatus = result.status;
      lastReason = `CRM responded ${result.status}: ${String(result.text || "").slice(0, 300)}`;
      // Client errors are deterministic - a retry sends the same rejected payload.
      if (result.status < 500 && result.status !== 429) break;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : "CRM request failed.";
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  return { ok: false, reason: lastReason, status: lastStatus };
}

/** Portal call outcomes mapped onto the two states Kraya records. */
export type PortalCallOutcome =
  | "connected"
  | "no_answer"
  | "busy"
  | "wrong_number"
  | "callback_requested"
  | "not_interested";

export function krayaCallStatus(outcome: PortalCallOutcome): "done" | "no_response" {
  // Only a call that was actually answered is "done" to the CRM. Everything else -
  // busy, wrong number, a promised callback - is a call that did not connect, and
  // Kraya has no third state for it.
  return outcome === "connected" ? "done" : "no_response";
}

export type CrmCallPushResult =
  | { ok: true; callId?: string; status: number }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; reason: string; status?: number };

export type CrmCallPushInput = {
  crmLeadId?: string | null;
  phone?: string | null;
  outcome: PortalCallOutcome;
  durationMinutes?: number | null;
  notes?: string | null;
  name?: string | null;
  /** Present when updating a call Kraya already knows about. */
  krayaCallId?: string | null;
};

/**
 * Mirror a portal call log into the CRM.
 *
 * Kraya requires `call_duration` and `call_notes` whenever the status is "done",
 * so both are always sent for a connected call - a missing note would be a 400,
 * and losing the call log over a blank field would be worse than storing a
 * placeholder. For a call that did not connect, duration is omitted entirely
 * because the CRM only accepts it alongside "done".
 */
export async function pushCallLog(input: CrmCallPushInput): Promise<CrmCallPushResult> {
  const config = crmCallsConfig();
  if (!config.configured) {
    return { ok: false, skipped: true, reason: "CRM call logging is not configured (KRAYA_CALLS_API_URL / KRAYA_API_KEY)." };
  }
  if (!input.crmLeadId && !input.phone) {
    return { ok: false, skipped: true, reason: "A call needs a lead id or a phone number to attach to." };
  }

  const status = krayaCallStatus(input.outcome);
  const payload: Record<string, unknown> = { call_status: status };

  if (input.krayaCallId) payload.call_id = input.krayaCallId;
  if (input.crmLeadId) payload.lead_id = input.crmLeadId;
  else payload.phone = input.phone;

  if (status === "done") {
    payload.call_duration = Math.max(0, Math.round(Number(input.durationMinutes || 0)));
    payload.call_notes = String(input.notes || "").trim().slice(0, 5000) || "Call logged from the portal.";
  } else if (input.notes) {
    payload.call_notes = String(input.notes).trim().slice(0, 5000);
  }
  if (input.name) payload.call_name = String(input.name).slice(0, 200);

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    [config.keyHeader]: config.apiKey,
  };
  const body = JSON.stringify(payload);

  let lastReason = "CRM call request failed.";
  let lastStatus: number | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await postOnce(config.url, "POST", headers, body);
      if (result.ok) {
        const callId = result.parsed?.call_id ?? result.parsed?.id ?? result.parsed?.data?.call_id;
        return { ok: true, status: result.status, callId: callId != null ? String(callId) : undefined };
      }
      lastStatus = result.status;
      lastReason = `CRM responded ${result.status}: ${String(result.text || "").slice(0, 300)}`;
      // Client errors are deterministic - a retry sends the same rejected payload.
      if (result.status < 500 && result.status !== 429) break;
    } catch (error) {
      lastReason = error instanceof Error ? error.message : "CRM call request failed.";
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  return { ok: false, reason: lastReason, status: lastStatus };
}
