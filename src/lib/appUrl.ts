function normalizeBaseUrl(value?: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    const host = String(url.hostname || "").toLowerCase();
    if (!host || host === "0.0.0.0" || host === "127.0.0.1" || host === "localhost") return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function resolvePublicAppUrl(req?: Request) {
  const origin = normalizeBaseUrl(req?.headers.get("origin"));
  if (origin) return origin;

  const forwardedHost = req?.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = req?.headers.get("host")?.split(",")[0]?.trim();
  const forwardedProto = req?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();

  const fromForwardedHeaders =
    forwardedHost && normalizeBaseUrl(`${forwardedProto || "https"}://${forwardedHost}`);
  if (fromForwardedHeaders) return fromForwardedHeaders;

  const fromHostHeader = host && normalizeBaseUrl(`${forwardedProto || "https"}://${host}`);
  if (fromHostHeader) return fromHostHeader;

  const envCandidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.LMS_HOST,
  ];

  for (const candidate of envCandidates) {
    const normalized = normalizeBaseUrl(candidate);
    if (normalized) return normalized;
  }

  return process.env.NODE_ENV === "production" ? "" : "http://localhost:3000";
}
