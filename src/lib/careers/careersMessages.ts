import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { answerText } from "@/lib/careers/careersConfig";

/**
 * Every message the careers pipeline sends: to the applicant (email + WhatsApp
 * template) and to the admins (email). WhatsApp templates are in the registry
 * and stay off until Meta approves them (OFF_UNTIL_ENABLED_TEMPLATES); the
 * email still goes, so nothing waits on Meta.
 *
 * Every send is best-effort: a failed message never fails the stage change.
 */

type Applicant = {
  _id?: unknown;
  name?: string;
  email?: string;
  phone?: string;
  countryCode?: string;
  postingTitle?: string;
  answers?: { question?: string; answer?: any }[];
  [key: string]: unknown;
};

const SIGN_OFF = "\n\nTeam Envision Chess Academy";

function firstName(name?: string) {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}

function careersUrl() {
  const base = resolvePublicAppUrl(undefined, { allowRequestHeaders: false }) || "https://envisionchessacademy.com";
  return `${base}/careers`;
}

function adminUrl(applicationId: unknown) {
  const base = resolvePublicAppUrl(undefined, { allowRequestHeaders: false }) || "https://envisionchessacademy.com";
  return `${base}/admin/careers/applications?id=${String(applicationId || "")}`;
}

async function safe<T>(label: string, run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    console.error(`[careers] ${label} failed`, error);
    return null;
  }
}

async function toApplicant(application: Applicant, input: { subject: string; message: string; kind: string; template: string; params: unknown[]; actionUrl?: string }) {
  const results: { email: boolean; whatsapp: boolean } = { email: false, whatsapp: false };
  if (application.email) {
    const sent: any = await safe(`${input.kind} email`, () =>
      sendAutomationEmail({
        to: application.email,
        subject: input.subject,
        message: input.message,
        actionUrl: input.actionUrl,
        metadata: { kind: input.kind, applicationId: String(application._id || "") },
      })
    );
    results.email = Boolean(sent?.delivered);
  }
  const wa: any = await safe(`${input.template} WhatsApp`, () =>
    sendWhatsAppAutomationTemplate({
      user: { name: application.name, phone: application.phone, countryCode: application.countryCode, _id: application._id },
      templateName: input.template,
      bodyParameters: input.params,
      metadata: { kind: input.kind, applicationId: String(application._id || "") },
    })
  );
  results.whatsapp = Boolean(wa?.delivered);
  return results;
}

export function sendApplicationReceived(application: Applicant) {
  const role = application.postingTitle || "the";
  return toApplicant(application, {
    kind: "career_application_received",
    template: "career_application_received",
    params: [firstName(application.name), role],
    subject: `We received your application - ${role}`,
    message: `Hello ${firstName(application.name)},\n\nThank you for applying for the ${role} role at Envision Chess Academy. We have received your application and our team will review it.\n\nWe will contact you on WhatsApp or by email about the next step. You can see our other openings any time on the careers page.${SIGN_OFF}`,
    actionUrl: careersUrl(),
  });
}

export function sendShortlisted(application: Applicant) {
  const role = application.postingTitle || "the";
  return toApplicant(application, {
    kind: "career_shortlisted",
    template: "career_shortlisted",
    params: [firstName(application.name), role],
    subject: `You're shortlisted - ${role}`,
    message: `Hello ${firstName(application.name)},\n\nGood news! Your application for the ${role} role at Envision Chess Academy has been shortlisted.\n\nOur team will contact you soon to schedule the next step.${SIGN_OFF}`,
  });
}

export function formatInterviewTime(at: Date) {
  return `${new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).format(at)} IST`;
}

export function sendInterviewScheduled(application: Applicant, input: { at: Date; link?: string; note?: string }) {
  const role = application.postingTitle || "the";
  const when = formatInterviewTime(input.at);
  const details = [input.link, input.note].filter(Boolean).join(" - ") || "We will share the joining details before the interview.";
  return toApplicant(application, {
    kind: "career_interview_scheduled",
    template: "career_interview_scheduled",
    params: [firstName(application.name), role, when, details],
    subject: `Interview scheduled - ${role}`,
    message: `Hello ${firstName(application.name)},\n\nYour interview for the ${role} role at Envision Chess Academy is scheduled for ${when}.\n\nJoining details: ${details}\n\nPlease reply to this email or on WhatsApp if you need to change the time.${SIGN_OFF}`,
    actionUrl: input.link && /^https?:\/\//i.test(input.link) ? input.link : undefined,
  });
}

