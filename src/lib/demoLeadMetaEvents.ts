import crypto from "crypto";
import { whatsappDigits } from "@/lib/contactEnquiries";

/**
 * NOT WIRED IN (2026-11-11). The user asked for one conversion only for now:
 * the Lead event the thank-you page's browser pixel sends. Nothing calls this
 * module; it is kept, with its tests, for when server events are wanted again.
 * Re-wiring also means restoring the lead fields it reads and claims
 * (metaFbp, metaFbc, metaScheduleAt, metaConvertedAt).
 *
 * Conversions API events for the free demo campaign, sent to the campaign
 * pixel (the one the landing and thank-you pages load, see lib/metaPixel).
 *
 * Three moments in a form lead's life are reported, each once per lead:
 *
 *   Lead                  the family verified their WhatsApp number
 *   Schedule              a demo was booked: the family picked a slot on the
 *                         thank-you page, or sales moved the lead to "Demo taken"
 *   CompleteRegistration  sales moved the lead to "Converted"
 *
 * The first two can happen in the family's browser, so they go as website
 * events with the same event id the browser pixel uses, and Meta keeps one of
 * the pair. A stage a salesperson sets in the Demo Leads CRM has no browser
 * behind it and goes as a CRM (`system_generated`) event, matched on the hashed
 * phone and name plus the `_fbp` / `_fbc` cookies saved when the form was sent.
 *
 * Needs `META_CAMPAIGN_CAPI_ACCESS_TOKEN`, a Conversions API token generated
 * for the campaign pixel in Events Manager. Without it nothing is sent. The
 * site-wide pixel's token cannot be used: a token belongs to one pixel.
 */

const GRAPH_VERSION = "v25.0";

export type DemoLeadMetaEventName = "Lead" | "Schedule" | "CompleteRegistration";

export function campaignCapiConfig() {
  return {
    pixelId: String(process.env.META_CAMPAIGN_PIXEL_ID || process.env.NEXT_PUBLIC_META_CAMPAIGN_PIXEL_ID || "1084805421260422").trim(),
    accessToken: String(process.env.META_CAMPAIGN_CAPI_ACCESS_TOKEN || "").trim(),
    /** From Events Manager > Test events, to watch events arrive without counting them. */
    testEventCode: String(process.env.META_CAMPAIGN_TEST_EVENT_CODE || "").trim(),
  };
}

export function campaignCapiReady() {
  const config = campaignCapiConfig();
  return Boolean(config.pixelId && config.accessToken);
}

export function demoSlotEventId(leadId: string) {
  return `demo_slot_${leadId}`;
}

export function demoConvertedEventId(leadId: string) {
  return `demo_converted_${leadId}`;
}

function sha256(value: string) {
  return value ? crypto.createHash("sha256").update(value).digest("hex") : undefined;
}

function cookieValue(cookieHeader: string | null, name: string) {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/** The pixel's own cookies on this request. Present only when the visitor accepted marketing cookies. */
export function metaBrowserIds(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  return { fbp: cookieValue(cookieHeader, "_fbp") || "", fbc: cookieValue(cookieHeader, "_fbc") || "" };
}

type LeadForMeta = { name?: string | null; countryCode?: string | null; phone?: string | null; metaFbp?: string | null; metaFbc?: string | null };

/** What the family's browser adds to a website event. Absent for a stage set by sales. */
export type DemoLeadEventBrowser = { userAgent?: string; ip?: string; sourceUrl?: string; fbp?: string; fbc?: string };

export function buildDemoLeadMetaEvent(input: {
  lead: LeadForMeta;
  eventName: DemoLeadMetaEventName;
  eventId: string;
  at?: Date;
  browser?: DemoLeadEventBrowser;
  testEventCode?: string;
}) {
  const { lead, browser } = input;
  const names = String(lead.name || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const fbp = browser?.fbp || lead.metaFbp || "";
  const fbc = browser?.fbc || lead.metaFbc || "";
  const userData: Record<string, unknown> = {
    ph: sha256(whatsappDigits(lead.countryCode, lead.phone)),
    fn: sha256(names[0] || ""),
    ln: sha256(names.slice(1).join(" ")),
    ...(fbp ? { fbp } : {}),
    ...(fbc ? { fbc } : {}),
  };
  const event: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: Math.floor((input.at || new Date()).getTime() / 1000),
    event_id: input.eventId,
  };
  if (browser) {
    event.action_source = "website";
    if (browser.sourceUrl) event.event_source_url = browser.sourceUrl;
    if (browser.userAgent) userData.client_user_agent = browser.userAgent;
    if (browser.ip) userData.client_ip_address = browser.ip;
  } else {
    event.action_source = "system_generated";
    event.custom_data = { event_source: "crm", lead_event_source: "Envision LMS" };
  }
  event.user_data = userData;
  const payload: Record<string, unknown> = { data: [event] };
  if (input.testEventCode) payload.test_event_code = input.testEventCode;
  return payload;
}

export function browserFromRequest(request: Request, ip?: string): DemoLeadEventBrowser {
  const ids = metaBrowserIds(request);
  return {
    userAgent: request.headers.get("user-agent") || undefined,
    ip: ip && ip !== "unknown" ? ip : undefined,
    sourceUrl: request.headers.get("referer") || process.env.NEXT_PUBLIC_APP_URL || undefined,
    fbp: ids.fbp,
    fbc: ids.fbc,
  };
}

/** Never throws: a Meta outage must not fail a family's submission or a salesperson's stage change. */
export async function sendDemoLeadMetaEvent(input: {
  lead: LeadForMeta;
  eventName: DemoLeadMetaEventName;
  eventId: string;
  browser?: DemoLeadEventBrowser;
}): Promise<{ sent: boolean; reason?: string }> {
  const config = campaignCapiConfig();
  if (!config.pixelId || !config.accessToken) return { sent: false, reason: "META_CAMPAIGN_CAPI_ACCESS_TOKEN is not set." };
  try {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${config.pixelId}/events?access_token=${encodeURIComponent(config.accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDemoLeadMetaEvent({ ...input, testEventCode: config.testEventCode })),
    });
    if (response.ok) return { sent: true };
    const reason = `${response.status} ${(await response.text().catch(() => "")).slice(0, 300)}`;
    console.error(`[demo-leads] Meta ${input.eventName} event refused`, reason);
    return { sent: false, reason };
  } catch (error) {
    console.error(`[demo-leads] Meta ${input.eventName} event failed`, error);
    return { sent: false, reason: "Network error." };
  }
}
