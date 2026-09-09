import { Batch } from "@/models/Batch";
import { User } from "@/models/User";
import { Notification } from "@/models/Fee";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { ACADEMY_TIME_ZONE, formatAcademyDateTime } from "@/lib/academyTime";
import { firstClassDateLabel, scheduledDateLabel } from "@/lib/firstClassDate";
import { sendWhatsAppAutomationTemplate, whatsappRecipientName } from "@/lib/whatsappAutomationEvents";
import type { WhatsAppSendResult } from "@/lib/whatsappAutomation";

/**
 * Coaches hear about the batches handed to them through batchCoachNotifications, but a class
 * created straight in the Classrooms module never travels through a batch - so without this the
 * assigned coach learns about the class only by opening the portal.
 */
export type ClassroomCoachNotificationReason = "classroom_created" | "extra_class_added";

type ClassSummary = {
  classTitle: string;
  batchLabel: string;
  course: string;
  level: string;
  topic: string;
  schedule: string;
  firstClassDate: string;
  students: string;
};

/**
 * Meta codes that mean "this template cannot be used right now" - the class template is still
 * awaiting approval, or it has been paused or disabled - as opposed to a parameter mistake on our
 * side, which should surface instead of being masked by the fallback.
 */
const TEMPLATE_UNAVAILABLE_META_CODES = new Set([132001, 132015, 132016]);

function recordId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function dayName(day: number) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: ACADEMY_TIME_ZONE, weekday: "long" }).format(
    new Date(Date.UTC(2026, 7, 2 + Number(day || 0)))
  );
}

function seriesScheduleLines(classroom: any) {
  if (Array.isArray(classroom?.daysOfWeek) && classroom.daysOfWeek.length) {
    return classroom.daysOfWeek.flatMap((day: any) =>
      (day.slots || []).map((slot: any) => `${dayName(day.day)} at ${slot.startTime || classroom.startTime || "time not set"} (${slot.durationMinutes || classroom.durationMinutes || 60} min)`)
    );
  }
  if (classroom?.classDate) return [scheduledDateLabel(classroom, classroom.classDate, { weekday: "long" })];
  if (classroom?.startDate && classroom?.startTime) return [`From ${scheduledDateLabel(classroom, classroom.startDate)}`];
  return ["Timings not set"];
}

function sessionScheduleLine(session: any, classroom: any) {
  return `${formatAcademyDateTime(session.scheduledFor, { weekday: "long", timeZoneName: "short" })} (${session.durationMinutes || classroom?.durationMinutes || 60} min)`;
}

function studentListLabel(students: any[]) {
  const names = students.map((student: any) => String(student?.name || student?.username || "").trim()).filter(Boolean);
  if (!names.length) return "No students enrolled yet";
  const shown = names.slice(0, 15);
  const remaining = names.length - shown.length;
  return `${shown.join(", ")}${remaining > 0 ? ` and ${remaining} more` : ""} (${names.length} total)`;
}

async function classSummary(classroom: any, session?: any): Promise<ClassSummary> {
  const classTitle = String(classroom?.title || "Class");
  const batchIds = (classroom?.batches || []).map(recordId).filter(Boolean);
  const studentIds = (classroom?.students || []).map(recordId).filter(Boolean);
  const [batches, students] = await Promise.all([
    batchIds.length ? Batch.find({ _id: { $in: batchIds } }).select("name students").lean() : Promise.resolve([]),
    studentIds.length ? User.find({ _id: { $in: studentIds }, isActive: { $ne: false } }).select("name username").lean() : Promise.resolve([]),
  ]);
  // A class created before its roster is filled still lists the batch it belongs to, so the coach
  // can see who is enrolled even when the classroom itself carries no students yet.
  const rosterIds = students.length
    ? []
    : Array.from(new Set((batches as any[]).flatMap((batch: any) => (batch.students || []).map(recordId)).filter(Boolean)));
  const roster = rosterIds.length
    ? await User.find({ _id: { $in: rosterIds }, isActive: { $ne: false } }).select("name username").lean()
    : students;
  const scheduleLines = session?.scheduledFor ? [sessionScheduleLine(session, classroom)] : seriesScheduleLines(classroom);
  const schedule = scheduleLines.filter(Boolean).join("\n") || "Timings not set";
  return {
    classTitle,
    batchLabel: (batches as any[]).map((batch: any) => batch.name).filter(Boolean).join(", ") || "Not linked to a batch",
    course: String(classroom?.courseName || "Not set"),
    level: String(classroom?.levelName || classroom?.level || "Not set"),
    topic: String(session?.topicName || classroom?.topicName || "Not set"),
    schedule,
    firstClassDate: firstClassDateLabel([classroom], session),
    students: studentListLabel(roster as any[]),
  };
}

