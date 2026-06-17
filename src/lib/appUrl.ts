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
  const forwardedHost = req?.headers.get("x-forwarded-host");
  const host = req?.headers.get("host");
  const forwardedProto = req?.headers.get("x-forwarded-proto");

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

  return "http://localhost:3000";
}
