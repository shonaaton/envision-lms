import "server-only";

import { dbConnect } from "@/lib/db";
import { importantContactsByKeys } from "@/lib/importantContacts";
import { loginIdentifiersFilter, matchesLoginIdentifier } from "@/lib/loginIdentity";
import { User } from "@/models/User";

/**
 * Who does what in the Class Monitor, named by email (or portal user ID) and
 * resolved against the live user directory:
 *
 *  - the monitor fills the forms and gets one task per class -
 *    `CLASS_MONITOR_EMAILS`, Saptarshi by default;
 *  - the reviewers get every filled form and the daily summary by email -
 *    `CLASS_MONITOR_REVIEWER_EMAILS`, Dhritabrata and Sayan Bose by default.
 *
 * Admins can always open, fill and correct everything.
 */
const DEFAULT_MONITOR_EMAILS = ["saptarshi2856@gmail.com"];
const DEFAULT_REVIEWER_EMAILS = ["dhritabratakundu06@gmail.com", "sayanthsbose@gmail.com"];
const STAFF_FIELDS = "_id name email username phone role isActive";

function listFromEnv(key: string, fallback: string[]) {
  const configured = String(process.env[key] || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : fallback;
}

export const classMonitorEmails = () => listFromEnv("CLASS_MONITOR_EMAILS", DEFAULT_MONITOR_EMAILS);
export const classMonitorReviewerEmails = () => listFromEnv("CLASS_MONITOR_REVIEWER_EMAILS", DEFAULT_REVIEWER_EMAILS);

export function isClassMonitorPerson(user: { email?: unknown; username?: unknown }) {
  return classMonitorEmails().some((value) => matchesLoginIdentifier(user, value));
}

export function isClassMonitorReviewer(user: { email?: unknown; username?: unknown }) {
  return classMonitorReviewerEmails().some((value) => matchesLoginIdentifier(user, value));
}

export type MonitorRecipient = { userId: string; name: string; email: string };

function toRecipient(user: any): MonitorRecipient {
  return { userId: String(user?._id || ""), name: String(user?.name || "").trim(), email: String(user?.email || "").trim().toLowerCase() };
}

async function activeUsersFor(identifiers: string[]) {
  await dbConnect();
  const users: any[] = await User.find({ ...loginIdentifiersFilter(identifiers), isActive: { $ne: false } }).select(STAFF_FIELDS).lean();
  return identifiers.map((value) => users.find((user) => matchesLoginIdentifier(user, value))).filter(Boolean);
}

/** The first active monitor's user ID - the class tasks are assigned to them - or null (the tasks then go to the admins' pool). */
export async function classMonitorOwnerId(): Promise<string | null> {
  const [first] = await activeUsersFor(classMonitorEmails());
  return first ? String(first._id) : null;
}

/** Dhritabrata and Sayan Bose by default; the static contact list only if neither has an active account. */
export async function classMonitorReviewers(): Promise<MonitorRecipient[]> {
  const identifiers = classMonitorReviewerEmails();
  const users = await activeUsersFor(identifiers);
  const seen = new Set<string>();
  const resolved = users.map(toRecipient).filter((person) => person.email && !seen.has(person.email) && seen.add(person.email));
  if (resolved.length) return resolved;
  console.warn("Class Monitor: no reviewer found in the user directory, using the configured contact list.");
  return importantContactsByKeys(["dhritabrata", "sayan_bose"])
    .filter((contact) => contact.email && identifiers.includes(contact.email.toLowerCase()))
    .map((contact) => ({ userId: "", name: contact.name, email: contact.email.toLowerCase() }));
}
