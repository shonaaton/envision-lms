/**
 * Which salesperson owns a CRM lead.
 *
 * Kraya's routing automation marks the owner by setting a custom attribute NAMED
 * after the salesperson - `"Sayandeb Lead" = "40"`, `"Shazib Lead" = "40"`. The
 * value is not the owner; the attribute's name is. So the owner is read from the
 * attribute keys whose value is set, and the name part is matched against the
 * staff directory rather than a fixed spelling - "Shazib" in the CRM has to find
 * "Mohammed Shahzib" in the portal.
 *
 * The mirror never deletes attributes (each payload is merged in), so a lead that
 * was reassigned can carry both keys. `attributeChangedAt` breaks that: the owner
 * key set most recently wins, and two set at the same moment is left unresolved
 * rather than guessed.
 *
 * Pure matching lives here so it can be tested without a database; the lookups
 * against `User` and `CrmLeadRecord` are in `demoLeadOwner.ts`.
 */

export type LeadOwnerCandidate = {
  userId: string;
  name: string;
  email: string;
  /** Holds the sales access role. Breaks a tie when a name matches two accounts. */
  isSales: boolean;
};

export type OwnerSignal = {
  key: string;
  /** The salesperson part of the key, e.g. "Shazib" from "Shazib Lead". */
  label: string;
  /** Email pinned for this key in `CRM_LEAD_OWNER_ATTRIBUTES`, if any. */
  email: string;
  changedAt: number;
};

/** Words that decorate the key but never identify the person. */
const NOISE_TOKENS = new Set(["lead", "leads", "sales", "owner", "assigned", "to", "by", "the", "of", "mr", "ms", "mrs"]);

/** Values Kraya uses for an attribute that is present but not switched on. */
const UNSET_VALUES = new Set(["", "0", "false", "no", "none", "null", "undefined", "n/a", "na", "-"]);

const MIN_FUZZY_LENGTH = 5;

function normalizeKey(key: string) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** "shazib_lead", "ShazibLead" and "Shazib Lead" all read as ["shazib", "lead"]. */
function keyWords(key: string) {
  return String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

function tokens(value: string) {
  return keyWords(value).filter((token) => token.length >= 3 && !NOISE_TOKENS.has(token));
}

/**
 * `CRM_LEAD_OWNER_ATTRIBUTES="Sayandeb Lead=sayan@x.com,Shazib Lead=shazib@x.com"`
 * pins a key to an account by email when name matching is not enough.
 */
export function configuredOwnerAttributes() {
  const map = new Map<string, string>();
  for (const entry of String(process.env.CRM_LEAD_OWNER_ATTRIBUTES || "").split(",")) {
    const [key, email] = entry.split("=").map((part) => part.trim());
    if (key && email) map.set(normalizeKey(key), email.toLowerCase());
  }
  return map;
}

export function isSetAttributeValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "object") return false;
  return !UNSET_VALUES.has(String(value).trim().toLowerCase());
}

function timeOf(value: unknown) {
  const time = value ? new Date(value as any).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

/** Attribute keys that name an owner and are switched on, newest first. */
export function ownerSignals(attributes: Record<string, unknown> | null | undefined, changedAt?: Record<string, unknown> | null): OwnerSignal[] {
  const configured = configuredOwnerAttributes();
  return Object.entries(attributes || {})
    .filter(([, value]) => isSetAttributeValue(value))
    .map(([key]) => {
      const email = configured.get(normalizeKey(key)) || "";
      const words = keyWords(key);
      const label = words.filter((word) => !NOISE_TOKENS.has(word)).join(" ");
      const namesOwner = email || (words.includes("lead") && label.length >= 3);
      return namesOwner ? { key, label, email, changedAt: timeOf(changedAt?.[key]) } : null;
    })
    .filter((signal): signal is OwnerSignal => Boolean(signal))
    .sort((a, b) => b.changedAt - a.changedAt);
}

/** Only "is it within one edit" matters, so this bails as soon as it is not. */
function withinOneEdit(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenMatches(signalToken: string, candidateToken: string) {
  if (signalToken === candidateToken) return true;
  // One slipped letter ("shazib" / "shahzib") is a spelling, not another person,
  // but short names collide too easily, so only longer ones get slack.
  return signalToken.length >= MIN_FUZZY_LENGTH && candidateToken.length >= MIN_FUZZY_LENGTH && withinOneEdit(signalToken, candidateToken);
}

function matchesCandidate(signal: OwnerSignal, candidate: LeadOwnerCandidate) {
  if (signal.email) return String(candidate.email || "").toLowerCase() === signal.email;
  const signalTokens = tokens(signal.label);
  const emailLocal = String(candidate.email || "").split("@")[0].toLowerCase();
  const own = [...tokens(candidate.name), ...tokens(emailLocal)];
  const emailLetters = emailLocal.replace(/[^a-z]/g, "");
  return signalTokens.some(
    (signalToken) =>
      own.some((candidateToken) => tokenMatches(signalToken, candidateToken)) ||
      // Email locals run names together ("mohammedshazib"), so a long enough
      // token found inside one counts too.
      (signalToken.length >= MIN_FUZZY_LENGTH && emailLetters.includes(signalToken))
  );
}

function ownerForSignal(signal: OwnerSignal, candidates: LeadOwnerCandidate[]) {
  const matched = candidates.filter((candidate) => matchesCandidate(signal, candidate));
  const unique = [...new Map(matched.map((candidate) => [candidate.userId, candidate])).values()];
  if (unique.length === 1) return unique[0];
  const sales = unique.filter((candidate) => candidate.isSales);
  return sales.length === 1 ? sales[0] : null;
}

/**
 * Resolve the owner. Returns null rather than guessing when the keys match
 * nobody, or the newest keys point at different people - a notice to the wrong
 * salesperson hands them someone else's lead.
 */
export function matchLeadOwner(
  attributes: Record<string, unknown> | null | undefined,
  candidates: LeadOwnerCandidate[],
  changedAt?: Record<string, unknown> | null
) {
  const signals = ownerSignals(attributes, changedAt);
  const moments = Array.from(new Set(signals.map((signal) => signal.changedAt)));
  for (const moment of moments) {
    const resolved = signals
      .filter((signal) => signal.changedAt === moment)
      .map((signal) => ({ signal, owner: ownerForSignal(signal, candidates) }))
      .filter((entry): entry is { signal: OwnerSignal; owner: LeadOwnerCandidate } => Boolean(entry.owner));
    const owners = new Set(resolved.map((entry) => entry.owner.userId));
    if (owners.size === 1) return { owner: resolved[0].owner, attributeKey: resolved[0].signal.key };
    if (owners.size > 1) return null;
  }
  return null;
}
