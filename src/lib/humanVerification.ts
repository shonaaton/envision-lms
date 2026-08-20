export function getTurnstileSiteKey() {
  return String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();
}

function getTurnstileSecretKey() {
  return String(process.env.TURNSTILE_SECRET_KEY || "").trim();
}

export function isTurnstileEnabled() {
  return Boolean(getTurnstileSiteKey() && getTurnstileSecretKey());
}

export async function verifyTurnstileToken(token: string, remoteIp?: string | null) {
  if (!isTurnstileEnabled()) return { ok: true, skipped: true };
  const responseToken = String(token || "").trim();
  if (!responseToken) return { ok: false, skipped: false, reason: "missing_token" };

  const form = new URLSearchParams();
  form.set("secret", getTurnstileSecretKey());
  form.set("response", responseToken);
  if (remoteIp) form.set("remoteip", remoteIp);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: Boolean(response.ok && payload?.success),
      skipped: false,
      reason: Array.isArray(payload?.["error-codes"]) ? String(payload["error-codes"][0] || "verification_failed") : "verification_failed",
    };
  } catch {
    return { ok: false, skipped: false, reason: "verification_unavailable" };
  }
}
