import "server-only";

import { Types } from "mongoose";
import { formatAcademyDateTime } from "@/lib/academyTime";
import { hasStudentExited } from "@/lib/classroomStudentExits";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppAutomationTemplate, whatsappRecipientName } from "@/lib/whatsappAutomationEvents";
import type { WhatsAppSendResult } from "@/lib/whatsappAutomation";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * Tells every coach still teaching a student that the student has discontinued,
 * when an admin switches the student's account off.
 *
 * The coaches have to be found *before* the deactivation runs: it closes the
 * groups this student was the last member of, and a closed group no longer
 * looks like one the student is in. So the route calls `studentCoachGroups`
 * first and hands the result to `notifyCoachesStudentDiscontinued` afterwards.
 *
 * The coach is told the student has left - not why, and not where to.
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

function idOf(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/** Coach id -> the batches and classes they teach this student in, by name. */
export type StudentCoachGroups = Map<string, string[]>;

export async function studentCoachGroups(studentId: string): Promise<StudentCoachGroups> {
  const groups: StudentCoachGroups = new Map();
  if (!Types.ObjectId.isValid(studentId)) return groups;
  const sid = new Types.ObjectId(studentId);
  const add = (coachId: string, name: string) => {
    if (!coachId || !name) return;
    const names = groups.get(coachId) || [];
    if (!names.includes(name)) groups.set(coachId, [...names, name]);
  };

  const [batches, classrooms]: [any[], any[]] = await Promise.all([
    Batch.find({ students: sid, isActive: { $ne: false } }).select("_id name coach").lean(),
    Classroom.find({
      students: sid,
      isActive: { $ne: false },
      isSessionInstance: { $ne: true },
      classroomType: { $ne: "demo" },
      status: { $nin: ["completed", "cancelled"] },
    }).select("title coach instructor batches studentExits").lean(),
  ]);

  const batchName = new Map(batches.map((batch) => [idOf(batch._id), String(batch.name || "Batch")]));
  for (const batch of batches) add(idOf(batch.coach), String(batch.name || "Batch"));
  // A classroom is named by the student's batch it belongs to, so a coach of a
  // batch's classroom hears "I2-100" once, not the batch and each of its classes.
  for (const classroom of classrooms) {
    if (hasStudentExited(classroom, studentId)) continue;
    const ownBatch = (classroom.batches || []).map(idOf).find((id: string) => batchName.has(id));
    add(idOf(classroom.coach || classroom.instructor), ownBatch ? batchName.get(ownBatch)! : String(classroom.title || "Class"));
  }
  return groups;
}

export async function notifyCoachesStudentDiscontinued(input: {
  studentId: string;
  groups: StudentCoachGroups;
  effectiveFrom?: Date;
}) {
  if (!input.groups.size) return { sent: 0 };
  const student: any = await User.findById(input.studentId).select("name username role").lean();
  if (!student || student.role !== "student") return { sent: 0 };
  const coaches: any[] = await User.find({ _id: { $in: Array.from(input.groups.keys()) }, isActive: { $ne: false } })
    .select("_id name email phone countryCode username role")
    .lean();

  const studentName = String(student.name || student.username || "A student").trim();
  const effectiveFrom = input.effectiveFrom || new Date();
  const effectiveFromLabel = formatAcademyDateTime(effectiveFrom, { hour: undefined, minute: undefined });
  let sent = 0;

  for (const coach of coaches) {
    const coachId = idOf(coach._id);
    const groupLabel = (input.groups.get(coachId) || []).join(", ");
    if (!groupLabel) continue;
    const title = `${studentName} has discontinued`;
    const message = [
      `Hello ${coach.name || "Coach"},`,
      "",
      `${studentName} has discontinued classes at Envision Chess Academy with effect from ${effectiveFromLabel}.`,
      "",
      `Affected: ${groupLabel}`,
      "",
      "They will not attend upcoming classes. The classes you have already taught them stay on your record.",
      "",
      "Regards,",
      "Team Envision Chess Academy",
    ].join("\n");
    const metadata = {
      kind: "student_discontinued",
      recipientType: "coach",
      coachId,
      studentId: input.studentId,
      groups: input.groups.get(coachId),
      href: "/classrooms",
      notificationDedupKey: `student_discontinued:${input.studentId}:${coachId}:${effectiveFrom.toISOString().slice(0, 10)}`,
    };

    await Notification.create({ user: coach._id, type: "student_discontinued", title, message, metadata })
      .catch((error: unknown) => console.error("Student discontinued notification failed", error));

    if (coach.email) {
      await sendAutomationEmail({ to: String(coach.email), subject: `${title}: ${groupLabel}`, message, metadata: { ...metadata, userId: coachId } })
        .catch((error: unknown) => console.error("Student discontinued email failed", error));
    }

    const result = await sendWhatsAppAutomationTemplate({
      user: coach,
      templateName: "student_discontinued_coach",
      bodyParameters: [whatsappRecipientName(coach, "Coach"), studentName, effectiveFromLabel, groupLabel],
      metadata,
    }).catch((error: unknown) => {
      console.error("Student discontinued WhatsApp failed", error);
      return null;
    });
    // Until Meta approves student_discontinued_coach, the approved "has left
    // your batch" notice still reaches the coach.
    if (result && templateUnavailable(result)) {
      console.warn("student_discontinued_coach is not usable in Meta yet, falling back to batch_student_left_coach");
      await sendWhatsAppAutomationTemplate({
        user: coach,
        templateName: "batch_student_left_coach",
        bodyParameters: [whatsappRecipientName(coach, "Coach"), studentName, groupLabel, effectiveFromLabel],
        metadata: { ...metadata, fallbackFor: "student_discontinued_coach", notificationDedupKey: `${metadata.notificationDedupKey}:fallback` },
      }).catch((error: unknown) => console.error("Student discontinued fallback WhatsApp failed", error));
    }
    sent += 1;
  }
  return { sent };
}
