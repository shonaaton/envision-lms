/**
 * Contact resolution for student-facing messages.
 *
 * The academy holds one email address and one phone number per family, so a
 * message worded for a parent and a message worded for the student arrive in
 * the same inbox. WhatsApp already collapses that pair on its own —
 * `automationDedupKey()` in `whatsappAutomationEvents.ts` keys on the resolved
 * phone number and `recipientTypePriority()` ranks the parent wording above the
 * student wording. Email had no equivalent guard, so a paired send delivered
 * two copies to the same address.
 *
 * `resolveAudienceEmails()` is that guard. Build both payloads as before, pass
 * them through, and send whatever comes back.
 */

export type StudentContact = {
  /** The single address to write to: the parent's when known, else the student's. */
  email: string;
  emailSource: "parent" | "student" | "missing";
  /** Who to greet — the parent's name when known, else the student's. */
  contactName: string;
  parentName: string;
  studentName: string;
  phone: string;
  countryCode: string;
};

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function resolveStudentContact(student: any): StudentContact {
  const parentName = String(student?.parentName || "").trim();
  const parentEmail = normalizeEmail(student?.parentEmail);
  const studentName = String(student?.name || student?.username || "Student").trim();
  const studentEmail = normalizeEmail(student?.email);
  return {
    email: parentEmail || studentEmail,
    emailSource: parentEmail ? "parent" : studentEmail ? "student" : "missing",
    contactName: parentName || studentName,
    parentName,
    studentName,
    phone: String(student?.phone || "").trim(),
    countryCode: String(student?.countryCode || "").trim(),
  };
}

/**
 * Picks which of a paired student/parent email actually goes out.
 *
 * Both addresses the same (the normal case — one inbox per family): the
 * parent-worded copy wins, matching what WhatsApp already does. Genuinely
 * different addresses: both send, so a family that really does keep two
 * mailboxes keeps both. Either side missing: whatever remains sends alone.
 *
 * Payloads are compared on `to` after trimming and lowercasing, so addresses
 * that differ only in case still count as one inbox.
 */
export function resolveAudienceEmails<T extends { to?: unknown }>(
  studentSend?: T | null,
  parentSend?: T | null,
): T[] {
  const studentTo = normalizeEmail(studentSend?.to);
  const parentTo = normalizeEmail(parentSend?.to);
  const student = studentTo ? studentSend ?? null : null;
  const parent = parentTo ? parentSend ?? null : null;
  if (student && parent && studentTo === parentTo) return [parent];
  return [student, parent].filter(Boolean) as T[];
}
