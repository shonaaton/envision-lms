export type ImportantContactRole = "admin" | "sub-admin" | "sales";

export type ImportantContact = {
  role: ImportantContactRole;
  key: string;
  name: string;
  phone: string;
  email: string;
};

function cleanPart(value: unknown) {
  return String(value || "").trim();
}

function normalizeKey(value: unknown) {
  return cleanPart(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeRole(value: unknown): ImportantContactRole | "" {
  const clean = cleanPart(value).toLowerCase().replace(/[_\s]+/g, "-");
  if (clean === "admin") return "admin";
  if (clean === "sub-admin" || clean === "subadmin") return "sub-admin";
  if (clean === "sales" || clean === "salesperson") return "sales";
  return "";
}

function normalizePhone(value: unknown) {
  const digits = cleanPart(value).replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? `91${digits}` : digits;
}

function parseContactRow(row: string): ImportantContact | null {
  const [roleValue, keyValue, nameValue, phoneValue, emailValue] = row.split(":");
  const role = normalizeRole(roleValue);
  const key = normalizeKey(keyValue);
  const name = cleanPart(nameValue);
  const phone = normalizePhone(phoneValue);
  const email = cleanPart(emailValue).toLowerCase();
  if (!role || !key || !name || !phone) return null;
  return { role, key, name, phone, email };
}

export function importantContacts() {
  return String(process.env.LMS_IMPORTANT_CONTACTS || "")
    .split("|")
    .map((row) => parseContactRow(row.trim()))
    .filter(Boolean) as ImportantContact[];
}

export function importantContactsByRole(role: ImportantContactRole) {
  return importantContacts().filter((contact) => contact.role === role);
}

export function importantContactByKey(key: string) {
  const normalizedKey = normalizeKey(key);
  return importantContacts().find((contact) => contact.key === normalizedKey) || null;
}

export function importantContactsByKeys(keys: string[]) {
  const normalizedKeys = new Set(keys.map(normalizeKey).filter(Boolean));
  if (!normalizedKeys.size) return [];
  return importantContacts().filter((contact) => normalizedKeys.has(contact.key));
}

export function importantContactsFromEnvKeys(envKey: string, fallbackRole?: ImportantContactRole) {
  const selectedKeys = String(process.env[envKey] || "")
    .split(",")
    .map(normalizeKey)
    .filter(Boolean);
  if (selectedKeys.length) return importantContactsByKeys(selectedKeys);
  return fallbackRole ? importantContactsByRole(fallbackRole) : [];
}

export function importantContactPhones(role: ImportantContactRole) {
  return Array.from(new Set(importantContactsByRole(role).map((contact) => contact.phone).filter(Boolean)));
}

export function importantContactEmails(role: ImportantContactRole) {
  return Array.from(new Set(importantContactsByRole(role).map((contact) => contact.email).filter(Boolean)));
}

export function importantContactPhonesByKeys(keys: string[]) {
  return Array.from(new Set(importantContactsByKeys(keys).map((contact) => contact.phone).filter(Boolean)));
}

export function importantContactEmailsByKeys(keys: string[]) {
  return Array.from(new Set(importantContactsByKeys(keys).map((contact) => contact.email).filter(Boolean)));
}
