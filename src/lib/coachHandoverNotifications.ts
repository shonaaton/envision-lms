import { User } from "@/models/User";
import { Notification } from "@/models/Fee";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { formatAcademyDateTime } from "@/lib/academyTime";
import { resolveAudienceEmails } from "@/lib/studentContact";
import { sendWhatsAppAutomationTemplate, whatsappRecipientName } from "@/lib/whatsappAutomationEvents";
import type { WhatsAppSendResult } from "@/lib/whatsappAutomation";

/**
 * A permanent coach change, told to everyone it touches - and in this order:
 * the coach handing over, then the coach taking over, then the families.
 *
 * Both ways of changing a coach (the classroom's "Permanent Coach Change" and the
 * batch edit form) end here, so the outgoing coach and the families hear the same
 * thing whichever screen the admin used. Before this, the classroom path told the
 * families nothing and neither path sent the outgoing coach a WhatsApp.
 *
 * The callers still send the incoming coach's in-app notice and email themselves
 * (with the full class details); this owns only that coach's WhatsApp.
 */

/** Same Meta codes the other coach notices treat as "template not usable yet". */
const TEMPLATE_UNAVAILABLE_META_CODES = new Set([132001, 132015, 132016]);

function templateUnavailable(result: WhatsAppSendResult) {
  if (result.delivered || result.skipped) return false;
  const code = Number((result.payload as any)?.error?.code || 0);
  if (TEMPLATE_UNAVAILABLE_META_CODES.has(code)) return true;
  const text = `${result.errorMessage || ""} ${result.error || ""}`;
  return /does not exist|not been approved|template.{0,40}(missing|not found)|paused|disabled/i.test(text);
}

function recordId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/** "Saturday, 11 October" - the day the new coach takes the first class. */
export function handoverDateLabel(value?: string | Date | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "the next class";
  return formatAcademyDateTime(value, { weekday: "long", day: "numeric", month: "long", year: undefined, hour: undefined, minute: undefined });
}

export type CoachHandoverInput = {
  /** "classroom" or "batch" - and the id of that record, for links and dedup keys. */
  scope: "classroom" | "batch";
  scopeId: string;
  /** What the families and coaches know it as: the batch code, else the class title. */
  label: string;
  previousCoachId?: string;
  newCoachId: string;
  /** Students still in the class from the handover on (exited students left out). */
  studentIds: string[];
  /** When the new coach's first class is. */
  effectiveFrom?: string | Date | null;
  course: string;
  level: string;
  timings: string;
  nextTopic: string;
  studentsLabel: string;
  /**
   * The long-approved template the caller used before, sent to the new coach when
   * Meta has not approved coach_handover_new_coach yet.
   */
  newCoachFallback?: () => Promise<WhatsAppSendResult>;
};

const contactFields = "_id name email phone username countryCode role parentName parentEmail isActive";

