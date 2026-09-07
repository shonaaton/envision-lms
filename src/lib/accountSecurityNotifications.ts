import { formatAcademyDateTime } from "@/lib/academyTime";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";

/**
 * Account security confirmations.
 *
 * Requesting a password reset notified the account holder; everything after it
 * did not. A password changed, an email swapped or a phone number replaced all
 * happened in silence — which is exactly the sequence an account takeover
 * relies on going unnoticed.
 *
 * These always go to the account's own address, never a parent's: the point is
 * to reach whoever holds the credentials.
 */

const SUPPORT_EMAIL = process.env.EMAIL_REPLY_TO || "support@envisionchessacademy.com";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function changeSourceLabel(source?: string) {
  if (source === "admin_reset") return "by an academy administrator";
  if (source === "forgot_password") return "using the forgot-password link";
  return "from your account settings";
}

export async function notifyPasswordChanged(user: any, source?: string) {
  if (!user?.email && !user?.phone) return { sent: 0 };
  const name = String(user.name || user.username || "there");
  const when = formatAcademyDateTime(new Date());
  const appUrl = resolvePublicAppUrl();
  const metadata = { kind: "password_changed", userId: objectId(user._id), href: "/settings" };

  const message = [
    `Hello ${name},`,
    "",
    `Your Envision Chess Academy password was changed ${changeSourceLabel(source)} on ${when}.`,
    "",
    `If this was you, nothing further is needed.`,
    `If it was not, contact us at ${SUPPORT_EMAIL} straight away and we will secure the account.`,
    appUrl ? "" : "",
  ].filter((line) => line !== "").join("\n");

  const email = user.email
    ? await sendAutomationEmail({
        to: String(user.email),
        subject: "Your academy password was changed",
        message,
        metadata,
      }).catch(() => null)
    : null;

  const whatsapp = await sendWhatsAppAutomationTemplate({
    user,
    templateName: "account_password_changed",
    bodyParameters: [name, when],
    metadata,
  }).catch(() => null);

  return { sent: Number(Boolean((email as any)?.delivered)) + Number(Boolean((whatsapp as any)?.delivered)) };
}

/**
 * Confirms a change of email or phone. The notice goes to the *previous*
 * address as well as the new one, so someone whose account was taken over
 * still hears about it at an address the attacker no longer controls.
 */
export async function notifyContactDetailsChanged(input: {
  user: any;
  previousEmail?: string;
  previousPhone?: string;
  changedBy?: "self" | "admin";
}) {
  const user = input.user;
  const name = String(user?.name || user?.username || "there");
  const when = formatAcademyDateTime(new Date());
  const changes: string[] = [];
  const newEmail = String(user?.email || "").trim().toLowerCase();
  const oldEmail = String(input.previousEmail || "").trim().toLowerCase();
  const newPhone = String(user?.phone || "").trim();
  const oldPhone = String(input.previousPhone || "").trim();

  if (oldEmail && newEmail && oldEmail !== newEmail) changes.push(`Email changed to ${newEmail}`);
  if (oldPhone && newPhone && oldPhone !== newPhone) changes.push(`Phone number changed to ${newPhone}`);
  if (!changes.length) return { sent: 0 };

  const metadata = { kind: "contact_details_changed", userId: objectId(user?._id), href: "/settings" };
  const message = [
    `Hello ${name},`,
    "",
    `The contact details on your Envision Chess Academy account were updated ${input.changedBy === "admin" ? "by an academy administrator" : "from your account settings"} on ${when}.`,
    "",
    ...changes,
    "",
    `If you did not expect this, contact us at ${SUPPORT_EMAIL} straight away.`,
  ].join("\n");

  // Both addresses, deduplicated — the old one is the whole point of the notice.
  const recipients = Array.from(new Set([newEmail, oldEmail].filter(Boolean)));
  const results = await Promise.all(
    recipients.map((to) =>
      sendAutomationEmail({
        to,
        subject: "Your academy account details were updated",
        message,
        metadata,
      }).catch(() => null),
    ),
  );

  return { sent: results.filter((result: any) => result?.delivered).length };
}
