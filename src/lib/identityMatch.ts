import { canonicalPhoneNumber } from "@/lib/phoneCountryCodes";

/**
 * One person, one identity key - so a second signup cannot hide behind a
 * different spelling of the same inbox or the same phone.
 *
 * `email` is unique in the database, but uniqueness is only as good as the
 * string it compares. `dimpleluniya@gmail.com` and `dimple.luniya@gmail.com`
 * are two different strings and one Gmail inbox, and that is exactly how a
 * second demo account was opened for a family that already had one. The stored
 * fields stay untouched - a welcome email goes to the address the family
 * actually typed - and these canonical forms sit alongside them purely as
 * match keys.
 *
 * Nothing here talks to the database, so the User model can import it without
 * a cycle and the rules can be unit tested on their own.
 */

/** Domains where dots in the local part are decorative, not part of the address. */
const DOT_INSENSITIVE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** Aliases of one mail host, folded onto the name its addresses are stored under. */
const DOMAIN_ALIASES: Record<string, string> = {
  "googlemail.com": "gmail.com",
};

/**
 * The inbox an address actually lands in.
 *
 * Plus-addressing is stripped everywhere because every provider the academy
 * sees supports it; dots are stripped for Gmail only, since `first.last@` and
 * `firstlast@` are genuinely different mailboxes elsewhere.
 */
export function canonicalEmail(value?: string) {
  const clean = String(value || "").trim().toLowerCase();
  const at = clean.lastIndexOf("@");
  if (at <= 0 || at === clean.length - 1) return clean;
  let local = clean.slice(0, at);
  const rawDomain = clean.slice(at + 1);
  const domain = DOMAIN_ALIASES[rawDomain] || rawDomain;
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) local = local.replace(/\./g, "");
  if (!local) return clean;
  return `${local}@${domain}`;
}

/** The dialable number, shared with the WhatsApp sender so both agree on what one number is. */
export function canonicalPhone(phone?: string, countryCode?: string) {
  return canonicalPhoneNumber(phone, countryCode);
}

/**
 * The match keys for an account, ready to write onto it.
 *
 * Every write path goes through the User schema hooks rather than calling this
 * directly, so an account can never be saved with a stale key.
 */
export function canonicalIdentityFields(input: { email?: string; phone?: string; countryCode?: string }) {
  return {
    emailCanonical: canonicalEmail(input.email),
    phoneCanonical: canonicalPhone(input.phone, input.countryCode),
  };
}

export type DuplicateReason = "email" | "phone";

export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  email: "Same email inbox",
  phone: "Same phone number",
};

/** Plain-English summary for a notification or a review card. */
export function duplicateReasonSummary(reasons: string[]) {
  const labels = (reasons || [])
    .filter((reason): reason is DuplicateReason => reason === "email" || reason === "phone")
    .map((reason) => DUPLICATE_REASON_LABELS[reason].toLowerCase());
  if (!labels.length) return "Matching contact details";
  return labels.join(" and ").replace(/^./, (character) => character.toUpperCase());
}
