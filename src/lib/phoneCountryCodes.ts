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