export async function notifyCoachHandover(input: CoachHandoverInput) {
  const previousCoachId = String(input.previousCoachId || "");
  const newCoachId = String(input.newCoachId || "");
  if (!input.scopeId || !newCoachId || previousCoachId === newCoachId) return { skipped: true };

  const [previousCoach, newCoach, students] = await Promise.all([
    previousCoachId ? User.findById(previousCoachId).select(contactFields).lean() : Promise.resolve(null),
    User.findById(newCoachId).select(contactFields).lean(),
    input.studentIds.length
      ? User.find({ _id: { $in: input.studentIds }, isActive: { $ne: false } }).select(contactFields).lean()
      : Promise.resolve([]),
  ]) as [any, any, any[]];
  if (!newCoach) return { skipped: true };

  const label = input.label || "the class";
  const effectiveFrom = handoverDateLabel(input.effectiveFrom);
  const newCoachName = String(newCoach.name || newCoach.username || "the new coach");
  const previousCoachName = String(previousCoach?.name || previousCoach?.username || "the previous coach");
  // One handover is one event: the same pair of coaches on the same first class
  // is not announced twice, but a later change on the same class is.
  const handoverKey = `coach_handover:${input.scope}:${input.scopeId}:${previousCoachId || "none"}:${newCoachId}:${new Date(input.effectiveFrom || 0).getTime() || "next"}`;
  const href = input.scope === "classroom" ? `/classrooms/${input.scopeId}` : "/classrooms";

  // 1. The coach handing over - thanked first, before anyone else hears.
  if (previousCoach && previousCoach.isActive !== false) {
    const title = "Your class is moving to another coach";
    const message = [
      `Hello ${previousCoach.name || "Coach"},`,
      "",
      `Thank you for all your work with ${label}. From ${effectiveFrom}, Coach ${newCoachName} will take over these classes permanently.`,
      "",
      "The classes you have already taught stay on your record. Please share any notes on the students' progress with the academy team, so the syllabus carries on smoothly from where you left off.",
      "",
      "Regards,",
      "Team Envision Chess Academy",
    ].join("\n");
    const metadata = { kind: "coach_handover", recipientType: "previous_coach", scope: input.scope, scopeId: input.scopeId, coachId: previousCoachId, href: "/classrooms" };
    await Notification.create({ user: previousCoach._id, type: "class_coach_released", title, message, metadata })
      .catch((error) => console.error("Handover notice to previous coach failed", error));
    if (previousCoach.email) {
      await sendAutomationEmail({ to: String(previousCoach.email), subject: `${title}: ${label}`, message, metadata })
        .catch((error) => console.error("Handover email to previous coach failed", error));
    }
    await sendWhatsAppAutomationTemplate({
      user: previousCoach,
      templateName: "coach_handover_previous_coach",
      bodyParameters: [whatsappRecipientName(previousCoach, "Coach"), label, effectiveFrom, newCoachName],
      metadata: { ...metadata, notificationDedupKey: `${handoverKey}:previous_coach` },
    }).catch((error) => console.error("Handover WhatsApp to previous coach failed", error));
  }

  // 2. The coach taking over.
  const newCoachMetadata = { kind: "coach_handover", recipientType: "coach", scope: input.scope, scopeId: input.scopeId, coachId: newCoachId, href };
  const newCoachResult = await sendWhatsAppAutomationTemplate({
    user: newCoach,
    templateName: "coach_handover_new_coach",
    bodyParameters: [
      whatsappRecipientName(newCoach, "Coach"),
      label,
      effectiveFrom,
      previousCoachName,
      input.course || "Not set",
      input.level || "Not set",
      input.nextTopic || "Not set",
      input.timings || "Timings not set",
      input.studentsLabel || "No students enrolled yet",
    ],
    metadata: { ...newCoachMetadata, notificationDedupKey: `${handoverKey}:new_coach` },
  }).catch((error) => {
    console.error("Handover WhatsApp to new coach failed", error);
    return null;
  });
  if (newCoachResult && templateUnavailable(newCoachResult) && input.newCoachFallback) {
    console.warn("coach_handover_new_coach is not usable in Meta yet, falling back", {
      error: newCoachResult.errorMessage || newCoachResult.error || "",
      metaCode: (newCoachResult.payload as any)?.error?.code,
    });
    await input.newCoachFallback().catch((error) => console.error("Handover fallback WhatsApp to new coach failed", error));
  }

  // 3. The families - reassured the syllabus and the standard of teaching carry on.
  for (const student of students) {
    const greeting = String(student.parentName || student.name || "there");
    const message = [
      `Hello ${greeting},`,
      "",
      `A quick update on the ${label} chess classes: from ${effectiveFrom}, Coach ${newCoachName} will be the permanent coach.`,
      "",
      "Your syllabus and progress carry over in full, and classes continue from exactly where they left off. Our academy team coordinates every coach handover closely, so the quality of teaching stays the best, as always.",
      "",
      `Course: ${input.course || "Not set"}`,
      `Course Level: ${input.level || "Not set"}`,
      "Timings:",
      input.timings || "Timings not set",
      "",
      "For any questions, please contact the academy team.",
      "",
      "Regards,",
      "Team Envision Chess Academy",
    ].join("\n");
    const subject = `New coach for ${label}`;
    const emailMetadata = { kind: "coach_handover", scope: input.scope, scopeId: input.scopeId, studentId: recordId(student._id), href: "/dashboard" };
    const emails = resolveAudienceEmails(
      student.email ? { to: String(student.email), subject, message, metadata: emailMetadata } : null,
      student.parentEmail ? { to: String(student.parentEmail), subject, message, metadata: { ...emailMetadata, recipientType: "parent" } } : null,
    );
    await Promise.all(emails.map((email) => sendAutomationEmail(email).catch(() => null)));
  }

  await Promise.all(students.map(async (student) => {
    const metadata = {
      kind: "coach_handover",
      recipientType: student.parentName ? "parent" : "student",
      scope: input.scope,
      scopeId: input.scopeId,
      studentId: recordId(student._id),
      coachId: newCoachId,
      notificationDedupKey: `${handoverKey}:${recordId(student._id)}`,
    };
    const result = await sendWhatsAppAutomationTemplate({
      user: student,
      templateName: "coach_handover_student",
      bodyParameters: [
        String(student.parentName || whatsappRecipientName(student)),
        label,
        effectiveFrom,
        newCoachName,
        input.course || "Not set",
        input.level || "Not set",
        input.timings || "Timings not set",
      ],
      metadata,
    }).catch((error) => {
      console.error("Handover WhatsApp to family failed", error);
      return null;
    });
    if (!result || !templateUnavailable(result)) return;
    // Until Meta approves coach_handover_student, the older approved notice
    // still reaches the family.
    console.warn("coach_handover_student is not usable in Meta yet, falling back to batch_permanent_coach_changed_student");
    await sendWhatsAppAutomationTemplate({
      user: student,
      templateName: "batch_permanent_coach_changed_student",
      bodyParameters: [
        whatsappRecipientName(student),
        label,
        newCoachName,
        input.course || "Not set",
        input.level || "Not set",
        input.timings || "Timings not set",
      ],
      metadata: { ...metadata, fallbackFor: "coach_handover_student", notificationDedupKey: `${metadata.notificationDedupKey}:fallback` },
    }).catch((error) => console.error("Handover fallback WhatsApp to family failed", error));
  }));

  return { previousCoach: Boolean(previousCoach), newCoach: true, students: students.length };
}
