import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { resolveAudienceEmails } from "@/lib/studentContact";
import { ACADEMY_TIME_ZONE, formatAcademyDateTime } from "@/lib/academyTime";
import { sendWhatsAppAutomationTemplates, whatsappRecipientName } from "@/lib/whatsappAutomationEvents";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import type { WhatsAppSendResult } from "@/lib/whatsappAutomation";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function dayName(day: number) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: ACADEMY_TIME_ZONE, weekday: "long" }).format(
    new Date(Date.UTC(2026, 7, 2 + Number(day || 0)))
  );
}

function scheduleLinesForClassroom(classroom: any) {
  if (Array.isArray(classroom?.daysOfWeek) && classroom.daysOfWeek.length) {
    return classroom.daysOfWeek.flatMap((day: any) =>
      (day.slots || []).map((slot: any) => `${dayName(day.day)} at ${slot.startTime || classroom.startTime || "time not set"} (${slot.durationMinutes || classroom.durationMinutes || 60} min)`)
    );
  }
  if (classroom?.classDate) return [formatAcademyDateTime(classroom.classDate, { timeZoneName: "short" })];
  if (classroom?.startDate && classroom?.startTime) return [`From ${formatAcademyDateTime(classroom.startDate, { hour: undefined, minute: undefined })} at ${classroom.startTime}`];
  return ["Timings not set"];
}

function studentListLabel(students: any[]) {
  const names = students.map((student: any) => String(student?.name || student?.username || "").trim()).filter(Boolean);
  if (!names.length) return "No students enrolled yet";
  const shown = names.slice(0, 15);
  const remaining = names.length - shown.length;
  return `${shown.join(", ")}${remaining > 0 ? ` and ${remaining} more` : ""} (${names.length} total)`;
}

function firstClassDate(classrooms: any[]) {
  const timestamps = classrooms
    .flatMap((classroom) => [
      ...(classroom.generatedSessions || []).map((session: any) => session.scheduledFor),
      classroom.classDate,
      classroom.startDate,
    ])
    .map((value) => value ? new Date(value) : null)
    .filter((date): date is Date => Boolean(date && !Number.isNaN(date.getTime())))
    .sort((a, b) => a.getTime() - b.getTime());
  return timestamps[0] ? formatAcademyDateTime(timestamps[0], { timeZoneName: "short" }) : "Not set";
}

async function batchContext(batchId: string) {
  const [batch, classrooms] = await Promise.all([
    Batch.findById(batchId).populate("coach", "name email phone countryCode username role").populate("students", "name email phone countryCode username parentName parentEmail role isActive").lean(),
    Classroom.find({
      batches: batchId,
      isActive: { $ne: false },
      isSessionInstance: { $ne: true },
      status: { $nin: ["completed", "cancelled"] },
    }).select("title courseName levelName level startTime classDate startDate daysOfWeek generatedSessions").lean(),
  ]);
  return { batch: batch as any, classrooms: classrooms as any[] };
}

function coachSummary(input: { batch: any; classrooms: any[] }) {
  const primaryClassroom = input.classrooms[0] || {};
  const lines = input.classrooms.length
    ? input.classrooms.flatMap((classroom) => scheduleLinesForClassroom(classroom).map((line: string) => `${classroom.title || input.batch.name}: ${line}`))
    : ["Timings not set"];
  return {
    batchCode: input.batch?.name || "Batch",
    course: primaryClassroom.courseName || "Not set",
    level: primaryClassroom.levelName || input.batch?.level || primaryClassroom.level || "Not set",
    timings: lines.filter(Boolean).join("\n") || "Timings not set",
    firstClassDate: firstClassDate(input.classrooms),
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

  if (coach.email) {
    await sendAutomationEmail({
      to: String(coach.email),
      subject: title,
      message: coachMessage,
      metadata: { kind: input.reason, batchId: input.batchId, coachId: objectId(coach._id), href: "/classrooms" },
    }).catch(() => null);
  }

  const coachMetadata = {
    kind: input.reason,
    recipientType: "coach",
    batchId: input.batchId,
    coachId: objectId(coach._id),
    notificationDedupKey: `${input.reason}:${input.batchId}:${objectId(coach._id)}`,
  };
  const whatsappInputs: Array<Parameters<typeof sendWhatsAppAutomationTemplates>[0][number]> = [];

  if (isChange) {
    const students = (batch.students || []).filter((student: any) => student?.isActive !== false);
    await Promise.all(students.map((student: any) => {
      const message = [
        `Hello ${student.parentName || student.name || "there"},`,
        "",
        `We would like to inform you that Coach ${coach.name || "the assigned coach"} will now be the permanent coach for ${summary.batchCode}.`,
        `Course: ${summary.course}.`,
        `Course Level: ${summary.level}.`,
        "",
        "Timings:",
        summary.timings,
        "",
        "The curriculum remains well-coordinated and classes will continue through the academy portal.",
        "",
        "Regards,",
        "Team Envision Chess Academy",
      ].join("\n");
      const coachUpdateEmails = resolveAudienceEmails(
        student.email
          ? {
              to: String(student.email),
              subject: `Permanent coach update for ${summary.batchCode}`,
              message,
              metadata: { kind: input.reason, batchId: input.batchId, studentId: objectId(student._id), href: "/dashboard" },
            }
          : null,
        student.parentEmail
          ? {
              to: String(student.parentEmail),
              subject: `Permanent coach update for ${summary.batchCode}`,
              message,
              metadata: { kind: input.reason, batchId: input.batchId, studentId: objectId(student._id), recipientType: "parent", href: "/dashboard" },
            }
          : null,
      );
      return Promise.all(coachUpdateEmails.map((coachUpdateEmail) => sendAutomationEmail(coachUpdateEmail).catch(() => null)));
    }));
    whatsappInputs.push(...students.map((student: any) => ({
      user: student,
      templateName: "batch_permanent_coach_changed_student",
      bodyParameters: [
        whatsappRecipientName(student),
        summary.batchCode,
        coach.name || "the assigned coach",
        summary.course,
        summary.level,
        summary.timings,
      ],
      metadata: {
        kind: input.reason,
        recipientType: student.parentName ? "parent" : "student",
        batchId: input.batchId,
        studentId: objectId(student._id),
        coachId: objectId(coach._id),
        notificationDedupKey: `${input.reason}:${input.batchId}:${objectId(student._id)}`,
      },
    })));
  }

  await sendBatchCoachTemplate({ coach, summary, isChange, metadata: coachMetadata })
    .catch((error) => console.error("Batch coach WhatsApp failed", error));
  await sendWhatsAppAutomationTemplates(whatsappInputs);
  return { sent: whatsappInputs.length + 1 };
}
