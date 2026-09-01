import { resolvePublicAppUrl } from "@/lib/appUrl";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";

export type WelcomeEmailRole = "student" | "instructor" | "admin" | "sub-admin";

type WelcomeEmailInput = {
  name: string;
  email: string;
  phone?: string;
  username: string;
  role: WelcomeEmailRole;
  temporaryPassword?: string;
  request?: Request;
};

const ROLE_LABELS: Record<WelcomeEmailRole, string> = {
  student: "student",
  instructor: "coach",
  admin: "administrator",
  "sub-admin": "sub-administrator",
};

export function buildWelcomeEmail(input: WelcomeEmailInput) {
  const appUrl = resolvePublicAppUrl(input.request);
  const loginUrl = appUrl ? `${appUrl}/login` : "/login";
  const roleLabel = ROLE_LABELS[input.role];
  const credentialLines = [
    `Username: ${input.username}`,
    input.temporaryPassword ? `Temporary password: ${input.temporaryPassword}` : "",
  ].filter(Boolean);
  const securityMessage = input.temporaryPassword
    ? "For your security, please sign in and change your temporary password from Account Settings."
    : "You can change your password at any time from Account Settings.";

  return {
    to: input.email,
    subject: `Welcome to Envision Chess Academy - your ${roleLabel} account is ready`,
    message: [
      `Hello ${input.name},`,
      "",
      `Welcome to Envision Chess Academy. Your ${roleLabel} account is ready.`,
      "",
      ...credentialLines,
      `Sign in: ${loginUrl}`,
      "",
      securityMessage,
      "",
      "We look forward to seeing you in the academy.",
      "Envision Chess Academy",
    ].join("\n"),
    metadata: {
      kind: "welcome",
      role: input.role,
      username: input.username,
      loginUrl,
    },
  };
}

export async function sendWelcomeEmail(input: WelcomeEmailInput) {
  const email = await sendAutomationEmail(buildWelcomeEmail(input));
  await sendWhatsAppAutomationTemplate({
    to: input.phone,
    user: input,
    templateName: "account_welcome",
    bodyParameters: [input.name, ROLE_LABELS[input.role], input.username],
    metadata: { kind: "welcome", role: input.role, username: input.username },
  });
  return email;
}
