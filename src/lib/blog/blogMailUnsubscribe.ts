/**
 * Signed unsubscribe links for the "new blog post" email.
 *
 * The link names the recipient record (`BlogMailRecipient._id`), never the
 * email address, and carries an HMAC of it, so nobody can unsubscribe someone
 * else by editing the URL. It uses Web Crypto rather than `crypto`: this file
 * is reachable from instrumentation.ts, which is also compiled for the Edge
 * runtime, where a Node `crypto` import breaks the build.
 */

function signingSecret() {
  const secret = String(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "").trim();
  if (secret) return secret;
  return process.env.NODE_ENV === "production" ? "" : "development-blog-mail-secret";
}

function base64url(bytes: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function blogUnsubscribeSignature(recipientId: string) {
  const secret = signingSecret();
  if (!secret) return "";
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, encoder.encode(`blog-unsubscribe:${recipientId}`));
  return base64url(signature).slice(0, 32);
}

export async function verifyBlogUnsubscribeSignature(recipientId: string, signature: string) {
  const expected = await blogUnsubscribeSignature(recipientId);
  if (!expected || !signature || expected.length !== signature.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  return diff === 0;
}

export async function blogUnsubscribeUrl(baseUrl: string, recipientId: string) {
  const signature = await blogUnsubscribeSignature(recipientId);
  return signature ? `${baseUrl.replace(/\/+$/, "")}/unsubscribe/blog/${recipientId}/${signature}` : "";
}

/** "ri***@gmail.com": enough for the reader to recognise, not enough to harvest. */
export function maskEmail(email: string) {
  const [local, domain] = String(email || "").split("@");
  if (!domain) return "";
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(local.length - 2, 6)))}@${domain}`;
}
