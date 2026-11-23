import { nanpAreaCodeZone } from "@/lib/localTime/nanpAreaCodes";

/**
 * Where in the world a family is, as a timezone, so staff can see the family's
 * own clock before ringing them.
 *
 * Best evidence first:
 *   1. device or staff - the timezone the student's own browser reported when
 *                they last opened the portal (User.timeZone, stamped by the
 *                layout), or one a staff member set after asking the family
 *                (staffTimeZone). Whichever was recorded last wins.
 *   2. place   - the city, or the state/province, on the account.
 *   3. area code - a US/Canada number's area code (lib/localTime/nanpAreaCodes).
 *   4. country - the country on the account.
 *   5. phone   - the dialling code of the family's phone number.
 * A country or dialling code that spans several zones (US, Canada, Australia)
 * still gives an answer, but marked `approximate` so the UI can say so.
 *
 * Pure and isomorphic: no database, no Node APIs.
 */

export type TimeZoneSource = "device" | "staff" | "city" | "state" | "area_code" | "country" | "phone";

export type StudentTimeZone = {
  timeZone: string;
  source: TimeZoneSource;
  /** Human words for where the answer came from, e.g. "Toronto" or "+1 phone number". */
  basis: string;
  /** True when the place spans several zones and this is the most likely one. */
  approximate: boolean;
};

export type LocationFields = {
  timeZone?: string | null;
  timeZoneSeenAt?: Date | string | null;
  /** Set by staff from the badge after asking the family. */
  staffTimeZone?: string | null;
  staffTimeZoneAt?: Date | string | null;
  staffTimeZoneByName?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  countryCode?: string | null;
};

const IST = "Asia/Kolkata";

