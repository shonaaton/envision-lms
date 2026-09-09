/**
 * Dialling codes the portal offers on the registration form, plus the national number
 * lengths each one uses. The lengths matter: without them "9123456789" (an Indian mobile
 * stored against +91) looks like it already carries its "91" country code, and "6581234567"
 * (a Singapore number that *does* carry its code) looks like a bare national number.
 */
export type DialCode = {
  code: string;
  country: string;
  nationalLengths: number[];
  aliases?: string[];
};

export const DIAL_CODES: DialCode[] = [
  { code: "91", country: "India", nationalLengths: [10], aliases: ["in", "ind"] },
  { code: "1", country: "United States / Canada", nationalLengths: [10], aliases: ["united states", "usa", "us", "america", "canada", "ca"] },
  { code: "44", country: "United Kingdom", nationalLengths: [10], aliases: ["uk", "gb", "england", "scotland", "wales", "britain", "great britain"] },
  { code: "61", country: "Australia", nationalLengths: [9], aliases: ["au", "aus"] },
  { code: "65", country: "Singapore", nationalLengths: [8], aliases: ["sg", "sgp"] },
  { code: "971", country: "United Arab Emirates", nationalLengths: [9], aliases: ["uae", "ae", "dubai", "abu dhabi"] },
  { code: "974", country: "Qatar", nationalLengths: [8], aliases: ["qa", "doha"] },
  { code: "966", country: "Saudi Arabia", nationalLengths: [9], aliases: ["ksa", "sa", "saudi"] },
];

/** Longest code first, so "971" is tested before "97"/"9" style prefixes. */
const BY_LENGTH = [...DIAL_CODES].sort((a, b) => b.code.length - a.code.length);

export function dialCodeEntry(countryCode?: string) {
  const clean = String(countryCode || "").replace(/[^\d]/g, "");
  return DIAL_CODES.find((entry) => entry.code === clean) || null;
}

/**
 * True when `digits` already begins with `countryCode` *and* what follows is a plausible
 * national number for it. Unknown codes fall back to a length heuristic.
 */
export function carriesCountryCode(digits: string, countryCode: string) {
  if (!countryCode || !digits.startsWith(countryCode)) return false;
  const rest = digits.slice(countryCode.length);
  const entry = dialCodeEntry(countryCode);
  if (entry) return entry.nationalLengths.includes(rest.length);
  return rest.length >= 6 && digits.length > 10;
}

/**
 * True when `digits` is already too long to be a national number for `countryCode`.
 *
 * `carriesCountryCode` answers a narrower question - "is this a well-formed
 * international number?" - and says no both to a bare national number and to a
 * malformed one. Callers that prefix the dialling code on a "no" need to tell
 * those two apart, because prefixing a number that already opens with its own
 * code just makes it longer, and the next send makes it longer again.
 */
export function exceedsNationalLength(digits: string, countryCode: string) {
  const clean = String(digits || "").replace(/[^\d]/g, "");
  const code = String(countryCode || "").replace(/[^\d]/g, "");
  if (!clean || !code) return false;
  const entry = dialCodeEntry(code);
  const longestNational = entry ? Math.max(...entry.nationalLengths) : 10;
  return clean.length > longestNational;
}

/**
 * Why this number cannot be dialled, or "" when it looks reachable.
 *
 * Deliberately a length check and nothing more. The portal only needs to stop
 * numbers that could never be a phone number at all - a demo lead was stored as
 * a 13-digit "Indian mobile", which then failed every WhatsApp send it was ever
 * used for - and a stricter format rule would start rejecting real signups from
 * countries the dial-code table does not describe well.
 */
export function phoneNumberProblem(phone: unknown, countryCode?: unknown) {
  const digits = String(phone || "").replace(/[^\d]/g, "").replace(/^0+/, "");
  if (!digits) return "Please enter a phone number.";
  const entry = dialCodeEntry(String(countryCode || ""));
  if (!entry) return digits.length < 6 || digits.length > 15 ? "Please enter a valid phone number." : "";
  const shortest = Math.min(...entry.nationalLengths);
  // The number may or may not repeat its own dialling code, and both spellings
  // are accepted everywhere else in the portal, so allow for either here.
  const longest = Math.max(...entry.nationalLengths) + entry.code.length;
  if (digits.length < shortest || digits.length > longest) {
    const expected = entry.nationalLengths.join(" or ");
    return `Please enter a valid ${entry.country} phone number (${expected} digits).`;
  }
  return "";
}

/** Splits a full international number into its dialling code and national part. */
export function splitInternationalNumber(digits: string) {
  const clean = String(digits || "").replace(/[^\d]/g, "");
  for (const entry of BY_LENGTH) {
    if (carriesCountryCode(clean, entry.code)) {
      return { code: entry.code, country: entry.country, national: clean.slice(entry.code.length) };
    }
  }
  return null;
}

/** Maps a stored `country` field ("United Kingdom", "UAE", "usa") to its dialling code. */
export function dialCodeForCountryName(country?: string) {
  const clean = String(country || "").trim().toLowerCase();
  if (!clean || clean === "other") return null;
  return DIAL_CODES.find((entry) =>
    entry.country.toLowerCase() === clean ||
    entry.country.toLowerCase().split(" / ").includes(clean) ||
    (entry.aliases || []).includes(clean)
  ) || null;
}
