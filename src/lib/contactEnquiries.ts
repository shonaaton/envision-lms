import { kolkataCentres } from "@/lib/centrePages";

/**
 * The shared vocabulary of the contact form and the enquiry inbox.
 *
 * One list, read by the public form, the API validator, the Mongo enum and the
 * sales page, so a centre added to `centrePages` shows up as a choice on the
 * form and as a filter in the inbox without a second edit anywhere.
 */

export const ONLINE_INTEREST = "online";

export type ContactInterest = {
  /** Stored on the document. "online", or a centre slug. */
  value: string;
  /** What the form and the inbox call it. */
  label: string;
  /** The line under the label on the form. */
  detail: string;
};

export const contactInterests: ContactInterest[] = [
  {
    value: ONLINE_INTEREST,
    label: "Online classes",
    detail: "Live classes from home, anywhere in India or abroad",
  },
  ...kolkataCentres.map((centre) => ({
    value: centre.slug,
    label: `${centre.name} centre`,
    detail: `${centre.address} - ${centre.schedule.map((entry) => entry.day.slice(0, 3)).join(", ")}`,
  })),
];

export const CONTACT_INTEREST_VALUES = contactInterests.map((interest) => interest.value);

export function contactInterestLabel(value?: string | null) {
  return contactInterests.find((interest) => interest.value === value)?.label || "Not specified";
}

/**
 * Where a submission has got to. Deliberately three states: an inbox with more
 * than that stops being glanceable, and the full pipeline already lives in the
 * CRM.
 */
export const CONTACT_STATUSES = ["new", "contacted", "closed"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  new: "New",
  contacted: "Contacted",
  closed: "Closed",
};

/** How many enquiries one page of the inbox shows. */
export const CONTACT_PAGE_SIZE = 20;

/** "+91" + "98312 48613" -> "+919831248613", for tel: and wa.me links. */
export function whatsappDigits(countryCode?: string | null, phone?: string | null) {
  const code = String(countryCode || "").replace(/[^\d]/g, "");
  const national = String(phone || "").replace(/[^\d]/g, "").replace(/^0+/, "");
  if (!national) return "";
  // The number may already repeat its own dialling code - both spellings are
  // accepted on the form - so only prefix when it does not.
  return national.startsWith(code) ? national : `${code}${national}`;
}

export function contactDisplayPhone(countryCode?: string | null, phone?: string | null) {
  return [String(countryCode || "").trim(), String(phone || "").trim()].filter(Boolean).join(" ") || "No number";
}
