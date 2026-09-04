import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { ACADEMY_TIME_ZONE, formatAcademyDateTime } from "@/lib/academyTime";
import { sendWhatsAppAutomationTemplates, whatsappRecipientName } from "@/lib/whatsappAutomationEvents";

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
    timings: lines.join("\n"),
    firstClassDate: firstClassDate(input.classrooms),
  };
}

export async function notifyBatchCoachAssigned(input: {
  batchId: string;
  previousCoachId?: string;
  reason: "new_batch_assigned" | "permanent_coach_changed";
}) {
  const { batch, classrooms } = await batchContext(input.batchId);
  if (!batch?.coach) return { sent: 0, skipped: true };
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

  const whatsappInputs: Array<Parameters<typeof sendWhatsAppAutomationTemplates>[0][number]> = [{
    user: coach,
    templateName: isChange ? "batch_permanent_coach_assigned_coach" : "batch_new_assigned_coach",
    bodyParameters: [
      coach.name || "Coach",
      summary.batchCode,
      summary.course,
      summary.level,
      summary.timings,
      summary.firstClassDate,
    ],
    metadata: {
      kind: input.reason,
      recipientType: "coach",
      batchId: input.batchId,
      coachId: objectId(coach._id),
      notificationDedupKey: `${input.reason}:${input.batchId}:${objectId(coach._id)}`,
    },
  }];

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
      return Promise.all([
        student.email && sendAutomationEmail({
          to: String(student.email),
          subject: `Permanent coach update for ${summary.batchCode}`,
          message,
          metadata: { kind: input.reason, batchId: input.batchId, studentId: objectId(student._id), href: "/dashboard" },
        }).catch(() => null),
        student.parentEmail && sendAutomationEmail({
          to: String(student.parentEmail),
          subject: `Permanent coach update for ${summary.batchCode}`,
          message,
          metadata: { kind: input.reason, batchId: input.batchId, studentId: objectId(student._id), recipientType: "parent", href: "/dashboard" },
        }).catch(() => null),
      ]);
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

  await sendWhatsAppAutomationTemplates(whatsappInputs);
  return { sent: whatsappInputs.length };
}
