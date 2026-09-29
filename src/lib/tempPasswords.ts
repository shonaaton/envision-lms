/**
 * Temporary passwords are kept so an admin can copy a new account's login and
 * pass it on ("Copy temporary credentials" on the Users screen), until the
 * person sets their own. They used to be stored as plain text. They are now
 * sealed with AES-256-GCM under a key derived from the server's AUTH_SECRET, so
 * a database copy or backup does not hand them out.
 *
 * The User model seals on every write (a schema setter), so no caller has to
 * remember to. The two admin endpoints that return them to Super Admins open
 * them. Plain values written before this change still open as they are, and a
 * daily job seals them (`tempPasswordMigration.ts`).
 *
 * Rotating AUTH_SECRET makes stored ones unreadable. Those accounts then show
 * no copyable password, and Reset Password issues a new one.
 */

const PREFIX = "enc:v1:";

/**
 * Node's crypto, loaded when first used. The User model imports this file, and
 * Next.js also compiles instrumentation.ts - which reaches the model - for the
 * Edge runtime, where a static `import "crypto"` fails the whole build. The
 * same reason runtimeLogger loads `fs` this way. Mongoose setters must be
 * synchronous, so the async Web Crypto API is not an option.
 */
function nodeCrypto() {
  return eval("require")("crypto") as typeof import("crypto");
}

function sealingKey() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (!secret) return null;
  return Buffer.from(nodeCrypto().hkdfSync("sha256", secret, "envision-lms", "temp-password:v1", 32));
}

export function isSealedTempPassword(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Seals a plain temporary password. Already-sealed and empty values pass through. */
export function sealTempPassword<T>(value: T): T | string {
  if (typeof value !== "string" || !value || isSealedTempPassword(value)) return value;
  const key = sealingKey();
  // Without AUTH_SECRET sign-in itself does not work; keep the value usable.
  if (!key) return value;
  const { createCipheriv, randomBytes } = nodeCrypto();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${[iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".")}`;
}

/** The plain password, or undefined when there is none or it cannot be opened. */
export function openTempPassword(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (!isSealedTempPassword(value)) return value;
  const key = sealingKey();
  if (!key) return undefined;
  try {
    const [iv, tag, ciphertext] = value.slice(PREFIX.length).split(".").map((part) => Buffer.from(part, "base64url"));
    const decipher = nodeCrypto().createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}

/** A copy of a user record with its temporary password opened, for admin responses. */
export function withOpenTempPassword<T extends Record<string, any>>(user: T): T {
  if (!user || !("tempPassword" in user)) return user;
  const opened = openTempPassword(user.tempPassword);
  const copy: Record<string, any> = { ...user };
  if (opened) copy.tempPassword = opened;
  else delete copy.tempPassword;
  return copy as T;
}
