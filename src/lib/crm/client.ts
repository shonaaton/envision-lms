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

  const payload: Record<string, unknown> = {
    name: input.name || input.email || "Prospect",
    phone: input.phone,
    stage: crmStageLabel(input.stage),
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