export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function key(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function table(groups: Record<string, string[]>) {
  const map = new Map<string, string>();
  Object.entries(groups).forEach(([zone, names]) => names.forEach((name) => map.set(key(name), zone)));
  return map;
}

/** Cities in countries with more than one zone, plus big cities whose country is often left blank. */
const CITY_ZONES = table({
  "America/New_York": ["new york", "nyc", "brooklyn", "queens", "manhattan", "boston", "philadelphia", "washington", "washington dc", "atlanta", "miami", "orlando", "tampa", "charlotte", "raleigh", "pittsburgh", "baltimore", "detroit", "columbus", "cleveland", "jersey city", "newark", "edison", "princeton", "hoboken", "stamford", "hartford", "richmond", "jacksonville", "buffalo", "albany", "indianapolis", "cincinnati", "ashburn", "herndon", "fairfax", "cary", "morrisville"],
  "America/Chicago": ["chicago", "houston", "dallas", "austin", "san antonio", "fort worth", "plano", "irving", "frisco", "minneapolis", "st louis", "saint louis", "kansas city", "milwaukee", "nashville", "memphis", "new orleans", "oklahoma city", "omaha", "madison", "naperville", "schaumburg", "sugar land", "katy"],
  "America/Denver": ["denver", "boulder", "salt lake city", "albuquerque", "colorado springs", "el paso", "boise"],
  "America/Phoenix": ["phoenix", "scottsdale", "tempe", "chandler", "mesa", "tucson"],
  "America/Los_Angeles": ["los angeles", "san francisco", "sf", "san jose", "san diego", "seattle", "portland", "sacramento", "oakland", "fremont", "sunnyvale", "santa clara", "cupertino", "mountain view", "palo alto", "redmond", "bellevue", "irvine", "las vegas", "bay area", "milpitas", "pleasanton", "dublin ca", "san ramon"],
  "America/Anchorage": ["anchorage"],
  "Pacific/Honolulu": ["honolulu"],
  "America/Toronto": ["toronto", "ottawa", "montreal", "mississauga", "brampton", "markham", "waterloo", "kitchener", "hamilton", "london ontario", "oakville", "scarborough", "quebec", "quebec city", "vaughan", "richmond hill"],
  "America/Winnipeg": ["winnipeg"],
  "America/Regina": ["regina", "saskatoon"],
  "America/Edmonton": ["calgary", "edmonton"],
  "America/Vancouver": ["vancouver", "surrey", "burnaby", "victoria", "richmond bc"],
  "America/Halifax": ["halifax"],
  "Australia/Sydney": ["sydney", "canberra", "newcastle", "wollongong", "parramatta"],
  "Australia/Melbourne": ["melbourne", "geelong"],
  "Australia/Brisbane": ["brisbane", "gold coast", "sunshine coast", "cairns", "townsville"],
  "Australia/Adelaide": ["adelaide"],
  "Australia/Darwin": ["darwin"],
  "Australia/Perth": ["perth"],
  "Australia/Hobart": ["hobart"],
  "Europe/London": ["london", "manchester", "birmingham", "leeds", "glasgow", "edinburgh", "liverpool", "bristol", "leicester", "reading", "cardiff", "belfast", "slough", "milton keynes", "coventry", "nottingham", "sheffield", "cambridge", "oxford"],
  "Asia/Dubai": ["dubai", "abu dhabi", "sharjah", "ajman", "al ain", "ras al khaimah"],
  "Asia/Qatar": ["doha"],
  "Asia/Riyadh": ["riyadh", "jeddah", "dammam", "khobar", "al khobar", "mecca", "medina", "kuwait city"],
  "Asia/Muscat": ["muscat"],
  "Asia/Bahrain": ["manama"],
  "Asia/Singapore": ["singapore"],
  "Asia/Kuala_Lumpur": ["kuala lumpur", "kl", "penang", "johor bahru"],
  "Asia/Hong_Kong": ["hong kong"],
  "Asia/Tokyo": ["tokyo", "osaka", "yokohama"],
  "Asia/Dhaka": ["dhaka", "chittagong"],
  "Asia/Kathmandu": ["kathmandu"],
  "Asia/Colombo": ["colombo"],
  "Pacific/Auckland": ["auckland", "wellington", "christchurch"],
  "Africa/Johannesburg": ["johannesburg", "cape town", "durban", "pretoria"],
  "Africa/Nairobi": ["nairobi"],
  "Africa/Lagos": ["lagos", "abuja"],
  "Europe/Berlin": ["berlin", "munich", "frankfurt", "hamburg", "stuttgart", "cologne"],
  "Europe/Paris": ["paris"],
  "Europe/Amsterdam": ["amsterdam", "rotterdam", "eindhoven", "the hague"],
  "Europe/Dublin": ["dublin"],
  "Europe/Zurich": ["zurich", "geneva", "basel"],
});

/** States and provinces of the multi-zone countries. */
const STATE_ZONES = table({
  "America/New_York": ["new york", "ny", "new jersey", "nj", "massachusetts", "ma", "pennsylvania", "pa", "connecticut", "ct", "virginia", "va", "maryland", "md", "north carolina", "nc", "south carolina", "sc", "georgia", "ga", "florida", "fl", "ohio", "oh", "michigan", "mi", "district of columbia", "dc", "delaware", "de", "rhode island", "ri", "new hampshire", "nh", "vermont", "vt", "maine", "me", "west virginia", "wv", "indiana", "in"],
  "America/Chicago": ["texas", "tx", "illinois", "il", "minnesota", "mn", "wisconsin", "wi", "missouri", "mo", "iowa", "ia", "tennessee", "tn", "alabama", "al", "louisiana", "la", "oklahoma", "ok", "kansas", "ks", "nebraska", "ne", "arkansas", "ar", "mississippi", "ms", "kentucky", "ky", "manitoba", "mb"],
  "America/Denver": ["colorado", "co", "utah", "ut", "new mexico", "nm", "montana", "mt", "wyoming", "wy", "idaho", "id", "alberta", "ab"],
  "America/Phoenix": ["arizona", "az"],
  "America/Los_Angeles": ["california", "ca", "washington", "wa", "oregon", "or", "nevada", "nv"],
  "America/Anchorage": ["alaska", "ak"],
  "Pacific/Honolulu": ["hawaii", "hi"],
  "America/Toronto": ["ontario", "on", "quebec", "qc"],
  "America/Regina": ["saskatchewan", "sk"],
  "America/Vancouver": ["british columbia", "bc"],
  "America/Halifax": ["nova scotia", "ns", "new brunswick", "nb", "prince edward island", "pei"],
  "America/St_Johns": ["newfoundland", "newfoundland and labrador", "nl"],
  "Australia/Sydney": ["new south wales", "nsw", "australian capital territory", "act"],
  "Australia/Melbourne": ["victoria", "vic"],
  "Australia/Brisbane": ["queensland", "qld"],
  "Australia/Adelaide": ["south australia"],
  "Australia/Perth": ["western australia", "wa australia"],
  "Australia/Darwin": ["northern territory", "nt"],
  "Australia/Hobart": ["tasmania", "tas"],
});

/** Countries by name, with whether the country spans several zones. */
const COUNTRY_ZONES: Array<[string, string, boolean, string[]]> = [
  [IST, "India", false, ["india", "in", "ind", "bharat"]],
  ["America/New_York", "United States", true, ["united states", "united states of america", "usa", "us", "america", "u s a", "u s"]],
  ["America/Toronto", "Canada", true, ["canada", "ca"]],
  ["Australia/Sydney", "Australia", true, ["australia", "au", "aus"]],
  ["Europe/London", "United Kingdom", false, ["united kingdom", "uk", "gb", "great britain", "britain", "england", "scotland", "wales", "northern ireland"]],
  ["Europe/Dublin", "Ireland", false, ["ireland"]],
  ["Asia/Dubai", "UAE", false, ["united arab emirates", "uae", "ae", "u a e"]],
  ["Asia/Qatar", "Qatar", false, ["qatar", "qa"]],
  ["Asia/Riyadh", "Saudi Arabia", false, ["saudi arabia", "ksa", "saudi"]],
  ["Asia/Kuwait", "Kuwait", false, ["kuwait"]],
  ["Asia/Muscat", "Oman", false, ["oman"]],
  ["Asia/Bahrain", "Bahrain", false, ["bahrain"]],
  ["Asia/Singapore", "Singapore", false, ["singapore", "sg"]],
  ["Asia/Kuala_Lumpur", "Malaysia", false, ["malaysia", "my"]],
  ["Asia/Hong_Kong", "Hong Kong", false, ["hong kong", "hk"]],
  ["Asia/Tokyo", "Japan", false, ["japan", "jp"]],
  ["Asia/Seoul", "South Korea", false, ["south korea", "korea"]],
  ["Asia/Shanghai", "China", false, ["china", "cn"]],
  ["Asia/Bangkok", "Thailand", false, ["thailand"]],
  ["Asia/Manila", "Philippines", false, ["philippines"]],
  ["Asia/Dhaka", "Bangladesh", false, ["bangladesh", "bd"]],
  ["Asia/Kathmandu", "Nepal", false, ["nepal", "np"]],
  ["Asia/Colombo", "Sri Lanka", false, ["sri lanka", "lk"]],
  ["Asia/Karachi", "Pakistan", false, ["pakistan", "pk"]],
  ["Pacific/Auckland", "New Zealand", false, ["new zealand", "nz"]],
  ["Africa/Johannesburg", "South Africa", false, ["south africa", "za"]],
  ["Africa/Nairobi", "Kenya", false, ["kenya"]],
  ["Africa/Lagos", "Nigeria", false, ["nigeria"]],
  ["Europe/Berlin", "Germany", false, ["germany", "de", "deutschland"]],
  ["Europe/Paris", "France", false, ["france", "fr"]],
  ["Europe/Amsterdam", "Netherlands", false, ["netherlands", "nl", "holland"]],
  ["Europe/Zurich", "Switzerland", false, ["switzerland", "ch"]],
  ["Europe/Madrid", "Spain", false, ["spain", "es"]],
  ["Europe/Rome", "Italy", false, ["italy", "it"]],
  ["Europe/Stockholm", "Sweden", false, ["sweden", "se"]],
  ["Europe/Oslo", "Norway", false, ["norway", "no"]],
  ["Europe/Copenhagen", "Denmark", false, ["denmark", "dk"]],
  ["Europe/Brussels", "Belgium", false, ["belgium", "be"]],
  ["Europe/Warsaw", "Poland", false, ["poland", "pl"]],
  ["Europe/Istanbul", "Turkey", false, ["turkey", "turkiye"]],
  ["Asia/Jerusalem", "Israel", false, ["israel"]],
  ["Africa/Cairo", "Egypt", false, ["egypt"]],
];

const COUNTRY_BY_NAME = new Map<string, { zone: string; label: string; multi: boolean }>();
COUNTRY_ZONES.forEach(([zone, label, multi, names]) => names.forEach((name) => COUNTRY_BY_NAME.set(key(name), { zone, label, multi })));

/** Dialling code → zone; the multi-zone ones are a best guess. */
const DIAL_ZONES: Record<string, { zone: string; multi: boolean }> = {
  "91": { zone: IST, multi: false },
  "1": { zone: "America/New_York", multi: true },
  "44": { zone: "Europe/London", multi: false },
  "61": { zone: "Australia/Sydney", multi: true },
  "65": { zone: "Asia/Singapore", multi: false },
  "971": { zone: "Asia/Dubai", multi: false },
  "974": { zone: "Asia/Qatar", multi: false },
  "966": { zone: "Asia/Riyadh", multi: false },
  "965": { zone: "Asia/Kuwait", multi: false },
  "968": { zone: "Asia/Muscat", multi: false },
  "973": { zone: "Asia/Bahrain", multi: false },
  "60": { zone: "Asia/Kuala_Lumpur", multi: false },
  "852": { zone: "Asia/Hong_Kong", multi: false },
  "81": { zone: "Asia/Tokyo", multi: false },
  "86": { zone: "Asia/Shanghai", multi: false },
  "880": { zone: "Asia/Dhaka", multi: false },
  "977": { zone: "Asia/Kathmandu", multi: false },
  "94": { zone: "Asia/Colombo", multi: false },
  "64": { zone: "Pacific/Auckland", multi: false },
  "27": { zone: "Africa/Johannesburg", multi: false },
  "254": { zone: "Africa/Nairobi", multi: false },
  "234": { zone: "Africa/Lagos", multi: false },
  "49": { zone: "Europe/Berlin", multi: false },
  "33": { zone: "Europe/Paris", multi: false },
  "31": { zone: "Europe/Amsterdam", multi: false },
  "353": { zone: "Europe/Dublin", multi: false },
  "41": { zone: "Europe/Zurich", multi: false },
};

function cleanPlace(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

/** The family's timezone from the account's fields, or null when nothing on the account says. */
export function resolveStudentTimeZone(fields: LocationFields | null | undefined): StudentTimeZone | null {
  if (!fields) return null;
  const device = isValidTimeZone(fields.timeZone) ? fields.timeZone : null;
  const staff = isValidTimeZone(fields.staffTimeZone) ? fields.staffTimeZone : null;
  const staffAnswer = (zone: string): StudentTimeZone => ({
    timeZone: zone,
    source: "staff",
    basis: fields.staffTimeZoneByName ? `set by ${fields.staffTimeZoneByName}` : "set by staff",
    approximate: false,
  });
  if (device && staff) {
    // The newer record wins: a family that moved after staff asked shows up on their device.
    return timeOf(fields.staffTimeZoneAt) > timeOf(fields.timeZoneSeenAt) ? staffAnswer(staff) : { timeZone: device, source: "device", basis: "their device", approximate: false };
  }
  if (device) return { timeZone: device, source: "device", basis: "their device", approximate: false };
  if (staff) return staffAnswer(staff);

  const country = COUNTRY_BY_NAME.get(key(fields.country)) || null;
  const city = cleanPlace(fields.city);
  const cityKey = key(city);
  if (cityKey) {
    const zone = CITY_ZONES.get(cityKey);
    // "London" in a Canadian account is not London, England: a country that disagrees wins.
    if (zone && (!country || zoneMatchesCountry(zone, country.zone))) return { timeZone: zone, source: "city", basis: city, approximate: false };
    // Every Indian city is IST, so an Indian city needs no table.
    if (!country && !zone && looksIndian(fields)) return { timeZone: IST, source: "city", basis: city, approximate: false };
  }

  const state = cleanPlace(fields.state);
  // Two-letter codes ("TN", "GA", "WA") are only trusted on an account that names
  // the country: "TN" is Tamil Nadu far more often than Tennessee here.
  if (state && (country ? country.multi : key(state).length > 3)) {
    const zone = STATE_ZONES.get(key(state));
    if (zone && (!country || zoneMatchesCountry(zone, country.zone))) return { timeZone: zone, source: "state", basis: state, approximate: false };
  }

  const dialCode = String(fields.countryCode || "").replace(/\D/g, "");
  if (dialCode === "1" && (!country || country.multi)) {
    const area = nanpAreaCodeZone(fields.phone);
    if (area) return { timeZone: area.zone, source: "area_code", basis: `area code ${area.areaCode}`, approximate: area.split };
  }

  if (country) {
    return { timeZone: country.zone, source: "country", basis: country.label, approximate: country.multi };
  }

  const byDial = DIAL_ZONES[dialCode];
  if (byDial) return { timeZone: byDial.zone, source: "phone", basis: `+${dialCode} phone number`, approximate: byDial.multi };
  return null;
}

function timeOf(value: Date | string | null | undefined) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function looksIndian(fields: LocationFields) {
  return String(fields.countryCode || "").replace(/\D/g, "") === "91";
}

/** Same broad region, so a city table hit is not overruled by a matching country. */
function zoneMatchesCountry(zone: string, countryZone: string) {
  const region = (value: string) => value.split("/")[0];
  if (zone === countryZone) return true;
  if (region(zone) !== region(countryZone)) return false;
  // America/* and Australia/* share a region across countries only in the tables above
  // for the same country, except US vs Canada, which both sit under America/.
  const canada = new Set(["America/Toronto", "America/Winnipeg", "America/Regina", "America/Edmonton", "America/Vancouver", "America/Halifax", "America/St_Johns"]);
  if (region(zone) === "America") return canada.has(zone) === canada.has(countryZone);
  return region(zone) === "Australia";
}

/** The best answer across siblings: a device zone beats a city, and so on. */
export function resolveFamilyTimeZone(members: Array<LocationFields | null | undefined>): StudentTimeZone | null {
  const rank: Record<TimeZoneSource, number> = { device: 6, staff: 6, city: 4, state: 3, area_code: 2.5, country: 2, phone: 1 };
  let best: StudentTimeZone | null = null;
  for (const member of members) {
    const found = resolveStudentTimeZone(member);
    if (!found) continue;
    const score = rank[found.source] - (found.approximate ? 0.5 : 0);
    const bestScore = best ? rank[best.source] - (best.approximate ? 0.5 : 0) : -1;
    if (score > bestScore) best = found;
  }
  return best;
}

export type CallWindow = "good" | "edge" | "bad";

/** Hour and minute on the family's clock. */
export function localClock(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return { hour, minute };
}

/**
 * Whether now is a sensible time to ring: 9am-8:30pm is fine, 8-9am and
 * 8:30-9:30pm are early/late, anything else is night.
 */
export function callWindow(timeZone: string, now = new Date()): CallWindow {
  const { hour, minute } = localClock(timeZone, now);
  const minutes = hour * 60 + minute;
  if (minutes >= 9 * 60 && minutes < 20 * 60 + 30) return "good";
  if ((minutes >= 8 * 60 && minutes < 9 * 60) || (minutes >= 20 * 60 + 30 && minutes < 21 * 60 + 30)) return "edge";
  return "bad";
}
