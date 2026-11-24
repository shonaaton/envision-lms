import { matchesLoginIdentifier } from "@/lib/loginIdentity";

/**
 * Who reviews job applications (user, 2026-11-24): Sayan Bose and Dhritabrata
 * Kundu, named by email (or portal user ID). Override with
 * CAREERS_REVIEWER_EMAILS (comma-separated). No database here, so auth.ts can
 * use it; resolving them to accounts is lib/careers/careersPeople.ts.
 */
const DEFAULT_REVIEWER_EMAILS = ["sayanthsbose@gmail.com", "dhritabratakundu06@gmail.com"];

export function careersReviewerEmails() {
  const configured = String(process.env.CAREERS_REVIEWER_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_REVIEWER_EMAILS;
}

export function isCareersReviewer(user: { email?: unknown; username?: unknown } | null | undefined) {
  if (!user) return false;
  return careersReviewerEmails().some((value) => matchesLoginIdentifier(user, value));
}

/** Admins and the named reviewers - everyone else (salespeople included) never sees Careers. */
export function isCareersAudience(user: { role?: unknown; email?: unknown; username?: unknown } | null | undefined) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.role === "sub-admin" && isCareersReviewer(user);
}
