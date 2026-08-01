function normalizeExternalUrl(value?: string | null) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return "";
  }
}

export const MARKETING_BASE_URL =
  normalizeExternalUrl(process.env.NEXT_PUBLIC_MARKETING_URL) ||
  "https://www.envisionchessacademy.com";

export const POLICY_BASE_URL =
  normalizeExternalUrl(process.env.NEXT_PUBLIC_POLICY_BASE_URL) ||
  MARKETING_BASE_URL;

export const LEGAL_LINKS = {
  privacy: `${POLICY_BASE_URL}/privacy-policy`,
  terms: `${POLICY_BASE_URL}/terms-and-conditions`,
  refund: `${POLICY_BASE_URL}/refund-policy`,
};

export const OFFLINE_ACADEMY_URL = `${MARKETING_BASE_URL}/chess-academy-in-kolkata`;
