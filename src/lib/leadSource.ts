/**
 * Where a free demo lead came from: the ad that was clicked, or the website.
 *
 * The Meta ads link to /book-free-demo-class with these tags (Meta fills the
 * {{...}} parts in when the ad is shown):
 *
 *   utm_source={{site_source_name}}&utm_medium=paid_social
 *   &utm_campaign={{campaign.name}}&utm_id={{campaign.id}}
 *   &utm_term={{adset.name}}&utm_content={{ad.name}}
 *   &campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}
 *   &placement={{placement}}
 *
 * The landing page reads them on arrival (`captureLeadSource`) and keeps them
 * in sessionStorage, because the parent may read the page for a while, or open
 * the form on its own URL, before submitting. The form sends them with the
 * request, and the server saves them on the lead with a `channel` it can be
 * filtered by. Nothing here is sent anywhere else: no cookie, no third party.
 *
 * Pure apart from the two browser helpers, so the server and the tests share
 * the same reading of the tags.
 */

export const LEAD_SOURCE_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_id",
  "utm_term",
  "utm_content",
  "campaign_id",
  "adset_id",
  "ad_id",
  "placement",
  "fbclid",
  "gclid",
] as const;

export type LeadSourceParam = (typeof LEAD_SOURCE_PARAMS)[number];

export type LeadSource = Partial<Record<LeadSourceParam, string>> & {
  /** Host of the site the visitor came from, "" for none (typed in, an app, a bookmark). */
  referrer?: string;
  /** The page they first landed on, without its query string. */
  landingPath?: string;
};

export const LEAD_CHANNELS = [
  { value: "meta_ad", label: "Meta ad" },
  { value: "google_ad", label: "Google ad" },
  { value: "campaign", label: "Other campaign link" },
  { value: "search", label: "Search engine" },
  { value: "social", label: "Social media" },
  { value: "referral", label: "Another website" },
  { value: "direct", label: "Website (direct)" },
  { value: "unknown", label: "Not recorded" },
] as const;

export type LeadChannel = (typeof LEAD_CHANNELS)[number]["value"];

export function leadChannelLabel(value?: string | null) {
  return LEAD_CHANNELS.find((item) => item.value === value)?.label || "Not recorded";
}

const STORAGE_KEY = "envision:lead-source";
const MAX_LENGTH = 200;

/** Meta's `site_source_name` values, as a person would say them. */
const META_SITES: Record<string, string> = {
  fb: "Facebook",
  facebook: "Facebook",
  ig: "Instagram",
  instagram: "Instagram",
  an: "Audience Network",
  msg: "Messenger",
  messenger: "Messenger",
  th: "Threads",
  threads: "Threads",
  wa: "WhatsApp",
  whatsapp: "WhatsApp",
};

const SEARCH_HOSTS = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|yandex|baidu)\./;
const SOCIAL_HOSTS = /(^|\.)(facebook|fb|instagram|messenger|threads|whatsapp|youtube|linkedin|t|twitter|x|pinterest|reddit|quora)\.(com|me|net|co)$/;

/**
 * A tag value worth keeping. An ad previewed before Meta fills it in sends the
 * placeholder itself ("{{campaign.name}}"), which means nothing on a lead.
 */
function clean(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || /^\{\{.*\}\}$/.test(text) || text.includes("{{")) return "";
  return text.slice(0, MAX_LENGTH);
}

/** Keeps only the known tags, cleaned. Safe on anything a browser sent. */
export function sanitizeLeadSource(input: unknown): LeadSource {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const out: LeadSource = {};
  for (const key of LEAD_SOURCE_PARAMS) {
    const value = clean(raw[key]);
    if (value) out[key] = value;
  }
  const referrer = clean(raw.referrer).toLowerCase().replace(/^www\./, "");
  if (referrer) out.referrer = referrer;
  const landingPath = clean(raw.landingPath);
  if (landingPath.startsWith("/")) out.landingPath = landingPath.split("?")[0];
  return out;
}

