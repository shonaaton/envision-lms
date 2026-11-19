import { formatAcademyDateTime } from "@/lib/academyTime";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { resolveAudienceEmails } from "@/lib/studentContact";
import { sendWhatsAppAutomationTemplate, whatsappRecipientName } from "@/lib/whatsappAutomationEvents";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * The messages that follow an admin's ruling on a class the coach missed.
 *
 * The family hears an apology, that they were not charged, and - when the
 * ruling makes the next class free - that a credit has been added. The coach
 * hears what was decided: the fine, if any, and that their next class in that
 * batch is unpaid. Both go in-app, by email and by WhatsApp.
 */

function recordId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/** "Tuesday, 18 November" in the academy's time zone. */
export function missedClassDateLabel(value?: string | Date | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "the scheduled day";
  return formatAcademyDateTime(value, { weekday: "long", day: "numeric", month: "long", year: undefined, hour: undefined, minute: undefined });
}

function rupees(paise: number) {
  const value = Math.round(Number(paise || 0)) / 100;
  return `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** The decision, in one sentence the coach reads. Pure, so it is tested. */
export function coachDecisionSentence(input: { chargeFine: boolean; fineAmount: number; freeNextClass: boolean }) {
  const parts: string[] = [];
  if (input.chargeFine && input.fineAmount > 0) parts.push(`a fine of ${rupees(input.fineAmount)} is deducted from your pay`);
  if (input.freeNextClass) parts.push("your next class in this batch is unpaid because it is free for the family");
  if (!parts.length) return "no fine this time, and the missed class is not paid.";
  const sentence = parts.length === 2 ? `${parts[0]}, and ${parts[1]}` : parts[0];
  return `${sentence}. The missed class is not paid.`;
}

const contactFields = "_id name username email phone countryCode parentName parentEmail isActive role";

export async function notifyFamiliesOfCoachNoShow(input: {
  rulingId: string;
  classroomId: string;
  classLabel: string;
  sessionDate: Date | string | null | undefined;
  studentIds: string[];
  /** Students who actually received the make-up credit. */
  creditedStudentIds: string[];
  freeNextClass: boolean;
  /** Resend only the WhatsApp (the in-app notice and email already went). */
  whatsappOnly?: boolean;
}) {
  const outcome = { sent: 0, whatsappOk: 0, whatsappFailed: 0, errors: [] as string[] };
  if (!input.studentIds.length) return outcome;
  const students = (await User.find({ _id: { $in: input.studentIds }, isActive: { $ne: false } }).select(contactFields).lean()) as any[];
  const dateLabel = missedClassDateLabel(input.sessionDate);
  const credited = new Set(input.creditedStudentIds.map(String));

  for (const student of students) {
    const studentId = recordId(student._id);
    const studentName = String(student.name || student.username || "your child");
    const greeting = String(student.parentName || student.name || "there");
    const free = input.freeNextClass && credited.has(studentId);
    const title = free ? "Missed class: your next class is free" : "Sorry about the missed class";
    const message = [
      `Hello ${greeting},`,
      "",
      `We are sorry. The ${input.classLabel} chess class on ${dateLabel} did not take place because the coach could not join. You have not been charged for it.`,
      "",
      free
        ? `As an apology, the next class is free of cost: one class credit has been added for ${studentName}.`
        : "The academy team is making sure it does not happen again.",
      "",
      "For any questions, please contact the academy team.",
      "",
      "Regards,",
      "Team Envision Chess Academy",
    ].join("\n");
    const metadata = { kind: "coach_no_show_ruling", rulingId: input.rulingId, classroomId: input.classroomId, studentId, href: "/dashboard" };

    if (!input.whatsappOnly) {
      await Notification.create({ user: student._id, type: "class_coach_no_show", title, message, metadata })
        .catch((error) => console.error("Coach no-show notice to family failed", error));

      const emails = resolveAudienceEmails(
        student.email ? { to: String(student.email), subject: title, message, metadata } : null,
        student.parentEmail ? { to: String(student.parentEmail), subject: title, message, metadata: { ...metadata, recipientType: "parent" } } : null
      );
      await Promise.all(emails.map((email) => sendAutomationEmail(email).catch(() => null)));
    }

    const result = await sendWhatsAppAutomationTemplate({
      user: student,
      templateName: free ? "coach_no_show_family_free" : "coach_no_show_family",
      bodyParameters: free
        ? [String(student.parentName || whatsappRecipientName(student)), input.classLabel, dateLabel, studentName]
        : [String(student.parentName || whatsappRecipientName(student)), input.classLabel, dateLabel],
      metadata: { ...metadata, notificationDedupKey: `coach_no_show:${input.rulingId}:${studentId}` },
    }).catch((error) => {
      console.error("Coach no-show WhatsApp to family failed", error);
      return null;
    });
    tally(outcome, result, studentName);
  }
  outcome.sent = students.length;
  return outcome;
}

/** Counts a WhatsApp result, and keeps a short reason for each failure. */
function tally(outcome: { whatsappOk: number; whatsappFailed: number; errors: string[] }, result: any, who: string) {
  if (result?.ok && !result?.skipped) {
    outcome.whatsappOk += 1;
    return;
  }
  outcome.whatsappFailed += 1;
  const reason = String(result?.errorMessage || result?.error || result?.debug?.reason || "not sent");
  outcome.errors.push(`${who}: ${reason}`.slice(0, 160));
}

export async function notifyCoachOfNoShowRuling(input: {
  rulingId: string;
  classroomId: string;
  coachId: string;
  classLabel: string;
  sessionDate: Date | string | null | undefined;
  chargeFine: boolean;
  fineAmount: number;
  freeNextClass: boolean;
  note?: string;
  whatsappOnly?: boolean;
}) {
  const outcome = { sent: 0, whatsappOk: 0, whatsappFailed: 0, errors: [] as string[] };
  const coach: any = input.coachId ? await User.findById(input.coachId).select(contactFields).lean() : null;
  if (!coach || coach.isActive === false) return outcome;
  const dateLabel = missedClassDateLabel(input.sessionDate);
  const decision = coachDecisionSentence(input);
  const title = `Coach no-show recorded: ${input.classLabel}`;
  const message = [
    `Hello ${coach.name || "Coach"},`,
    "",
    `You did not join the ${input.classLabel} class scheduled on ${dateLabel}, so it has been recorded as a coach no-show.`,
    "",
    `Decision: ${decision}`,
    input.note ? `Note from the academy: ${input.note}` : "",
    "",
    "Please join every scheduled class on time, or tell the academy in advance so a substitute can be arranged.",
    "",
    "Regards,",
    "Team Envision Chess Academy",
  ].filter((line, index, lines) => !(line === "" && lines[index - 1] === "")).join("\n");
  const metadata = { kind: "coach_no_show_ruling", recipientType: "coach", rulingId: input.rulingId, classroomId: input.classroomId, href: "/coach-pay" };

  if (!input.whatsappOnly) {
    await Notification.create({ user: coach._id, type: "coach_no_show_ruling", title, message, metadata })
      .catch((error) => console.error("Coach no-show notice to coach failed", error));
    if (coach.email) {
      await sendAutomationEmail({ to: String(coach.email), subject: title, message, metadata })
        .catch((error) => console.error("Coach no-show email to coach failed", error));
    }
  }
  const result = await sendWhatsAppAutomationTemplate({
    user: coach,
    templateName: "coach_no_show_coach",
    bodyParameters: [whatsappRecipientName(coach, "Coach"), input.classLabel, dateLabel, decision],
    metadata: { ...metadata, notificationDedupKey: `coach_no_show:${input.rulingId}:coach` },
  }).catch((error) => {
    console.error("Coach no-show WhatsApp to coach failed", error);
    return null;
  });
  tally(outcome, result, `Coach ${coach.name || coach.username || ""}`.trim());
  outcome.sent = 1;
  return outcome;
}
