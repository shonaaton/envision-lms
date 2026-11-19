import { zonedDateTime } from "@/lib/academyTime";
import { dateKeyIn } from "@/lib/demoTimeSlots";

/**
 * The rules behind the WhatsApp messages a new Demo Leads CRM lead receives
 * (2026-11-20, user request), kept free of the database so they can be tested:
 *
 * 1. `demo_lead_welcome`: the recap of the request, with a "Call sales person"
 *    button (opens a page that dials the lead's salesperson) and a "Confirm
 *    call-back" quick reply (tells the salesperson to call at the given time).
 * 2. ten seconds later, `demo_lead_brochure` twice: the India fee PDF for the
 *    child's level and the Global profile, because the form does not tell us
 *    where the family lives.
 */

export const DEMO_LEAD_WELCOME_TEMPLATE = "demo_lead_welcome";
export const DEMO_LEAD_BROCHURE_TEMPLATE = "demo_lead_brochure";

/** A form lead waits this long for the family to pick a demo slot on the thank-you page before the welcome goes without one. */
export const WELCOME_WAIT_FOR_SLOT_MS = 10 * 60_000;
/** The brochures follow the welcome after this long (user: "after 10 secs"). */
export const BROCHURE_DELAY_MS = 10_000;

/** Where the brochures are served from: public/, under a path middleware already lets through. */
export const BROCHURE_BASE_PATH = "/book-free-demo-class/brochures";

export type DemoLeadBrochure = {
  /** File in public/book-free-demo-class/brochures. */
  file: string;
  /** The name the parent sees on the PDF in WhatsApp. */
  filename: string;
  /** Fills "here is {{2}}" in the brochure template. */
  description: string;
};

export const BROCHURES = {
  beginnerIntermediate: {
    file: "beginner-intermediate.pdf",
    filename: "Envision Chess Academy - Beginner & Intermediate.pdf",
    description: "our fee structure in India for the Beginner & Intermediate programme",
  },
  semiProPro: {
    file: "semi-pro-pro.pdf",
    filename: "Envision Chess Academy - Semi Pro & Pro.pdf",
    description: "our fee structure in India for the Semi Pro & Pro programme",
  },
  masters: {
    file: "masters.pdf",
    filename: "Envision Chess Academy - Masters.pdf",
    description: "our fee structure in India for the Masters programme",
  },
  global: {
    file: "global-profile.pdf",
    filename: "Envision Chess Academy - Global Profile.pdf",
    description: "our Global profile with fees for families outside India",
  },
} as const satisfies Record<string, DemoLeadBrochure>;

/**
 * The India brochure for the level the parent chose (user: fresher and
 * intermediate get Beginner & Intermediate, plays tournaments gets Semi Pro &
 * Pro, FIDE rated gets Masters). Retired form levels map to their nearest
 * match; no level at all gets the first programme. The Global profile always follows.
 */
export function demoLeadBrochures(childLevel?: string | null): DemoLeadBrochure[] {
  const level = String(childLevel || "");
  const india =
    level === "plays_tournaments" || level === "advanced"
      ? BROCHURES.semiProPro
      : level === "fide_rated"
        ? BROCHURES.masters
        : BROCHURES.beginnerIntermediate;
  return [india, BROCHURES.global];
}

/** What a missing field reads as: Meta refuses an empty template value. */
export const NOT_SHARED = "Not shared yet";
export const SLOT_NOT_CHOSEN = "To be fixed on our call";

// ---------------------------------------------------------------------------
// "Confirm call-back" quick reply
// ---------------------------------------------------------------------------

const CALLBACK_PREFIX = "demo_cb:";

/** The payload Meta hands back when the parent taps "Confirm call-back". */
export function callbackButtonPayload(leadId: string) {
  return `${CALLBACK_PREFIX}${leadId}`;
}

/** The lead id inside a quick-reply payload, or "" when the reply is not ours. */
export function leadIdFromCallbackPayload(payload?: string | null) {
  const raw = String(payload || "").trim();
  if (!raw.startsWith(CALLBACK_PREFIX)) return "";
  const id = raw.slice(CALLBACK_PREFIX.length);
  return /^[a-f0-9]{24}$/i.test(id) ? id : "";
}

// ---------------------------------------------------------------------------
// "Call sales person" link
// ---------------------------------------------------------------------------

/**
 * The URL button ends in a per-lead token: the lead id plus a short signature,
 * so the page that dials the salesperson cannot be walked through by guessing ids.
 */
// Lazy: the minute job reaches this file, and instrumentation.ts is also compiled for Edge (no static Node built-ins).
function nodeCrypto(): typeof import("crypto") {
  return eval("require")("crypto");
}

function signature(leadId: string) {
  const crypto = nodeCrypto();
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "envision-demo-lead-call";
  return crypto.createHmac("sha256", secret).update(`demo-lead-call:${leadId}`).digest("base64url").slice(0, 12);
}

export function callLinkToken(leadId: string) {
  return `${leadId}.${signature(leadId)}`;
}

export function leadIdFromCallToken(token?: string | null) {
  const [id, sig] = String(token || "").split(".");
  if (!id || !sig || !/^[a-f0-9]{24}$/i.test(id)) return "";
  const crypto = nodeCrypto();
  const expected = Buffer.from(signature(id));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? id : "";
}

/** The fixed part of the URL button, as registered with Meta. The token is its variable. */
export const CALL_LINK_PATH = "/book-free-demo-class/call/";

// ---------------------------------------------------------------------------
// When to remind the salesperson
// ---------------------------------------------------------------------------

/**
 * The first clock time in the free text the parent typed as their convenient
 * time ("4:00 PM - 5:00 PM", "after 6pm", "16:30", "5-6 pm"), as "HH:mm", or
 * "" when there is none ("evening", "any time").
 *
 * A bare hour with no AM/PM is read as afternoon/evening from 1 to 8 and
 * morning from 9 to 11: parents of school children ask to be called after school.
 */
export function callTimeOfDay(text?: string | null) {
  const value = String(text || "").toLowerCase();
  const match = value.match(/(\d{1,2})(?:\s*[:.]\s*(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/);
  if (!match) return "";
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours > 23 || minutes > 59) return "";
  // "5-6 pm": the AM/PM written after the range belongs to its start too.
  const meridiem = match[3] || value.slice((match.index || 0) + match[0].length).match(/^\s*(?:-|–|to)\s*\d{1,2}(?:\s*[:.]\s*\d{2})?\s*(a\.?m\.?|p\.?m\.?)/)?.[1] || "";
  if (meridiem) {
    if (hours < 1 || hours > 12) return "";
    const pm = meridiem.startsWith("p");
    hours = (hours % 12) + (pm ? 12 : 0);
  } else if (hours >= 1 && hours <= 8) {
    hours += 12;
  } else if (hours === 0) {
    return "";
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * The next time (IST) the parent asked to be called, counting from `now`: today
 * if it is still ahead, otherwise tomorrow. Null when the text holds no time.
 */
export function nextCallTime(text: string | null | undefined, now = new Date()) {
  const time = callTimeOfDay(text);
  if (!time) return null;
  const today = dateKeyIn("Asia/Kolkata", now);
  const todayAt = zonedDateTime(today, time, "Asia/Kolkata");
  if (todayAt.getTime() > now.getTime()) return todayAt;
  const tomorrow = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) + 1, 12)).toISOString().slice(0, 10);
  return zonedDateTime(tomorrow, time, "Asia/Kolkata");
}

/** How long before the call time the salesperson's reminder goes off. */
export const CALL_REMINDER_LEAD_MS = 5 * 60_000;
