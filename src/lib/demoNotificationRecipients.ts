import "server-only";

import { dbConnect } from "@/lib/db";
import { importantContactsByKeys, importantContactsByRole, type ImportantContact } from "@/lib/importantContacts";
import { AccessRole } from "@/models/AccessRole";
import { User } from "@/models/User";

/**
 * Who hears about a new demo, resolved from the platform's own user records.
 *
 * The static `importantContacts` list is a deploy-time constant: adding a
 * salesperson there means an env change and a redeploy, and a number that
 * changes in the admin user directory keeps going to the old phone. A demo
 * lead is time-sensitive enough that it must follow the live directory, so
 * this reads `User` and falls back to the static list only when the lookup
 * comes back empty (see `withFallback`) - a silent zero-recipient send is the
 * one outcome worse than a stale number.
 */

/** Seeded by `ensureSalesRole()`; every salesperson carries it on `User.accessRole`. */
export const SALES_ACCESS_ROLE_NAME_KEY = "sales and relationship management";

/**
 * The sub-admin who owns demo follow-up. Held as an email rather than a name
 * because `User.email` is unique and indexed, while names are neither.
 */
const DEFAULT_DEMO_SUB_ADMIN_EMAILS = ["saptarshi2856@gmail.com"];

const STAFF_FIELDS = "_id name email phone countryCode role";

export type DemoStaffRole = "sales" | "sub_admin";

export type DemoStaffRecipient = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  countryCode: string;
  role: DemoStaffRole;
};

