import { resolvePublicAppUrl } from "@/lib/appUrl";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";

export type WelcomeEmailRole = "student" | "instructor" | "admin" | "sub-admin";
export type WelcomeAccountKind = "standard" | "demo";

type WelcomeEmailInput = {
  name: string;
  email: string;
  phone?: string;
  countryCode?: string;
  username: string;
  role: WelcomeEmailRole;
  accountKind?: WelcomeAccountKind;
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
  const isDemo = input.accountKind === "demo";
  const roleLabel = isDemo ? "demo student" : ROLE_LABELS[input.role];
  const credentialLines = [
    `Username: ${input.username}`,
    input.temporaryPassword ? `Temporary password: ${input.temporaryPassword}` : "",
  ].filter(Boolean);
  const securityMessage = input.temporaryPassword
    ? "For your security, please sign in and change your temporary password from Account Settings."
    : "You can change your password at any time from Account Settings.";
  const introLine = isDemo
    ? "Welcome to Envision Chess Academy. Your demo account is ready."
    : `Welcome to Envision Chess Academy. Your ${roleLabel} account is ready.`;
  const nextStepLine = isDemo
    ? "You can now explore your demo access and book your demo class from the academy portal."
    : "We look forward to seeing you in the academy.";

  return {
    to: input.email,
    subject: isDemo
      ? "Welcome to Envision Chess Academy - your demo account is ready"
      : `Welcome to Envision Chess Academy - your ${roleLabel} account is ready`,
    message: [
      `Hello ${input.name},`,
      "",
      introLine,
      "",
      ...credentialLines,
      `Sign in: ${loginUrl}`,
      "",
      securityMessage,
      "",
      nextStepLine,
      "Envision Chess Academy",
    ].join("\n"),
    metadata: {
      kind: isDemo ? "demo_welcome" : "welcome",
      role: input.role,
      accountKind: input.accountKind || "standard",
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
    bodyParameters: [input.name, input.accountKind === "demo" ? "demo student" : ROLE_LABELS[input.role], input.username],
    metadata: { kind: input.accountKind === "demo" ? "demo_welcome" : "welcome", role: input.role, accountKind: input.accountKind || "standard", username: input.username },
  });
  return email;
}
