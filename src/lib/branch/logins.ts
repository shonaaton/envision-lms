import "server-only";
import { Types } from "mongoose";
import { dbConnect } from "@/lib/db";
import { recordActivity } from "@/lib/activity";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { createPasswordResetToken } from "@/lib/passwordReset";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { User } from "@/models/User";
import { BranchStudent } from "@/models/Branch";
import { BRANCH_LABELS, type BranchKey } from "./scope";
import { BranchError } from "./errors";
import { tenDigitPhone, whatsAppChatLink } from "./admissionRules";

/** How long the set-password link in the welcome message works. */
export const WELCOME_LINK_DAYS = 7;

export type WelcomeResult = {
  studentId: string;
  name: string;
  username: string;
  status: "sent" | "skipped";
  reason?: string;
  whatsapp?: "sent" | "failed";
  /** wa.me link with the message typed, for when the WhatsApp template did not go. */
  whatsappLink?: string;
};

const id = (value: unknown) => String((value as any)?._id ?? value ?? "");

export function welcomeMessage(input: { parentName: string; studentName: string; username: string; link: string; branchLabel: string }) {
  return [
    `Hello ${input.parentName || "Parent"}, welcome to the Envision Chess Academy ${input.branchLabel} centre portal. ${input.studentName}'s username is ${input.username}.`,
    "",
    `Please set the password here: ${input.link}`,
    `This link works for ${WELCOME_LINK_DAYS} days.`,
    "",
    "After signing in, open Account Settings to update the profile and photo.",
    "",
    "Team Envision Chess Academy",
  ].join("\n");
}

/**
 * Sends each family its own welcome message with the student's username and a
 * private link to choose a password. The link is the portal's ordinary password
 * reset token, kept open for a week instead of half an hour, so no password is
 * ever written into a chat. Sending again makes a new link and the old one dies.
 * The student's current password keeps working until the family sets a new one.
 */
export async function sendWelcomeLogins(branch: BranchKey, studentIds: string[], actor: { id: string; name?: string }, request?: Request) {
  await dbConnect();
  const ids = [...new Set((studentIds || []).map(String))].filter((value) => Types.ObjectId.isValid(value));
  if (!ids.length) throw new BranchError("Choose at least one student.");
  if (ids.length > 200) throw new BranchError("Send to at most 200 students at a time.");
  const appUrl = resolvePublicAppUrl(request, { allowRequestHeaders: false });
  if (!appUrl) throw new BranchError("The portal's public address is not set, so no link can be made. Ask for NEXT_PUBLIC_APP_URL to be set.", 500);

  const students: any[] = await BranchStudent.find({ _id: { $in: ids }, branch }).select("name phone parentName fatherName motherName user status").lean();
  const users: any[] = await User.find({ _id: { $in: students.map((student) => student.user) } })
    .select("username isActive")
    .setOptions({ allBranches: true })
    .lean();
  const userById = new Map(users.map((user) => [id(user), user]));
  const branchLabel = BRANCH_LABELS[branch];

  const results: WelcomeResult[] = [];
  for (const student of students.sort((a, b) => a.name.localeCompare(b.name))) {
    const user = userById.get(id(student.user));
    const base = { studentId: id(student), name: student.name as string, username: (user?.username as string) || "" };
    if (student.status !== "active" || user?.isActive === false) {
      results.push({ ...base, status: "skipped", reason: "Inactive student" });
      continue;
    }
    if (!user?.username) {
      results.push({ ...base, status: "skipped", reason: "No login on this record" });
      continue;
    }
    const phone = tenDigitPhone(student.phone);
    if (!phone) {
      results.push({ ...base, status: "skipped", reason: "No 10-digit mobile number on the record" });
      continue;
    }

    const { token, tokenHash } = createPasswordResetToken();
    const expiresAt = new Date(Date.now() + WELCOME_LINK_DAYS * 86_400_000);
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt, passwordResetRequestedAt: new Date() } }
    ).setOptions({ allBranches: true });
    const link = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const parentName = student.parentName || student.fatherName || student.motherName || "Parent";

    const whatsapp = await sendWhatsAppAutomationTemplate({
      to: `91${phone}`,
      templateName: "bowbazar_welcome_login",
      bodyParameters: [parentName, student.name, user.username, link, String(WELCOME_LINK_DAYS)],
      metadata: { kind: "branch_welcome_login", studentId: id(student), dedupKey: `branch-welcome:${id(student)}:${tokenHash.slice(0, 12)}` },
    }).catch(() => ({ delivered: false }));
    await BranchStudent.updateOne({ _id: student._id }, { $set: { welcomeSentAt: new Date() } });
    results.push({
      ...base,
      status: "sent",
      whatsapp: whatsapp.delivered ? "sent" : "failed",
      ...(whatsapp.delivered ? {} : { whatsappLink: whatsAppChatLink(phone, welcomeMessage({ parentName, studentName: student.name, username: user.username, link, branchLabel })) }),
    });
  }
  for (const missing of ids.filter((value) => !students.some((student) => id(student) === value))) {
    results.push({ studentId: missing, name: "", username: "", status: "skipped", reason: "Not a student of this branch" });
  }

  const sent = results.filter((result) => result.status === "sent").length;
  if (sent) {
    void recordActivity({
      actor: actor.id,
      type: "branch.welcome_sent",
      label: `Sent the ${branch} welcome message and set-password link to ${sent} famil${sent === 1 ? "y" : "ies"}`,
      entityType: "BranchStudent",
    });
  }
  return { results, sent, skipped: results.length - sent, viaWhatsApp: results.filter((result) => result.whatsapp === "sent").length };
}
