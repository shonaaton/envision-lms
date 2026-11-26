import { exactNationalNumber, exactPhoneNumberProblem, splitInternationalNumber } from "@/lib/phoneCountryCodes";

/**
 * Pure rules for "Invite applicants" on /admin/careers/applications: reading a
 * pasted list, and when an invite counts as waiting / due a reminder. Shared
 * by the API, the reminder job and the admin page; no database here.
 */

/** Manual resends (one row or "Resend to all") skip anyone messaged more recently than this. */
export const RESEND_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** The one automatic reminder goes this long after the first invite, if nothing was resent meanwhile. */
export const AUTO_REMINDER_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
/** Automatic reminders go out only between these IST hours, never at night. */
export const AUTO_REMINDER_HOURS_IST = { from: 10, to: 19 };
export const MAX_INVITES_PER_PASTE = 200;

export type InviteStatus = "invited" | "opened" | "applied" | "cancelled";

export const INVITE_STATUSES: { value: InviteStatus; label: string }[] = [
  { value: "invited", label: "Not opened" },
  { value: "opened", label: "Opened, not applied" },
  { value: "applied", label: "Applied" },
  { value: "cancelled", label: "Cancelled" },
];

export function inviteStatus(row: { appliedAt?: unknown; cancelledAt?: unknown; openedAt?: unknown }): InviteStatus {
  if (row.appliedAt) return "applied";
  if (row.cancelledAt) return "cancelled";
  if (row.openedAt) return "opened";
  return "invited";
}

export function canResendNow(lastSentAt: Date | string | null | undefined, now = new Date()) {
  if (!lastSentAt) return true;
  return now.getTime() - new Date(lastSentAt).getTime() >= RESEND_COOLDOWN_MS;
}

/** The IST hour of `now` (0-23), for the reminder window. */
export function istHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(now)) % 24;
}

export type ParsedInvite = { line: number; name: string; countryCode: string; phone: string; email: string };
export type InviteParseResult = { rows: ParsedInvite[]; problems: { line: number; text: string; error: string }[] };

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * Reads one applicant per line, in any order: a name, a WhatsApp number and
 * optionally an email, separated by commas, tabs or semicolons (a copy from
 * Excel or Google Sheets works). A number starting with + or 00 carries its own
 * country code; any other number uses `defaultCountryCode`. The same number
 * twice in one paste is kept once.
 */
export function parseInviteLines(text: string, defaultCountryCode = "+91"): InviteParseResult {
  const rows: ParsedInvite[] = [];
  const problems: InviteParseResult["problems"] = [];
  const seen = new Set<string>();
  const lines = String(text || "").split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = index + 1;
    const clean = raw.trim();
    if (!clean) return;
    const parts = clean.split(/[\t,;|]+/).map((part) => part.trim()).filter(Boolean);
    let email = "";
    let phoneRaw = "";
    const nameParts: string[] = [];
    for (const part of parts) {
      if (!email && EMAIL.test(part)) email = part.toLowerCase();
      else if (!phoneRaw && /^[+(]?[\d\s()\-.]{6,}$/.test(part) && part.replace(/\D/g, "").length >= 6) phoneRaw = part;
      else nameParts.push(part);
    }
    const name = nameParts.join(" ").replace(/\s+/g, " ").slice(0, 80);
    // A header row copied from a sheet ("Name, Phone, Email").
    if (!phoneRaw && parts.every((part) => /^(s\.?\s*no\.?|#|(full )?name|phone|mobile|whats ?app( number| no\.?)?|number|e-?mail)$/i.test(part))) return;
    if (name.length < 2) return void problems.push({ line, text: clean, error: "No name on this line." });
    if (!phoneRaw) return void problems.push({ line, text: clean, error: "No WhatsApp number on this line." });

    let countryCode = defaultCountryCode;
    let national = phoneRaw;
    const international = /^\s*(\+|00)/.test(phoneRaw);
    if (international) {
      const split = splitInternationalNumber(phoneRaw.replace(/^\s*00/, ""));
      if (!split) return void problems.push({ line, text: clean, error: "Unknown country code." });
      countryCode = `+${split.code}`;
      national = split.national;
    }
    const problem = exactPhoneNumberProblem(national, countryCode);
    if (problem) return void problems.push({ line, text: clean, error: problem.replace(/^Please enter (your|a valid) /i, "Not a valid ").replace(/\.$/, "") + "." });
    const phone = exactNationalNumber(national, countryCode);
    const key = `${countryCode}${phone}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ line, name, countryCode, phone, email });
  });
  if (rows.length > MAX_INVITES_PER_PASTE) {
    for (const row of rows.slice(MAX_INVITES_PER_PASTE)) problems.push({ line: row.line, text: row.name, error: `Only ${MAX_INVITES_PER_PASTE} people per paste.` });
    rows.length = MAX_INVITES_PER_PASTE;
  }
  return { rows, problems };
}