export function leadChannel(source: LeadSource | null | undefined): LeadChannel {
  if (!source) return "unknown";
  const medium = (source.utm_medium || "").toLowerCase();
  const site = (source.utm_source || "").toLowerCase();
  if (source.ad_id || source.adset_id || source.fbclid || (medium.includes("paid") && (META_SITES[site] || medium.includes("social")))) return "meta_ad";
  if (source.gclid || (site === "google" && /cpc|ppc|paid/.test(medium))) return "google_ad";
  if (source.utm_source || source.utm_medium || source.utm_campaign) return "campaign";
  const referrer = source.referrer || "";
  if (referrer && SEARCH_HOSTS.test(referrer)) return "search";
  if (referrer && SOCIAL_HOSTS.test(referrer)) return "social";
  if (referrer) return "referral";
  return source.landingPath ? "direct" : "unknown";
}

export type LeadSourceSummary = {
  channel: LeadChannel;
  /** "Meta ad · Instagram", "Search engine · google.com", "Website (direct)". */
  headline: string;
  /** Labelled details for sales, only the ones that are known. */
  details: Array<{ label: string; value: string }>;
};

export function summarizeLeadSource(source: LeadSource | null | undefined): LeadSourceSummary {
  const s = source || {};
  const channel = leadChannel(s);
  const site = META_SITES[(s.utm_source || "").toLowerCase()] || s.utm_source || "";
  let where = "";
  if (channel === "meta_ad" || channel === "google_ad" || channel === "campaign") where = site;
  else if (channel === "search" || channel === "social" || channel === "referral") where = s.referrer || "";
  const headline = [leadChannelLabel(channel), where].filter(Boolean).join(" · ");
  const details = [
    { label: "Campaign", value: s.utm_campaign || "" },
    { label: "Ad set", value: s.utm_term || "" },
    { label: "Ad", value: s.utm_content || "" },
    { label: "Placement", value: (s.placement || "").replace(/_/g, " ") },
    { label: "Campaign ID", value: s.campaign_id || s.utm_id || "" },
    { label: "Ad set ID", value: s.adset_id || "" },
    { label: "Ad ID", value: s.ad_id || "" },
    { label: "Medium", value: channel === "campaign" ? s.utm_medium || "" : "" },
    { label: "Came from", value: channel === "meta_ad" || channel === "google_ad" ? "" : s.referrer || "" },
    { label: "Landing page", value: s.landingPath || "" },
  ].filter((item) => item.value);
  return { channel, headline, details };
}

/** One line for a sales task or a CRM note. */
export function leadSourceLine(source: LeadSource | null | undefined) {
  const summary = summarizeLeadSource(source);
  const parts = summary.details.filter((item) => ["Campaign", "Ad set", "Ad", "Placement"].includes(item.label)).map((item) => `${item.label}: ${item.value}`);
  return [summary.headline, ...parts].join(" | ");
}

// ---------------------------------------------------------------------------
// Browser side
// ---------------------------------------------------------------------------

function fromUrl(): LeadSource {
  const params = new URLSearchParams(window.location.search);
  const found: Record<string, string> = {};
  for (const key of LEAD_SOURCE_PARAMS) {
    const value = params.get(key);
    if (value) found[key] = value;
  }
  let referrer = "";
  try {
    if (document.referrer) {
      const url = new URL(document.referrer);
      if (url.host !== window.location.host) referrer = url.host;
    }
  } catch {
    // An unreadable referrer is the same as none.
  }
  return sanitizeLeadSource({ ...found, referrer, landingPath: window.location.pathname });
}

function hasTags(source: LeadSource) {
  return LEAD_SOURCE_PARAMS.some((key) => source[key]);
}

/**
 * Called when a campaign page loads. A link with tags always wins: the latest
 * ad clicked is the one that brought them back. Without tags, the first page of
 * the visit is kept, so moving around the site does not overwrite it.
 */
export function captureLeadSource() {
  if (typeof window === "undefined") return;
  try {
    const current = fromUrl();
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (hasTags(current) || !stored) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Without storage, readLeadSource still reads the current URL.
  }
}

/** What the form sends with a request. */
export function readLeadSource(): LeadSource {
  if (typeof window === "undefined") return {};
  const current = fromUrl();
  if (hasTags(current)) return current;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) return sanitizeLeadSource(JSON.parse(stored));
  } catch {
    // fall through
  }
  return current;
}
