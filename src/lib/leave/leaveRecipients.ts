import "server-only";

import { dbConnect } from "@/lib/db";
import { importantContactsByKeys } from "@/lib/importantContacts";
import { User } from "@/models/User";

/**
 * Who decides on staff leave: every admin, plus the sub-admins named in
 * `LEAVE_APPROVER_EMAILS` (Dhritabrata and Sayan Bose by default). Named by
 * email because `User.email` is unique; resolved against the live user
 * directory, with the static contact list only as a fallback so a request is
 * never announced to nobody.
 */
const DEFAULT_LEAVE_APPROVER_EMAILS = ["dhritabratakundu06@gmail.com", "sayanthsbose@gmail.com"];
const STAFF_FIELDS = "_id name email phone countryCode role";

export type LeaveRecipient = { userId: string; name: string; email: string; phone: string; countryCode: string };

export function leaveApproverEmails() {
  const configured = String(process.env.LEAVE_APPROVER_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_LEAVE_APPROVER_EMAILS;
}

export function isNamedLeaveApprover(email: unknown) {
  const clean = String(email || "").trim().toLowerCase();
  return Boolean(clean) && leaveApproverEmails().includes(clean);
}

function toRecipient(user: any): LeaveRecipient {
  return {
    userId: String(user?._id || ""),
    name: String(user?.name || "").trim(),
    email: String(user?.email || "").trim().toLowerCase(),
    phone: String(user?.phone || "").trim(),
    countryCode: String(user?.countryCode || "").trim(),
  };
}

export function dedupeLeaveRecipients(recipients: LeaveRecipient[], excludeUserId = "") {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    if (excludeUserId && recipient.userId === excludeUserId) return false;
    if (!recipient.userId && !recipient.email && !recipient.phone) return false;
    const key = recipient.userId || recipient.email || recipient.phone;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Dhritabrata and Sayan Bose (or whoever `LEAVE_APPROVER_EMAILS` names). */
export async function namedApproverRecipients(excludeUserId = ""): Promise<LeaveRecipient[]> {
  await dbConnect();
  const emails = leaveApproverEmails();
  const users: any[] = await User.find({ email: { $in: emails }, isActive: { $ne: false } }).select(STAFF_FIELDS).sort({ name: 1 }).lean();
  const resolved = users.map(toRecipient);
  if (resolved.length) return dedupeLeaveRecipients(resolved, excludeUserId);
  console.warn("Leave: no named approver found in the user directory, using the configured contact list.");
  const fallback = importantContactsByKeys(["dhritabrata", "sayan_bose"])
    .filter((contact) => !contact.email || emails.includes(contact.email))
    .map((contact) => ({ userId: "", name: contact.name, email: contact.email, phone: contact.phone, countryCode: "" }));
  return dedupeLeaveRecipients(fallback, excludeUserId);
}

/** Every active admin. */
export async function adminRecipients(excludeUserId = ""): Promise<LeaveRecipient[]> {
  await dbConnect();
  const users: any[] = await User.find({ role: "admin", isActive: { $ne: false } }).select(STAFF_FIELDS).sort({ name: 1 }).lean();
  return dedupeLeaveRecipients(users.map(toRecipient), excludeUserId);
}

/** Everyone who may approve: admins and the named approvers, never the applicant. */
export async function approverRecipients(excludeUserId = ""): Promise<LeaveRecipient[]> {
  const [admins, named] = await Promise.all([adminRecipients(excludeUserId), namedApproverRecipients(excludeUserId)]);
  return dedupeLeaveRecipients([...admins, ...named], excludeUserId);
}

export async function leaveUserRecipient(userId: unknown): Promise<LeaveRecipient | null> {
  const id = String((userId as any)?._id ?? userId ?? "");
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  await dbConnect();
  const user: any = await User.findOne({ _id: id, isActive: { $ne: false } }).select(STAFF_FIELDS).lean();
  return user ? toRecipient(user) : null;
}
