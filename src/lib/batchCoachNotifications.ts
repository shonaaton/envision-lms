import { Batch } from "@/models/Batch";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { batchObjectId as objectId, batchTimingLines, findBatchClassrooms, studentListLabel } from "@/lib/batchSummary";
import { firstClassDateLabel, nextScheduledSessionStart } from "@/lib/firstClassDate";
import { sendWhatsAppAutomationTemplate, whatsappRecipientName } from "@/lib/whatsappAutomationEvents";
import { notifyCoachHandover } from "@/lib/coachHandoverNotifications";
import type { WhatsAppSendResult } from "@/lib/whatsappAutomation";

async function batchContext(batchId: string) {
  const [batch, classrooms] = await Promise.all([
    Batch.findById(batchId).populate("coach", "name email phone countryCode username role").populate("students", "name email phone countryCode username parentName parentEmail role isActive").lean(),
    findBatchClassrooms(batchId),
  ]);
  return { batch: batch as any, classrooms: classrooms as any[] };
}

function coachSummary(input: { batch: any; classrooms: any[] }) {
  const primaryClassroom = input.classrooms[0] || {};
  return {
    batchCode: input.batch?.name || "Batch",
    course: primaryClassroom.courseName || "Not set",
    level: primaryClassroom.levelName || input.batch?.level || primaryClassroom.level || "Not set",
    timings: batchTimingLines(input.batch, input.classrooms),
    firstClassDate: firstClassDateLabel(input.classrooms),
    students: studentListLabel((input.batch?.students || []).filter((student: any) => student?.isActive !== false)),
  };
}

/**
 * Meta codes that mean "this template cannot be used right now" - the roster template is still
 * awaiting approval, or it has been paused or disabled - as opposed to a parameter mistake on our
 * side, which should surface instead of being masked by the fallback.
 */
const TEMPLATE_UNAVAILABLE_META_CODES = new Set([132001, 132015, 132016]);

function templateUnavailable(result: WhatsAppSendResult) {
  if (result.delivered || result.skipped) return false;
  const code = Number((result.payload as any)?.error?.code || 0);
  if (TEMPLATE_UNAVAILABLE_META_CODES.has(code)) return true;
  const text = `${result.errorMessage || ""} ${result.error || ""}`;
  return /does not exist|not been approved|template.{0,40}(missing|not found)|paused|disabled/i.test(text);
}

/**
 * batch_assigned_coach is the older approved pair plus the student roster, so it is tried first and
 * the pre-existing templates keep covering the coach until Meta approves the new one.
 */
async function sendBatchCoachTemplate(input: {
  coach: any;
  summary: ReturnType<typeof coachSummary>;
  isChange: boolean;
  metadata: Record<string, unknown>;
}) {
  const coachName = whatsappRecipientName(input.coach, "Coach");
  const primary = await sendWhatsAppAutomationTemplate({
    user: input.coach,
    templateName: "batch_assigned_coach",
    bodyParameters: [
      coachName,
      input.isChange ? "an ongoing batch has been permanently assigned to you." : "a new batch has been assigned to you.",
      input.summary.batchCode,
      input.summary.course,
      input.summary.level,
      input.summary.timings,
      input.summary.firstClassDate,
      input.summary.students,
    ],
    metadata: input.metadata,
  });
  if (!templateUnavailable(primary)) return primary;

  console.warn("batch_assigned_coach is not usable in Meta yet, falling back to the existing batch template", {
    error: primary.errorMessage || primary.error || "",
    metaCode: (primary.payload as any)?.error?.code,
  });
  return sendWhatsAppAutomationTemplate({
    user: input.coach,
    templateName: input.isChange ? "batch_permanent_coach_assigned_coach" : "batch_new_assigned_coach",
    bodyParameters: [
      coachName,
      input.summary.batchCode,
      input.summary.course,
      input.summary.level,
      input.summary.timings,
      input.summary.firstClassDate,
    ],
    metadata: {
      ...input.metadata,
      fallbackFor: "batch_assigned_coach",
      notificationDedupKey: `${input.metadata.notificationDedupKey || ""}:fallback`,
    },
  });
}

export async function notifyBatchCoachAssigned(input: {
  batchId: string;
  previousCoachId?: string;
  reason: "new_batch_assigned" | "permanent_coach_changed";
}) {
  const { batch, classrooms } = await batchContext(input.batchId);
  if (!batch?.coach) return { sent: 0, skipped: true };
  if (input.reason === "new_batch_assigned" && !classrooms.length) {
    return { sent: 0, skipped: true, reason: "no_classrooms_yet" };
  }
  const coach = batch.coach;
  const summary = coachSummary({ batch, classrooms });
  const isChange = input.reason === "permanent_coach_changed";
  const title = isChange ? "Ongoing batch assigned to you" : "New batch assigned";
  const coachMessage = [
    `Hello ${coach.name || "Coach"},`,
    "",
    isChange ? "An ongoing batch has been permanently assigned to you." : "A new batch has been assigned to you.",
    "",
    `Batch Code: ${summary.batchCode}`,
    `Course: ${summary.course}`,
    `Course Level: ${summary.level}`,
    "Timings:",
    summary.timings,
    `First Class Date: ${summary.firstClassDate}`,
    `Students: ${summary.students}`,
    "",
    "Please review the batch and classroom details in the academy portal.",
  ].join("\n");

  const emailCoach = async () => {
    if (!coach.email) return;
    await sendAutomationEmail({
      to: String(coach.email),
      subject: title,
      message: coachMessage,
      metadata: { kind: input.reason, batchId: input.batchId, coachId: objectId(coach._id), href: "/classrooms" },
    }).catch(() => null);
  };

  const coachMetadata = {
    kind: input.reason,
    recipientType: "coach",
    batchId: input.batchId,
    coachId: objectId(coach._id),
    notificationDedupKey: `${input.reason}:${input.batchId}:${objectId(coach._id)}`,
  };

  if (isChange) {
    // Previous coach, then the new coach, then the families - in that order.
    const now = new Date();
    const nextSession = classrooms
      .flatMap((classroom: any) => classroom.generatedSessions || [])
      .filter((session: any) => session?.scheduledFor && new Date(session.scheduledFor).getTime() >= now.getTime() && !["cancelled", "completed"].includes(String(session.status || "")))
      .sort((a: any, b: any) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())[0];
    const students = (batch.students || []).filter((student: any) => student?.isActive !== false);
    const result = await notifyCoachHandover({
      scope: "batch",
      scopeId: input.batchId,
      label: summary.batchCode,
      previousCoachId: input.previousCoachId,
      newCoachId: objectId(coach._id),
      studentIds: students.map((student: any) => objectId(student._id)).filter(Boolean),
      effectiveFrom: nextSession?.scheduledFor || nextScheduledSessionStart(classrooms),
      course: summary.course,
      level: summary.level,
      timings: summary.timings,
      nextTopic: String(nextSession?.topicName || "Not set"),
      studentsLabel: summary.students,
      newCoachFallback: () => sendBatchCoachTemplate({ coach, summary, isChange, metadata: coachMetadata }),
    });
    await emailCoach();
    return { sent: 1 + ("students" in result ? result.students ?? 0 : 0) };
  }

  await emailCoach();
  await sendBatchCoachTemplate({ coach, summary, isChange, metadata: coachMetadata })
    .catch((error) => console.error("Batch coach WhatsApp failed", error));
  return { sent: 1 };
}
