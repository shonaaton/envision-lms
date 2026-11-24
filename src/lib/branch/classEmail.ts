import { ACADEMY_DEFAULTS, ACADEMY_LOGO_URL } from "@/lib/branding";

/**
 * The branded email for a change to a Bowbazar online class: the academy's
 * logo on the purple header with the gold rule, the change in a card, and a
 * button to the family's Bowbazar page. Sent with `htmlIsFinal` so the email
 * workflow passes it through untouched (its own layout has no logo).
 */

const BRAND = "#5a1372";
const BRAND_DARK = "#3d0c4e";
const ACCENT = "#fde75a";
const INK = "#1f1330";
const MUTED = "#6b5a78";
const LINE = "#ece3f2";
const SOFT = "#faf6fd";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type ClassEmail = {
  /** Small gold label over the title, e.g. "Class cancelled". */
  label: string;
  /** The class's name. */
  title: string;
  recipientName: string;
  /** The change in one or two sentences. */
  message: string;
  /** Rows in the card: "When", "New time", "Reason"... */
  details: { label: string; value: string; strike?: boolean }[];
  buttonUrl?: string;
  buttonLabel?: string;
};

export function classEmailHtml(email: ClassEmail) {
  const rows = email.details
    .filter((row) => row.value)
    .map(
      (row) => `<tr>
        <td style="padding:8px 0;font-size:13px;color:${MUTED};width:110px;vertical-align:top">${escapeHtml(row.label)}</td>
        <td style="padding:8px 0;font-size:15px;color:${INK};font-weight:700;${row.strike ? "text-decoration:line-through;color:#9b8aa8;" : ""}">${escapeHtml(row.value)}</td>
      </tr>`
    )
    .join("");
  const button = email.buttonUrl
    ? `<tr><td align="center" style="padding:24px 28px 4px">
        <a href="${escapeHtml(email.buttonUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;font-size:14px">${escapeHtml(email.buttonLabel || "Open my Bowbazar page")}</a>
      </td></tr>`
    : "";
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f4eef8;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${LINE}">
  <tr><td style="background:${BRAND};background-image:linear-gradient(135deg,${BRAND} 0%,${BRAND_DARK} 100%);padding:26px 28px 24px">
    <img src="${ACADEMY_LOGO_URL}" alt="${escapeHtml(ACADEMY_DEFAULTS.academyName)}" height="34" style="display:block;height:34px;border:0" />
    <div style="padding-top:18px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${ACCENT}">${escapeHtml(email.label)} · Bowbazar centre</div>
    <div style="padding-top:4px;font-size:26px;line-height:32px;font-weight:800;color:#ffffff">${escapeHtml(email.title)}</div>
  </td></tr>
  <tr><td style="height:5px;background:${ACCENT};font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td style="padding:24px 28px 0">
    <div style="font-size:15px;line-height:23px;color:${INK}">Hello ${escapeHtml(email.recipientName)},</div>
    <div style="padding-top:8px;font-size:15px;line-height:23px;color:${INK}">${escapeHtml(email.message)}</div>
  </td></tr>
  ${rows ? `<tr><td style="padding:18px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${SOFT};border:1px solid ${LINE};border-radius:14px;padding:8px 16px">${rows}</table>
  </td></tr>` : ""}
  ${button}
  <tr><td style="padding:26px 28px 24px">
    <div style="border-top:1px solid ${LINE};padding-top:16px;font-size:12px;line-height:18px;color:${MUTED}">
      Team ${escapeHtml(ACADEMY_DEFAULTS.academyName)} · Bowbazar centre<br/>Reply to this email or message the centre on WhatsApp if you have a question.
    </div>
  </td></tr>
</table>
</td></tr>
</table>`;
}
