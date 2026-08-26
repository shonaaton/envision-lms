export function normalizeGoogleMeetUrl(value?: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  try {
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "meet.google.com") return "";
    const path = url.pathname.replace(/\/+$/, "");
    if (!path || path === "/new") return "";
    return url.toString();
  } catch {
    return "";
  }
}
