import { z } from "zod";

/** Months shown in the "Monthly record" grid, this one included. */
export const RECORD_MONTHS = 6;
/** The monthly task is due on this day of the month (IST). */
export const MONTH_TASK_DUE_DAY = 10;

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

/** Common cities → state, so a missing state can be suggested in one click. */
const CITY_STATE: Record<string, string> = {
  kolkata: "West Bengal", calcutta: "West Bengal", howrah: "West Bengal", siliguri: "West Bengal", durgapur: "West Bengal",
  asansol: "West Bengal", kharagpur: "West Bengal", barasat: "West Bengal", "salt lake": "West Bengal", "new town": "West Bengal",
  mumbai: "Maharashtra", bombay: "Maharashtra", pune: "Maharashtra", nagpur: "Maharashtra", thane: "Maharashtra", nashik: "Maharashtra", "navi mumbai": "Maharashtra",
  delhi: "Delhi", "new delhi": "Delhi", noida: "Uttar Pradesh", "greater noida": "Uttar Pradesh", ghaziabad: "Uttar Pradesh", lucknow: "Uttar Pradesh",
  kanpur: "Uttar Pradesh", varanasi: "Uttar Pradesh", agra: "Uttar Pradesh", prayagraj: "Uttar Pradesh", gurgaon: "Haryana", gurugram: "Haryana", faridabad: "Haryana",
  bangalore: "Karnataka", bengaluru: "Karnataka", mysore: "Karnataka", mysuru: "Karnataka", mangalore: "Karnataka",
  chennai: "Tamil Nadu", coimbatore: "Tamil Nadu", madurai: "Tamil Nadu", hyderabad: "Telangana", secunderabad: "Telangana",
  visakhapatnam: "Andhra Pradesh", vijayawada: "Andhra Pradesh", kochi: "Kerala", cochin: "Kerala", thiruvananthapuram: "Kerala", trivandrum: "Kerala", kozhikode: "Kerala",
  ahmedabad: "Gujarat", surat: "Gujarat", vadodara: "Gujarat", rajkot: "Gujarat", jaipur: "Rajasthan", jodhpur: "Rajasthan", udaipur: "Rajasthan", kota: "Rajasthan",
  bhopal: "Madhya Pradesh", indore: "Madhya Pradesh", gwalior: "Madhya Pradesh", jabalpur: "Madhya Pradesh", patna: "Bihar", gaya: "Bihar",
  ranchi: "Jharkhand", jamshedpur: "Jharkhand", dhanbad: "Jharkhand", bokaro: "Jharkhand", bhubaneswar: "Odisha", cuttack: "Odisha", rourkela: "Odisha",
  guwahati: "Assam", silchar: "Assam", dibrugarh: "Assam", raipur: "Chhattisgarh", bhilai: "Chhattisgarh", chandigarh: "Chandigarh", ludhiana: "Punjab", amritsar: "Punjab",
  dehradun: "Uttarakhand", shimla: "Himachal Pradesh", srinagar: "Jammu and Kashmir", jammu: "Jammu and Kashmir", panaji: "Goa", goa: "Goa", agartala: "Tripura",
  shillong: "Meghalaya", gangtok: "Sikkim", imphal: "Manipur", puducherry: "Puducherry", pondicherry: "Puducherry",
};

/** A tidy place name: trimmed, single-spaced, first letters capitalised. */
export function tidyPlace(value: unknown) {
  const clean = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!clean) return "";
  if (clean !== clean.toLowerCase() && clean !== clean.toUpperCase()) return clean;
  // Short all-caps names are codes people mean as written: UAE, USA, UK, NCR.
  if (clean === clean.toUpperCase() && /^[A-Z.]{2,4}$/.test(clean)) return clean;
  return clean.toLowerCase().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

/** A state for a known city, or "" when we cannot tell. */
export function suggestState(city: unknown, country?: unknown) {
  const place = String(country ?? "").trim().toLowerCase();
  if (place && place !== "india" && place !== "in") return "";
  return CITY_STATE[String(city ?? "").trim().toLowerCase().replace(/\s+/g, " ")] || "";
}

/** True when the place is too thin to pick tournaments: no city or country, or an Indian family with no state. */
export function placeIncomplete(place: { city?: string | null; state?: string | null; country?: string | null }) {
  const country = String(place.country || "").trim().toLowerCase();
  if (!String(place.city || "").trim() || !country) return true;
  return (country === "india" || country === "in") && !String(place.state || "").trim();
}

/** "City, State, Country" with the blanks dropped. */
export function placeLabel(place: { city?: string | null; state?: string | null; country?: string | null }) {
  return [place.city, place.state, place.country].map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** `count` month keys ending at `monthKey`, newest first. */
export function recentMonthKeys(monthKey: string, count = RECORD_MONTHS) {
  const [year, month] = monthKey.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * Tasks are keyed by an ObjectId reference; a month has no document of its
 * own, so its id is built from the month: "2026-11" → `7d0000000000000000202611`.
 * The `7d` prefix keeps it clear of real ids (those start with a timestamp).
 */
export function monthTaskReferenceId(monthKey: string) {
  return `7d${monthKey.replace("-", "").padStart(22, "0")}`;
}

const place = z.string().max(80).optional().default("");

export const tournamentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mark_sent"),
    monthKey: z.string().refine(isMonthKey, "Pick a month."),
    studentIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1, "Pick at least one student.").max(500),
    note: z.string().max(1000).optional().default(""),
  }),
  z.object({
    action: z.literal("unmark_sent"),
    monthKey: z.string().refine(isMonthKey, "Pick a month."),
    studentId: z.string().regex(/^[a-f0-9]{24}$/i),
  }),
  z.object({
    action: z.literal("location"),
    studentId: z.string().regex(/^[a-f0-9]{24}$/i),
    city: place,
    state: place,
    country: place,
  }),
  z.object({
    action: z.literal("request"),
    monthKey: z.string().refine(isMonthKey, "Pick a month."),
    city: place,
    state: place,
    country: place,
    note: z.string().max(1000).optional().default(""),
    studentIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(500).optional().default([]),
  }),
  z.object({
    action: z.literal("answer_request"),
    requestId: z.string().regex(/^[a-f0-9]{24}$/i),
    reply: z.string().trim().min(3, "Write the tournament details (at least a few words).").max(4000),
  }),
  z.object({
    action: z.literal("cancel_request"),
    requestId: z.string().regex(/^[a-f0-9]{24}$/i),
  }),
]);

export type TournamentAction = z.infer<typeof tournamentActionSchema>;
