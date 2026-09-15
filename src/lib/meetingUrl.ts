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

/**
 * A Meet link typed into a form. `url` is always absolute or empty: a link saved
 * without "https://" rendered as a relative href and sent people to a portal 404.
 * `error` is set only when something was pasted that is not a Meet room.
 */
export function parseMeetingUrlInput(value?: FormDataEntryValue | string | null) {
  const raw = String(value || "").trim();
  const url = normalizeGoogleMeetUrl(raw);
  return { url, error: raw && !url ? "Paste the Google Meet room link, like https://meet.google.com/abc-defg-hij." : "" };
}
