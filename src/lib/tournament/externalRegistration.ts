/**
 * Guest (no LMS account) tournament registration, as pure rules.
 *
 * A guest registers once with a name, a username, an email and optionally a
 * WhatsApp number. Coming back - another device, a cleared browser, the day
 * after - they say they have registered and prove it with the email or phone
 * they registered with plus their username. Nothing else is asked, so nobody
 * has to remember a PIN, and a returning player is never pushed into making a
 * second profile (on 28 Oct 2026 one guest ended up registered three times
 * because getting back in was harder than starting again).
 *
 * The usernames are public (standings, the invite page); the email and phone
 * never leave the server, which is what makes them the proof.
 */

import { canonicalPhoneNumber, dialCodeEntry, exactNationalNumber, exactPhoneNumberProblem } from "@/lib/phoneCountryCodes";

export const GUEST_USERNAME_MIN = 3;
export const GUEST_USERNAME_MAX = 24;
const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*[A-Za-z0-9]$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What the invite page's server actions answer with when they do not redirect. */
export type GuestFormState = { error: string; field?: string };

export type GuestRegistration = {
  displayName: string;
  username: string;
  email: string;
  /** Digits with the dialling code, or "" when no number was given. */
  phone: string;
  countryCode: string;
};

export type GuestRegistrationError =
  | "name"
  | "username"
  | "email"
  | "phone"
  | "rules";

export type RegistrationCheck =
  | { ok: true; value: GuestRegistration }
  | { ok: false; error: GuestRegistrationError; message: string };

export function normalizeGuestEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeGuestUsername(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

/** The key players are matched on: the same as the engine's player key. */
export function guestUsernameKey(value: unknown) {
  return normalizeGuestUsername(value).toLowerCase();
}

export function usernameProblem(value: unknown) {
  const username = normalizeGuestUsername(value);
  if (username.length < GUEST_USERNAME_MIN || username.length > GUEST_USERNAME_MAX) {
    return `Choose a username of ${GUEST_USERNAME_MIN} to ${GUEST_USERNAME_MAX} characters.`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "Use letters, numbers, spaces, dots, dashes or underscores, starting and ending with a letter or number.";
  }
  return "";
}

export function validateGuestRegistration(input: {
  displayName?: unknown;
  username?: unknown;
  email?: unknown;
  phone?: unknown;
  countryCode?: unknown;
  acceptRules?: unknown;
}): RegistrationCheck {
  const displayName = String(input.displayName || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (displayName.length < 2) return { ok: false, error: "name", message: "Please enter your full name." };

  const username = normalizeGuestUsername(input.username);
  const badUsername = usernameProblem(username);
  if (badUsername) return { ok: false, error: "username", message: badUsername };

  const email = normalizeGuestEmail(input.email);
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "email", message: "Please enter a valid email address. Your confirmation and reminders go there." };
  }

  const rawPhone = String(input.phone || "").trim();
  const dial = String(input.countryCode || "+91").replace(/[^\d]/g, "") || "91";
  let phone = "";
  if (rawPhone) {
    const problem = exactPhoneNumberProblem(rawPhone, dial);
    if (problem) return { ok: false, error: "phone", message: problem };
    phone = canonicalPhoneNumber(exactNationalNumber(rawPhone, dial), dial);
  }

  if (!input.acceptRules || String(input.acceptRules) === "false") {
    return { ok: false, error: "rules", message: "Please read the tournament rules and tick the box to confirm." };
  }

  return { ok: true, value: { displayName, username, email, phone, countryCode: phone ? `+${dial}` : "" } };
}

export type StoredGuest = {
  username: string;
  displayName?: string;
  email?: string;
  phone?: string;
  countryCode?: string;
};

/** Digits of a phone number as typed, for matching against a stored one. */
function phoneDigits(value: unknown) {
  return String(value || "").replace(/[^\d]/g, "").replace(/^0+/, "");
}

/**
 * Whether what a returning player typed is the email or phone this guest
 * registered with. A phone may be typed with or without its dialling code.
 */
export function contactMatches(guest: StoredGuest, contact: unknown) {
  const raw = String(contact || "").trim();
  if (!raw) return false;
  if (raw.includes("@")) return Boolean(guest.email) && normalizeGuestEmail(guest.email) === normalizeGuestEmail(raw);

  const stored = phoneDigits(guest.phone);
  const typed = phoneDigits(raw);
  if (!stored || typed.length < 6) return false;
  if (typed === stored) return true;
  // Typed without the dialling code: compare against the stored national part.
  const code = String(guest.countryCode || "").replace(/[^\d]/g, "");
  if (code && stored.startsWith(code) && stored.slice(code.length) === typed) return true;
  const entry = dialCodeEntry(code);
  if (!entry && stored.endsWith(typed) && typed.length >= 8) return true;
  return false;
}

/**
 * The registered guest a returning player is, or null. Both the username and
 * the contact detail must match the same registration.
 */
export function findReturningGuest<T extends StoredGuest>(guests: T[], input: { username: unknown; contact: unknown }) {
  const key = guestUsernameKey(input.username);
  if (!key) return null;
  const guest = guests.find((entry) => guestUsernameKey(entry.username) === key);
  if (!guest) return null;
  return contactMatches(guest, input.contact) ? guest : null;
}

/** Why a new registration clashes with one already made, or "" when it does not. */
export function registrationClash(guests: StoredGuest[], value: GuestRegistration): "" | "username_taken" | "email_registered" | "phone_registered" {
  const key = guestUsernameKey(value.username);
  if (guests.some((entry) => guestUsernameKey(entry.username) === key)) return "username_taken";
  if (guests.some((entry) => entry.email && normalizeGuestEmail(entry.email) === value.email)) return "email_registered";
  if (value.phone && guests.some((entry) => phoneDigits(entry.phone) && phoneDigits(entry.phone) === value.phone)) return "phone_registered";
  return "";
}

/** Hides most of an email for a "we sent it to ..." line. */
export function maskEmail(email: unknown) {
  const clean = normalizeGuestEmail(email);
  const [name, domain] = clean.split("@");
  if (!name || !domain) return "";
  return `${name.slice(0, 2)}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
}
