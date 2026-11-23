import { resolvePublicAppUrl } from "@/lib/appUrl";

/**
 * The link a Bowbazar fee reminder carries to the family's UPI pay page
 * (/pay/bowbazar/<studentId>/<sig>). Like the online non-GST pay link, it is
 * signed rather than stored, so every reminder for a student sends the same
 * working link. The page reads the balance live.
 *
 * Reached from feeJobs.ts and so from instrumentation.ts: crypto is loaded at
 * call time, never imported, or the Edge compile breaks.
 */
function nodeCrypto(): typeof import("crypto") {
  return eval("require")("crypto");
}

function signingSecret() {
  const secret = String(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "").trim();
  if (secret) return secret;
  return process.env.NODE_ENV === "production" ? "" : "development-upi-pay-secret";
}

export function branchPaySignature(studentId: string) {
  const secret = signingSecret();
  if (!secret) return "";
  return nodeCrypto().createHmac("sha256", secret).update(`branch-pay:${studentId}`).digest("base64url").slice(0, 32);
}

export function verifyBranchPaySignature(studentId: string, signature: string) {
  const expected = branchPaySignature(studentId);
  if (!expected || !signature || expected.length !== signature.length) return false;
  return nodeCrypto().timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function branchPayPageUrl(studentId: string, request?: Request) {
  const baseUrl = resolvePublicAppUrl(request, { allowRequestHeaders: Boolean(request) });
  const signature = branchPaySignature(studentId);
  return baseUrl && signature ? `${baseUrl}/pay/bowbazar/${studentId}/${signature}` : "";
}
