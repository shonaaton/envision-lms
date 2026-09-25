/**
 * The monthly progress report email a family receives.
 *
 * Built only from the parent view of a report (`serializeFeedback` for a
 * student viewer), so the academy-only internal note is not even in scope
 * here. Table layout with inline styles because that is what mail clients
 * render reliably; no <html>/<body> shell so it also sits cleanly inside the
 * email webhook's own wrapper.
 *
 * Pure - unit-tested in feedbackEmail.test.ts.
 */

import { ACADEMY_DEFAULTS, ACADEMY_LOGO_URL, ACADEMY_PHONE_DISPLAY } from "@/lib/branding";
import { EFFORT_SKILL, RATING_SCALE, questionSetFor, ratingLabel } from "@/lib/feedback/feedbackQuestions";
import { monthLabel } from "@/lib/feedback/feedbackCycleDates";

const BRAND = "#5a1372";
const BRAND_DARK = "#3d0c4e";
const ACCENT = "#fde75a";
const INK = "#1f1330";
const MUTED = "#6b5a78";
const LINE = "#ece3f2";
const SOFT = "#faf6fd";

export type FeedbackEmailView = {
  month: string;
  tier: string;
  studentName: string;
  coachName: string;
  courseName: string;
  levelName: string;
  stats: { classesScheduled: number; classesAttended: number; topicsCovered: string[] };
  ratings: Record<string, number>;
  highlights: string[];
  focusAreas: string[];
  parentNote: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstName(name: string) {
  return String(name || "").trim().split(/\s+/)[0] || "your child";
}

function skillRows(view: FeedbackEmailView) {
  const set = questionSetFor(view.tier);
  return [...set.skills, EFFORT_SKILL]
    .filter((skill) => view.ratings?.[skill.key])
    .map((skill) => ({ label: skill.label, value: Number(view.ratings[skill.key]) }));
}

function ratingBar(value: number) {
  const max = RATING_SCALE.length;
  const cells = Array.from({ length: max }, (_, index) => {
    const filled = index < value;
    return `<td style="width:20%;padding:0 2px"><div style="height:8px;border-radius:4px;background:${filled ? BRAND : LINE};font-size:0;line-height:0">&nbsp;</div></td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${cells}</tr></table>`;
}

function listBlock(title: string, items: string[], icon: string) {
  if (!items.length) return "";
  const rows = items
    .map((item) => `<tr><td style="padding:4px 0;vertical-align:top;width:22px;color:${BRAND};font-size:14px">${icon}</td><td style="padding:4px 0;font-size:14px;line-height:20px;color:${INK}">${escapeHtml(item)}</td></tr>`)
    .join("");
  return `
  <tr><td style="padding:20px 28px 0">
    <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${MUTED};padding-bottom:6px">${escapeHtml(title)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
  </td></tr>`;
}

export function feedbackEmailSubject(view: Pick<FeedbackEmailView, "month" | "studentName">) {
  return `${firstName(view.studentName)}'s chess progress report - ${monthLabel(view.month)}`;
}

/** Plain-text twin of the HTML, for clients that will not render it. */
export function feedbackEmailText(view: FeedbackEmailView, input: { parentName?: string; portalUrl?: string }) {
  const lines = [
    `Dear ${input.parentName || "Parent"},`,
    "",
    `Here is ${firstName(view.studentName)}'s progress report for ${monthLabel(view.month)} from coach ${view.coachName || "the academy"}.`,
    "",
    `Course: ${[view.courseName, view.levelName].filter(Boolean).join(" - ") || questionSetFor(view.tier).tierLabel}`,
    `Classes attended: ${view.stats.classesAttended} of ${view.stats.classesScheduled}`,
    "",
    ...skillRows(view).map((row) => `${row.label}: ${ratingLabel(row.value)}`),
  ];
  if (view.highlights.length) lines.push("", "Highlights this month:", ...view.highlights.map((item) => `- ${item}`));
  if (view.focusAreas.length) lines.push("", "What we will work on next:", ...view.focusAreas.map((item) => `- ${item}`));
  if (view.parentNote) lines.push("", `A note from the coach: ${view.parentNote}`);
  lines.push("", "Warm regards,", ACADEMY_DEFAULTS.academyName);
  if (input.portalUrl) lines.push("", `View the full report: ${input.portalUrl}`);
  return lines.join("\n");
}

export function feedbackEmailHtml(view: FeedbackEmailView, input: { parentName?: string; portalUrl?: string }) {
  const set = questionSetFor(view.tier);
  const student = escapeHtml(view.studentName || "Your child");
  const month = escapeHtml(monthLabel(view.month));
  const course = escapeHtml([view.courseName, view.levelName].filter(Boolean).join(" · ") || set.tierLabel);
  const attended = Number(view.stats.classesAttended || 0);
  const scheduled = Number(view.stats.classesScheduled || 0);
  const topics = view.stats.topicsCovered || [];

  const skills = skillRows(view)
    .map(
      (row) => `
      <tr><td style="padding:10px 0;border-bottom:1px solid ${LINE}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
          <td style="font-size:14px;color:${INK};font-weight:600">${escapeHtml(row.label)}</td>
          <td align="right" style="font-size:12px;color:${BRAND};font-weight:700;white-space:nowrap">${escapeHtml(ratingLabel(row.value))}</td>
        </tr></table>
        <div style="padding-top:6px">${ratingBar(row.value)}</div>
      </td></tr>`
    )
    .join("");

  const topicsBlock = topics.length
    ? `<tr><td style="padding:20px 28px 0">
        <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${MUTED};padding-bottom:8px">Topics covered</div>
        <div>${topics
          .slice(0, 12)
          .map((topic) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:999px;background:${SOFT};border:1px solid ${LINE};font-size:12px;color:${INK}">${escapeHtml(topic)}</span>`)
          .join("")}</div>
      </td></tr>`
    : "";

  const noteBlock = view.parentNote
    ? `<tr><td style="padding:22px 28px 0">
        <div style="border-left:4px solid ${ACCENT};background:${SOFT};border-radius:0 12px 12px 0;padding:14px 16px">
          <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${MUTED};padding-bottom:6px">A note from Coach ${escapeHtml(firstName(view.coachName))}</div>
          <div style="font-size:15px;line-height:23px;color:${INK};font-style:italic">&ldquo;${escapeHtml(view.parentNote)}&rdquo;</div>
        </div>
      </td></tr>`
    : "";

  const button = input.portalUrl
    ? `<tr><td align="center" style="padding:26px 28px 4px">
        <a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;font-size:14px">View the full report</a>
      </td></tr>`
    : "";

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f4eef8;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${LINE}">
  <tr><td style="background:${BRAND};background-image:linear-gradient(135deg,${BRAND} 0%,${BRAND_DARK} 100%);padding:26px 28px 24px">
    <img src="${ACADEMY_LOGO_URL}" alt="${escapeHtml(ACADEMY_DEFAULTS.academyName)}" height="34" style="display:block;height:34px;border:0" />
    <div style="padding-top:18px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${ACCENT}">Monthly progress report</div>
    <div style="padding-top:4px;font-size:26px;line-height:32px;font-weight:800;color:#ffffff">${month}</div>
  </td></tr>
  <tr><td style="height:5px;background:${ACCENT};font-size:0;line-height:0">&nbsp;</td></tr>

  <tr><td style="padding:24px 28px 0">
    <div style="font-size:15px;line-height:23px;color:${INK}">Dear ${escapeHtml(input.parentName || "Parent")},</div>
    <div style="padding-top:8px;font-size:15px;line-height:23px;color:${INK}">Here is how <strong>${student}</strong> did at the board this month, from their coach <strong>${escapeHtml(view.coachName || "at the academy")}</strong>.</div>
  </td></tr>

  <tr><td style="padding:20px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0">
      <tr>
        <td style="background:${SOFT};border:1px solid ${LINE};border-radius:14px;padding:14px 16px">
          <div style="font-size:18px;font-weight:800;color:${INK}">${student}</div>
          <div style="padding-top:6px"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${ACCENT};color:${BRAND_DARK};font-size:12px;font-weight:700">${course}</span></div>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:12px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0">
      <tr>
        <td width="50%" style="padding-right:6px">
          <div style="border:1px solid ${LINE};border-radius:14px;padding:14px 16px;text-align:center">
            <div style="font-size:26px;font-weight:800;color:${BRAND}">${attended}<span style="font-size:15px;color:${MUTED};font-weight:600"> / ${scheduled}</span></div>
            <div style="font-size:12px;color:${MUTED};padding-top:2px">Classes attended</div>
          </div>
        </td>
        <td width="50%" style="padding-left:6px">
          <div style="border:1px solid ${LINE};border-radius:14px;padding:14px 16px;text-align:center">
            <div style="font-size:26px;font-weight:800;color:${BRAND}">${topics.length}</div>
            <div style="font-size:12px;color:${MUTED};padding-top:2px">Topics covered</div>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:22px 28px 0">
    <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${MUTED};padding-bottom:2px">Skills this month</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${skills}</table>
  </td></tr>
  ${topicsBlock}
  ${listBlock("Highlights this month", view.highlights, "&#9733;")}
  ${listBlock("What we'll work on next", view.focusAreas, "&#10140;")}
  ${noteBlock}
  ${button}

  <tr><td style="padding:24px 28px 26px">
    <div style="font-size:14px;line-height:22px;color:${INK}">Warm regards,<br /><strong>${escapeHtml(view.coachName || "Your coach")}</strong> &amp; the team at ${escapeHtml(ACADEMY_DEFAULTS.academyName)}</div>
  </td></tr>

  <tr><td style="background:${SOFT};border-top:1px solid ${LINE};padding:18px 28px;text-align:center">
    <div style="font-size:12px;line-height:19px;color:${MUTED}">
      <strong style="color:${BRAND}">${escapeHtml(ACADEMY_DEFAULTS.academyName)}</strong><br />
      ${escapeHtml(ACADEMY_DEFAULTS.affiliationLine)}<br />
      ${escapeHtml(ACADEMY_PHONE_DISPLAY)} &middot; ${escapeHtml(ACADEMY_DEFAULTS.email)} &middot; ${escapeHtml(ACADEMY_DEFAULTS.website)}
    </div>
  </td></tr>
</table>
</td></tr>
</table>`.trim();
}
