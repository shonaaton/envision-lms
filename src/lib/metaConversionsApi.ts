import { CAMPAIGN_PIXEL_ID } from "@/lib/metaCampaignPixel";

/**
 * The server half of the free demo form's Lead event: Meta's Conversions API.
 *
 * The thank-you page's browser pixel sends the same Lead with the same event id
 * (`demoRequestEventId`), and Meta keeps one of the two. The server copy is the
 * one that still arrives when the browser's never does: no marketing consent,
 * an ad blocker, Safari's tracking limits, or a family who closed the tab before
 * the thank-you page loaded.
 *
 * It sends the lead's email, phone and first name hashed (SHA-256, as Meta
 * requires), the ad click id (`fbc`, from the `_fbc` cookie or the saved
 * fbclid), the browser id (`_fbp`) when the pixel set one, and the visitor's IP
 * and user agent, which Meta uses for matching only.
 *
 * Off until `META_CAPI_ACCESS_TOKEN` is set (Events Manager → the campaign
 * dataset → Settings → Conversions API → Generate access token).
 * `META_CAPI_TEST_EVENT_CODE` sends to the Test Events tab instead of the
 * real numbers.
 */

/** What the request that submitted the lead tells us about the visitor. Read before any await. */
export type MetaRequestContext = {
  ip?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
};

export type MetaLeadInput = {
  eventId: string;
  /** Seconds since the epoch. */
  eventTime: number;
  eventSourceUrl: string;
  email?: string | null;
  /** Digits only, with the country code, e.g. 919876543210. */
  phone?: string | null;
  name?: string | null;
  /** The fbclid saved with the lead, used when the browser had no `_fbc` cookie. */
  fbclid?: string | null;
  /** When the family arrived (ms), for the fbc built from a saved fbclid. */
  clickedAt?: number;
  context: MetaRequestContext;
};

type MetaEvent = {
  event_name: "Lead";
  event_time: number;
  event_id: string;
  event_source_url: string;
  action_source: "website";
  user_data: Record<string, string | string[]>;
};

async function sha256(value: string) {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readCookie(header: string | null, name: string) {
  for (const part of String(header || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return rest.join("=");
      }
    }
  }
  return "";
}

/** Only a real address: getClientIp answers "unknown" when no proxy header is present. */
function cleanIp(value?: string) {
  const ip = String(value || "").trim();
  return /^[0-9a-f.:]+$/i.test(ip) && /[.:]/.test(ip) ? ip : "";
}

/** The visitor details a Lead needs, taken from the request before it is handed off. */
export function metaRequestContext(request: Request, clientIp?: string): MetaRequestContext {
  const cookies = request.headers.get("cookie");
  return {
    ip: cleanIp(clientIp),
    userAgent: String(request.headers.get("user-agent") || "").slice(0, 500),
    fbp: readCookie(cookies, "_fbp").slice(0, 200),
    fbc: readCookie(cookies, "_fbc").slice(0, 500),
  };
}

/** Meta's fbc format for a click id we saved ourselves: fb.1.<arrival ms>.<fbclid>. */
export function fbcFromClickId(fbclid?: string | null, clickedAt?: number) {
  const id = String(fbclid || "").trim();
  if (!id) return "";
  return `fb.1.${Math.round(clickedAt || Date.now())}.${id}`;
}

/** The event Meta receives. Separate from the send so it can be tested without the network. */
export async function buildMetaLeadEvent(input: MetaLeadInput): Promise<MetaEvent> {
  const userData: Record<string, string | string[]> = {};
  const email = String(input.email || "").trim().toLowerCase();
  if (email.includes("@")) userData.em = [await sha256(email)];
  const phone = String(input.phone || "").replace(/\D/g, "");
  if (phone.length >= 8) userData.ph = [await sha256(phone)];
  const firstName = String(input.name || "").trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\p{L}]/gu, "");
  if (firstName) userData.fn = [await sha256(firstName)];
  const fbc = input.context.fbc || fbcFromClickId(input.fbclid, input.clickedAt);
  if (fbc) userData.fbc = fbc;
  if (input.context.fbp) userData.fbp = input.context.fbp;
  if (input.context.ip) userData.client_ip_address = input.context.ip;
  if (input.context.userAgent) userData.client_user_agent = input.context.userAgent;

  return {
    event_name: "Lead",
    event_time: input.eventTime,
    event_id: input.eventId,
    event_source_url: input.eventSourceUrl,
    action_source: "website",
    user_data: userData,
  };
}

function graphVersion() {
  const version = String(process.env.META_CAPI_GRAPH_VERSION || process.env.WHATSAPP_GRAPH_VERSION || "v25.0").trim().replace(/^["']|["']$/g, "");
  return version.startsWith("v") ? version : `v${version}`;
}

export type MetaSendResult = { ok: true; eventsReceived: number } | { ok: false; skipped?: boolean; reason: string };

export async function sendMetaLead(input: MetaLeadInput): Promise<MetaSendResult> {
  const token = String(process.env.META_CAPI_ACCESS_TOKEN || "").trim();
  if (!token || !CAMPAIGN_PIXEL_ID) return { ok: false, skipped: true, reason: "META_CAPI_ACCESS_TOKEN is not set" };

  const event = await buildMetaLeadEvent(input);
  const body: Record<string, unknown> = { data: [event] };
  const testCode = String(process.env.META_CAPI_TEST_EVENT_CODE || "").trim();
  if (testCode) body.test_event_code = testCode;

  try {
    const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${CAMPAIGN_PIXEL_ID}/events`, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json: any = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, reason: String(json?.error?.message || `HTTP ${response.status}`).slice(0, 300) };
    return { ok: true, eventsReceived: Number(json?.events_received || 0) };
  } catch (error) {
    return { ok: false, reason: String((error as Error)?.message || error).slice(0, 300) };
  }
}
