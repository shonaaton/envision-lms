import { User } from "@/models/User";

/**
 * Contact matching between the CRM and the portal.
 *
 * The CRM stores a single formatted phone string ("+91-9123456789") while the
 * portal keeps `countryCode` and `phone` apart, so neither side can be compared
 * literally. Both are reduced to the last 10 digits, which is what actually
 * survives every formatting variant the two systems produce.
 */
const PHONE_KEY_LENGTH = 10;

export function phoneKey(...parts: Array<string | null | undefined>) {
  const digits = parts.map((part) => String(part || "")).join("").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > PHONE_KEY_LENGTH ? digits.slice(-PHONE_KEY_LENGTH) : digits;
}

export function emailKey(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

/** Phone spellings the portal may have stored, for matching against `User.phone`. */
export function phoneVariants(rawPhone?: string | null) {
  const key = phoneKey(rawPhone);
  if (!key) return [];
  const defaultCountryCode = String(process.env.CRM_DEFAULT_COUNTRY_CODE || "91").replace(/\D/g, "");
  return Array.from(
    new Set([
      key,
      `+${key}`,
      `${defaultCountryCode}${key}`,
      `+${defaultCountryCode}${key}`,
      `${defaultCountryCode}-${key}`,
      String(rawPhone || "").trim(),
    ].filter(Boolean))
  );
}

export type CrmContact = {
  phone?: string | null;
  email?: string | null;
};

/**
 * Resolve a CRM lead to a portal user. Phone wins over email: the registration
 * flow already treats phone as the stronger identity when enforcing the
 * one-free-demo rule, so the two stay consistent.
 */
export async function findUserForCrmContact(contact: CrmContact) {
  const phone = phoneKey(contact.phone);
  const email = emailKey(contact.email);

  if (phone) {
    const byPhone = await User.findOne({
      role: "student",
      phone: { $in: phoneVariants(contact.phone) },
    })
      .select("_id name email phone countryCode accountStatus isActive")
      .sort({ createdAt: -1 })
      .lean();
    if (byPhone) return byPhone;
  }

  if (email) {
    const byEmail = await User.findOne({ role: "student", email })
      .select("_id name email phone countryCode accountStatus isActive")
      .lean();
    if (byEmail) return byEmail;
  }

  return null;
}

export function contactKeysForUser(user: { phone?: string | null; countryCode?: string | null; email?: string | null }) {
  return {
    phoneKey: phoneKey(user.phone),
    emailKey: emailKey(user.email),
  };
}

/** Phone in the format the CRM expects: country code + national number. */
export function crmPhoneNumber(user: { phone?: string | null; countryCode?: string | null }) {
  const national = phoneKey(user.phone);
  if (!national) return "";
  const raw = String(user.phone || "").replace(/\D/g, "");
  const stored = String(user.countryCode || "").replace(/\D/g, "");
  // A phone already stored with its country code should not get a second one.
  const countryCode = raw.length > national.length ? raw.slice(0, raw.length - national.length) : stored || String(process.env.CRM_DEFAULT_COUNTRY_CODE || "91").replace(/\D/g, "");
  return `+${countryCode}${national}`;
}
