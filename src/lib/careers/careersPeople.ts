import "server-only";

import { dbConnect } from "@/lib/db";
import { importantContactsByKeys } from "@/lib/importantContacts";
import { loginIdentifiersFilter, matchesLoginIdentifier } from "@/lib/loginIdentity";
import { User } from "@/models/User";

import { careersReviewerEmails } from "@/lib/careers/careersReviewerIds";

export { careersReviewerEmails, isCareersAudience, isCareersReviewer } from "@/lib/careers/careersReviewerIds";

/**
 * The careers reviewers (Sayan Bose and Dhritabrata Kundu, careersReviewerIds.ts)
 * as accounts: they get every new application by email + in-app notification,
 * and the review task goes to the first of them.
 */
export type CareersRecipient = { userId: string; name: string; email: string };

/** The reviewers with an active account, in the configured order; the static contact list only if neither has one. */
export async function careersReviewers(): Promise<CareersRecipient[]> {
  const identifiers = careersReviewerEmails();
  await dbConnect();
  const users: any[] = await User.find({ ...loginIdentifiersFilter(identifiers), isActive: { $ne: false } }).select("_id name email username").lean();
  const ordered = identifiers.map((value) => users.find((user) => matchesLoginIdentifier(user, value))).filter(Boolean);
  const seen = new Set<string>();
  const resolved = ordered
    .map((user: any) => ({ userId: String(user._id), name: String(user.name || "").trim(), email: String(user.email || "").trim().toLowerCase() }))
    .filter((person) => person.email && !seen.has(person.email) && seen.add(person.email));
  if (resolved.length) return resolved;
  console.warn("Careers: no reviewer found in the user directory, using the configured contact list.");
  return importantContactsByKeys(["sayan_bose", "dhritabrata"])
    .filter((contact) => contact.email && identifiers.includes(contact.email.toLowerCase()))
    .map((contact) => ({ userId: "", name: contact.name, email: contact.email.toLowerCase() }));
}