function templateUnavailable(result: WhatsAppSendResult) {
  if (result.delivered || result.skipped) return false;
  const code = Number((result.payload as any)?.error?.code || 0);
  if (TEMPLATE_UNAVAILABLE_META_CODES.has(code)) return true;
  const text = `${result.errorMessage || ""} ${result.error || ""}`;
  return /does not exist|not been approved|template.{0,40}(missing|not found)|paused|disabled/i.test(text);
}

/**
 * Sends the class-specific template, falling back to the long-approved batch template while
 * class_assigned_coach is still waiting on Meta approval, so the coach is reached either way.
 */
async function sendCoachClassTemplate(input: { coach: any; summary: ClassSummary; metadata: Record<string, unknown> }) {
  const coachName = whatsappRecipientName(input.coach, "Coach");
  const primary = await sendWhatsAppAutomationTemplate({
    user: input.coach,
    templateName: "class_assigned_coach",
    bodyParameters: [
      coachName,
      input.summary.batchLabel,
      input.summary.classTitle,
      input.summary.course,
      input.summary.level,
      input.summary.topic,
      input.summary.schedule,
      input.summary.firstClassDate,
      input.summary.students,
    ],
    metadata: input.metadata,
  });
  if (!templateUnavailable(primary)) return primary;

  console.warn("class_assigned_coach is not usable in Meta yet, falling back to batch_new_assigned_coach", {
    error: primary.errorMessage || primary.error || "",
    metaCode: (primary.payload as any)?.error?.code,
  });
  return sendWhatsAppAutomationTemplate({
    user: input.coach,
    templateName: "batch_new_assigned_coach",
    bodyParameters: [
      coachName,
      input.summary.batchLabel,
      input.summary.course,
      input.summary.level,
      input.summary.schedule,
      input.summary.firstClassDate,
    ],
    metadata: {
      ...input.metadata,
      fallbackFor: "class_assigned_coach",
      notificationDedupKey: `${input.metadata.notificationDedupKey || ""}:fallback`,
    },
  });
}

export async function notifyClassroomCoachAssigned(input: {
  classroom: any;
  reason: ClassroomCoachNotificationReason;
  session?: any;
}) {
  const classroomId = recordId(input.classroom?._id);
  const coachId = recordId(input.classroom?.coach || input.classroom?.instructor);
  if (!classroomId || !coachId) return { sent: 0, skipped: true };

  const coach: any = await User.findOne({ _id: coachId, role: "instructor", isActive: { $ne: false } })
    .select("_id name email phone username countryCode role")
    .lean();
  if (!coach) return { sent: 0, skipped: true };

  const isExtraClass = input.reason === "extra_class_added";
  const summary = await classSummary(input.classroom, input.session);
  const sessionId = recordId(input.session?._id);
  const title = isExtraClass ? "Extra class added to your schedule" : "New class assigned";
  const message = [
    `Hello ${coach.name || "Coach"},`,
    "",
    isExtraClass ? "An extra class has been added to your schedule." : "A new class has been assigned to you.",
    "",
    `Batch: ${summary.batchLabel}`,
    `Class: ${summary.classTitle}`,
    `Course: ${summary.course}`,
    `Course Level: ${summary.level}`,
    `Topic: ${summary.topic}`,
    "Schedule:",
    summary.schedule,
    `First Class Date: ${summary.firstClassDate}`,
    `Students: ${summary.students}`,
    "",
    "Please review the class details in the academy portal.",
  ].join("\n");

  const metadata = {
    kind: "classroom_coach_assigned",
    reason: input.reason,
    recipientType: "coach",
    classroomId,
    sessionId,
    coachId,
    href: `/classrooms/${classroomId}`,
    notificationDedupKey: `${input.reason}:${classroomId}:${sessionId || "classroom"}:${coachId}`,
  };

  await Notification.create({
    user: coach._id,
    type: isExtraClass ? "class_extra_added" : "class_assigned",
    title,
    message,
    metadata,
  }).catch((error) => console.error("Coach class notification failed", error));

  if (coach.email) {
    await sendAutomationEmail({
      to: String(coach.email),
      subject: title,
      message,
      metadata: { ...metadata, userId: coachId },
    }).catch((error) => console.error("Coach class assignment email failed", error));
  }

  const whatsapp = await sendCoachClassTemplate({ coach, summary, metadata }).catch((error) => {
    console.error("Coach class assignment WhatsApp failed", error);
    return null;
  });
  return { sent: 1, whatsapp };
}