export function demoSubAdminEmails() {
  const configured = String(process.env.DEMO_SUB_ADMIN_NOTIFY_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_DEMO_SUB_ADMIN_EMAILS;
}

function toRecipient(user: any, role: DemoStaffRole): DemoStaffRecipient {
  return {
    userId: user?._id?.toString?.() || "",
    name: String(user?.name || "").trim(),
    email: String(user?.email || "").trim().toLowerCase(),
    phone: String(user?.phone || "").trim(),
    countryCode: String(user?.countryCode || "").trim(),
    role,
  };
}

function contactToRecipient(contact: ImportantContact, role: DemoStaffRole): DemoStaffRecipient {
  // Static rows already carry the country code inside `phone`, so leave
  // `countryCode` empty rather than prefixing it a second time.
  return { userId: "", name: contact.name, email: contact.email, phone: contact.phone, countryCode: "", role };
}

/** A recipient we can actually reach - anything else is dropped before sending. */
function isReachable(recipient: DemoStaffRecipient) {
  return Boolean(recipient.phone || recipient.email);
}

export function dedupeDemoRecipients(recipients: DemoStaffRecipient[]) {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    if (!isReachable(recipient)) return false;
    // Sales role and sub-admin duty can sit on one account; identity is the
    // person, not the hat, so the same user is only messaged once.
    const key = recipient.userId || recipient.email || recipient.phone;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withFallback(resolved: DemoStaffRecipient[], fallback: () => DemoStaffRecipient[], label: string) {
  const reachable = resolved.filter(isReachable);
  if (reachable.length) return reachable;
  console.warn(`Demo notification: no ${label} found in the user directory, using the configured contact list.`);
  return fallback().filter(isReachable);
}

/** Everyone holding the sales access role, active accounts only. */
export async function demoSalesRecipients(): Promise<DemoStaffRecipient[]> {
  const roles: any[] = await AccessRole.find({
    nameKey: SALES_ACCESS_ROLE_NAME_KEY,
    isActive: true,
    archivedAt: null,
  })
    .select("_id")
    .lean();
  const users: any[] = roles.length
    ? await User.find({ accessRole: { $in: roles.map((role) => role._id) }, isActive: { $ne: false } })
        .select(STAFF_FIELDS)
        .sort({ name: 1 })
        .lean()
    : [];
  return withFallback(
    users.map((user) => toRecipient(user, "sales")),
    () => importantContactsByRole("sales").map((contact) => contactToRecipient(contact, "sales")),
    "salesperson"
  );
}

/** The sub-admin(s) named in `DEMO_SUB_ADMIN_NOTIFY_EMAILS`, active accounts only. */
export async function demoSubAdminRecipients(): Promise<DemoStaffRecipient[]> {
  const emails = demoSubAdminEmails();
  const users: any[] = emails.length
    ? await User.find({ email: { $in: emails }, role: "sub-admin", isActive: { $ne: false } })
        .select(STAFF_FIELDS)
        .lean()
    : [];
  return withFallback(
    users.map((user) => toRecipient(user, "sub_admin")),
    // Match the static list on the same emails so the fallback notifies the
    // same people, not every sub-admin on the list.
    () =>
      importantContactsByKeys(["saptarshi"])
        .filter((contact) => !contact.email || emails.includes(contact.email))
        .map((contact) => contactToRecipient(contact, "sub_admin")),
    "demo sub-admin"
  );
}

/** Every active sub-admin, not just the one who owns demo scheduling. */
export async function allSubAdminRecipients(): Promise<DemoStaffRecipient[]> {
  const users: any[] = await User.find({ role: "sub-admin", isActive: { $ne: false } })
    .select(STAFF_FIELDS)
    .sort({ name: 1 })
    .lean();
  return withFallback(
    users.map((user) => toRecipient(user, "sub_admin")),
    () => importantContactsByRole("sub-admin").map((contact) => contactToRecipient(contact, "sub_admin")),
    "sub-admin"
  );
}

/**
 * Sales team + the demo sub-admin, deduped. Both channels send to the same
 * list so a lead never reaches someone by email but not WhatsApp.
 */
export async function demoNotificationRecipients() {
  await dbConnect();
  const [sales, subAdmins] = await Promise.all([demoSalesRecipients(), demoSubAdminRecipients()]);
  return { sales, subAdmins, all: dedupeDemoRecipients([...sales, ...subAdmins]) };
}

/**
 * Who reads a submitted demo assessment: the sales team plus the whole
 * sub-admin bench. Wider than `demoNotificationRecipients` on purpose - a
 * request needs one owner to action it, but the finished assessment is what
 * sales and relationship staff act on to convert the lead, so everyone who
 * might make that call sees it.
 */
export async function demoFeedbackNotificationRecipients() {
  await dbConnect();
  const [sales, subAdmins] = await Promise.all([demoSalesRecipients(), allSubAdminRecipients()]);
  return { sales, subAdmins, all: dedupeDemoRecipients([...sales, ...subAdmins]) };
}

/**
 * Admins and sub-admins who are NOT on the Sales role. Salespeople are
 * `sub-admin` accounts carrying the Sales access role, so a plain
 * `role: "sub-admin"` query pages the whole sales bench - which is how invoice
 * and every-demo alerts kept reaching salespeople who do not own the lead.
 */
export async function nonSalesStaffFilter() {
  const roles: any[] = await AccessRole.find({ nameKey: SALES_ACCESS_ROLE_NAME_KEY }).select("_id").lean();
  const salesIds = roles.map((role) => role._id);
  return {
    role: { $in: ["admin", "sub-admin"] },
    isActive: { $ne: false },
    ...(salesIds.length ? { accessRole: { $nin: salesIds } } : {}),
  };
}

/** Sayan Bose and Saptarshi: the only staff who hear about invoices. */
const DEFAULT_INVOICE_NOTIFY_EMAILS = ["sayanthsbose@gmail.com", "saptarshi2856@gmail.com"];

export function invoiceNotifyEmails() {
  const configured = String(process.env.INVOICE_NOTIFY_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_INVOICE_NOTIFY_EMAILS;
}

/**
 * Staff alerted about invoices (created, due, overdue, credit recharge). Named
 * people by email, never "every sub-admin" - see `nonSalesStaffFilter`.
 */
export async function invoiceStaffRecipients(): Promise<DemoStaffRecipient[]> {
  await dbConnect();
  const emails = invoiceNotifyEmails();
  const users: any[] = await User.find({ email: { $in: emails }, isActive: { $ne: false } })
    .select(STAFF_FIELDS)
    .sort({ name: 1 })
    .lean();
  return withFallback(
    users.map((user) => toRecipient(user, "sub_admin")),
    () =>
      importantContactsByKeys(["sayan_bose", "saptarshi"])
        .filter((contact) => !contact.email || emails.includes(contact.email))
        .map((contact) => contactToRecipient(contact, "sub_admin")),
    "invoice staff"
  );
}

/** One staff account as a recipient, or null when it is gone or deactivated. */
export async function staffRecipientById(userId: unknown, role: DemoStaffRole = "sales"): Promise<DemoStaffRecipient | null> {
  const id = String((userId as any)?._id || userId || "");
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  await dbConnect();
  const user: any = await User.findOne({ _id: id, isActive: { $ne: false } }).select(STAFF_FIELDS).lean();
  if (!user) return null;
  const recipient = toRecipient(user, role);
  return isReachable(recipient) ? recipient : null;
}