export function sendRejected(application: Applicant) {
  const role = application.postingTitle || "the";
  return toApplicant(application, {
    kind: "career_application_update",
    template: "career_application_update",
    params: [firstName(application.name), role],
    subject: `Your application - ${role}`,
    message: `Hello ${firstName(application.name)},\n\nThank you for your interest in the ${role} role at Envision Chess Academy and for the time you put into your application.\n\nAfter careful review, we will not be moving forward with your application at this time. We will keep your details on file and may reach out for future openings.${SIGN_OFF}`,
    actionUrl: careersUrl(),
  });
}

/** The account's welcome email (sign-in details) is sent separately by sendWelcomeEmail. */
export function sendHired(application: Applicant) {
  const role = application.postingTitle || "the";
  return toApplicant(application, {
    kind: "career_hired",
    template: "career_hired",
    params: [firstName(application.name), role],
    subject: `Congratulations - ${role}`,
    message: `Hello ${firstName(application.name)},\n\nCongratulations! You have been selected for the ${role} role at Envision Chess Academy.\n\nOur team will share your onboarding details shortly.${SIGN_OFF}`,
  });
}

/**
 * The invite to apply ("Invite applicants"), and its reminders: the same
 * career_invite template both times, so only one waits on Meta.
 */
export function sendInvite(invite: Applicant & { link: string }, reminder = false) {
  const role = invite.postingTitle || "an open";
  const name = firstName(invite.name);
  return toApplicant(invite, {
    kind: "career_invite",
    template: "career_invite",
    params: [name, role, invite.link],
    subject: reminder ? `Reminder: your application for ${role}` : `You're invited to apply - ${role}`,
    message: reminder
      ? `Hello ${name},\n\nA quick reminder: we would still like you to apply for the ${role} role at Envision Chess Academy. The short form takes a few minutes, and your name and number are already filled in.\n\nFill it in here: ${invite.link}${SIGN_OFF}`
      : `Hello ${name},\n\nEnvision Chess Academy would like to invite you to apply for the ${role} role. Please fill in the short application form - your name and number are already filled in.\n\nFill it in here: ${invite.link}${SIGN_OFF}`,
    actionUrl: invite.link,
  });
}

/**
 * Tells the careers reviewers (Sayan Bose and Dhritabrata Kundu, see
 * careersPeople.ts) about a new, verified application: an email and an in-app
 * notification each.
 */
export async function notifyReviewersAboutApplication(application: Applicant, reviewers: { userId: string; name: string; email: string }[]) {
  const lines = [
    `${application.name} applied for ${application.postingTitle}.`,
    "",
    `WhatsApp: ${[application.countryCode, application.phone].filter(Boolean).join(" ")}`,
    application.email ? `Email: ${application.email}` : "",
    application.city ? `City: ${application.city}` : "",
    "",
    ...(application.answers || []).slice(0, 6).map((item) => `${item.question}: ${answerText(item.answer)}`),
  ].filter((line, index, list) => line !== "" || list[index - 1] !== "");
  const { Notification } = await import("@/models/Fee");
  await Promise.all(
    reviewers
      .filter((reviewer) => reviewer.email && /@.+\./.test(reviewer.email))
      .map(async (reviewer) => {
        if (reviewer.userId) {
          await safe("reviewer notification", () =>
            Notification.create({
              user: reviewer.userId,
              type: "career_application",
              title: `New application: ${application.name}`,
              message: `${application.name} applied for ${application.postingTitle}.`,
              metadata: { applicationId: String(application._id || ""), href: `/admin/careers/applications?id=${String(application._id || "")}` },
            })
          );
        }
        await safe("reviewer email", () =>
          sendAutomationEmail({
            to: reviewer.email,
            subject: `New application: ${application.name} - ${application.postingTitle}`,
            message: lines.join("\n"),
            actionUrl: adminUrl(application._id),
            actionLabel: "Review Application",
            metadata: { kind: "career_application_admin", applicationId: String(application._id || "") },
          })
        );
      })
  );
}
