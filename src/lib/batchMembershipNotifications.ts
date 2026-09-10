import "server-only";

import { formatAcademyDateTime } from "@/lib/academyTime";
import { batchObjectId as objectId, batchTimingLines, findBatchClassrooms } from "@/lib/batchSummary";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { nextClassDateLabel } from "@/lib/firstClassDate";
import { resolveAudienceEmails } from "@/lib/studentContact";
import { sendWhatsAppAutomationTemplate, whatsappRecipientName } from "@/lib/whatsappAutomationEvents";
import { Batch } from "@/models/Batch";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * Who hears about a student arriving in or leaving a batch.
 *
 * Three separate messages, deliberately worded for three different readers:
 *
 *   - the coach they are leaving  -> "X has left your batch". Where the student
 *     is going is withheld on purpose and must not be added: that placement is
 *     between the academy and the family, and the outgoing coach has no part in it.
 *   - the family                  -> the new batch, the new coach, the timings
 *     and when to next turn up.
 *   - the coach they are joining  -> "X has joined your batch", fired once per
 *     arrival whether the student is a fresh admission or a transfer in. See
 *     `alreadyAnnouncedJoin` for what stops the second copy.
 */

const COACH_FIELDS = "_id name email phone countryCode username role";
const STUDENT_FIELDS = "_id name username email phone countryCode parentName parentEmail role isActive";

type BatchArrivalReason = "new_admission" | "batch_changed";
type BatchDepartureReason = "batch_changed" | "removed_from_batch";

async function loadCoach(coachId?: string) {
  const cleanId = String(coachId || "");
  if (!cleanId) return null;
  const coach: any = await User.findOne({ _id: cleanId, isActive: { $ne: false } }).select(COACH_FIELDS).lean();
  return coach || null;
}

async function loadStudents(studentIds: string[]) {
  if (!studentIds.length) return [];
  const students: any[] = await User.find({ _id: { $in: studentIds }, role: "student" }).select(STUDENT_FIELDS).lean();
  return students;
}

/** Batch, its coach and the running classrooms that carry the schedule. */
async function batchContext(batchId: string, coachIdOverride?: string) {
  const batch: any = await Batch.findById(batchId).select("name level coach studentEnrollments").lean();
  if (!batch) return null;
  const [coach, classrooms] = await Promise.all([
    loadCoach(coachIdOverride || objectId(batch.coach)),
    findBatchClassrooms(batchId) as Promise<any[]>,
  ]);
  const primary = classrooms[0] || {};
  return {
    batch,
    coach,
    classrooms,
    batchCode: batch.name || "Batch",
    course: primary.courseName || "Not set",
    level: primary.levelName || batch.level || primary.level || "Not set",
    timings: batchTimingLines(batch, classrooms),
    nextClassDate: nextClassDateLabel(classrooms),
  };
}

/** When this student's current spell in the batch began. */
function enrolledAtFor(batch: any, studentId: string) {
  const entry = (batch?.studentEnrollments || []).find((item: any) => objectId(item?.student) === studentId);
  const enrolledAt = entry?.enrolledAt ? new Date(entry.enrolledAt) : null;
  return enrolledAt && !Number.isNaN(enrolledAt.getTime()) ? enrolledAt : null;
}

/**
 * Has this coach already been told about this arrival?
 *
 * The in-app notification doubles as the ledger, and the window is the
 * student's current enrolment rather than a fixed number of hours: a transfer
 * and a roster edit landing the same student in the same batch collapse to one
 * message, while somebody who genuinely leaves and comes back months later is
 * announced again, because coming back writes a fresh `enrolledAt` that the
 * earlier notice predates.
 */
async function alreadyAnnouncedJoin(input: { coachId: string; batchId: string; studentId: string; enrolledAt: Date | null }) {
  const existing = await Notification.findOne({
    user: input.coachId,
    type: "batch_student_joined",
    "metadata.batchId": input.batchId,
    "metadata.studentId": input.studentId,
    ...(input.enrolledAt ? { createdAt: { $gte: input.enrolledAt } } : {}),
  })
    .select("_id")
    .lean()
    .catch(() => null);
  return Boolean(existing);
}

/**
 * Tell the coach a student has left their batch.
 *
 * Where the student went is not in the message and must not be added to it.
 */
export async function notifyStudentsLeftBatchCoach(input: {
  batchId: string;
  studentIds: string[];
  coachId?: string;
  reason: BatchDepartureReason;
  effectiveFrom?: Date;
}) {
  const studentIds = input.studentIds.map(String).filter(Boolean);
  if (!input.batchId || !studentIds.length) return { sent: 0, skipped: true };

  const context = await batchContext(input.batchId, input.coachId);
  if (!context?.coach) return { sent: 0, skipped: true, reason: "no_coach" };

  const coach = context.coach;
  const coachId = objectId(coach._id);
  const effectiveFrom = input.effectiveFrom || new Date();
  const effectiveFromLabel = formatAcademyDateTime(effectiveFrom, { hour: undefined, minute: undefined });
  const students = await loadStudents(studentIds);
  let sent = 0;

  for (const student of students) {
    const studentId = objectId(student._id);
    const studentName = String(student.name || student.username || "A student").trim();
    const title = `${studentName} has left ${context.batchCode}`;
    const message = [
      `Hello ${coach.name || "Coach"},`,
      "",
      `${studentName} has left ${context.batchCode} with effect from ${effectiveFromLabel}.`,
      "",
      "Their upcoming classes in this batch have been taken off your register. The classes you have already taught them stay on their record.",
      "",
      "Please review the batch in the academy portal.",
    ].join("\n");
    const metadata = {
      kind: "batch_student_left",
      reason: input.reason,
      recipientType: "coach",
      batchId: input.batchId,
      coachId,
      studentId,
      href: "/classrooms",
      notificationDedupKey: `batch_student_left:${input.batchId}:${studentId}:${effectiveFrom.toISOString().slice(0, 10)}`,
    };

    await Notification.create({ user: coach._id, type: "batch_student_left", title, message, metadata })
      .catch((error: unknown) => console.error("Batch departure notification failed", error));

    if (coach.email) {
      await sendAutomationEmail({ to: String(coach.email), subject: title, message, metadata: { ...metadata, userId: coachId } })
        .catch((error: unknown) => console.error("Batch departure email failed", error));
    }

    await sendWhatsAppAutomationTemplate({
      user: coach,
      templateName: "batch_student_left_coach",
      bodyParameters: [whatsappRecipientName(coach, "Coach"), studentName, context.batchCode, effectiveFromLabel],
      metadata,
    }).catch((error: unknown) => console.error("Batch departure WhatsApp failed", error));

    sent += 1;
  }

  return { sent };
}

/**
 * Tell the coach a student has joined their batch - once per arrival, whether
 * the student is a fresh admission or a transfer in from another batch.
 */
export async function notifyStudentsJoinedBatchCoach(input: {
  batchId: string;
  studentIds: string[];
  reason: BatchArrivalReason;
}) {
  const studentIds = input.studentIds.map(String).filter(Boolean);
  if (!input.batchId || !studentIds.length) return { sent: 0, skipped: true };

  const context = await batchContext(input.batchId);
  if (!context?.coach) return { sent: 0, skipped: true, reason: "no_coach" };

  const coach = context.coach;
  const coachId = objectId(coach._id);
  const students = await loadStudents(studentIds);
  let sent = 0;

  for (const student of students) {
    if (student.isActive === false) continue;
    const studentId = objectId(student._id);
    const enrolledAt = enrolledAtFor(context.batch, studentId);
    if (await alreadyAnnouncedJoin({ coachId, batchId: input.batchId, studentId, enrolledAt })) continue;

    const studentName = String(student.name || student.username || "A student").trim();
    const title = `${studentName} has joined ${context.batchCode}`;
    const message = [
      `Hello ${coach.name || "Coach"},`,
      "",
      `${studentName} has joined your batch ${context.batchCode}.`,
      "",
      `Course: ${context.course}`,
      `Course Level: ${context.level}`,
      "Timings:",
      context.timings,
      `Next Class Date: ${context.nextClassDate}`,
      "",
      "Please review the batch and classroom details in the academy portal.",
    ].join("\n");
    const metadata = {
      kind: "batch_student_joined",
      reason: input.reason,
      recipientType: "coach",
      batchId: input.batchId,
      coachId,
      studentId,
      href: "/classrooms",
      notificationDedupKey: `batch_student_joined:${input.batchId}:${studentId}`,
    };

    // Written before anything goes out, so a second code path reaching the same
    // arrival finds the ledger entry rather than sending a second copy.
    await Notification.create({ user: coach._id, type: "batch_student_joined", title, message, metadata })
      .catch((error: unknown) => console.error("Batch arrival notification failed", error));

    if (coach.email) {
      await sendAutomationEmail({ to: String(coach.email), subject: title, message, metadata: { ...metadata, userId: coachId } })
        .catch((error: unknown) => console.error("Batch arrival email failed", error));
    }

    await sendWhatsAppAutomationTemplate({
      user: coach,
      templateName: "batch_student_joined_coach",
      bodyParameters: [
        whatsappRecipientName(coach, "Coach"),
        studentName,
        context.batchCode,
        context.course,
        context.level,
        context.timings,
        context.nextClassDate,
      ],
      metadata,
    }).catch((error: unknown) => console.error("Batch arrival WhatsApp failed", error));

    sent += 1;
  }

  return { sent };
}

/**
 * Tell the family the student's batch has changed: the new batch, who now
 * coaches it, when it meets and when to next turn up.
 */
export async function notifyStudentBatchChanged(input: { studentId: string; toBatchId: string; fromBatchId?: string }) {
  const studentId = String(input.studentId || "");
  if (!studentId || !input.toBatchId) return { sent: 0, skipped: true };

  const [context, students] = await Promise.all([batchContext(input.toBatchId), loadStudents([studentId])]);
  const student = students[0];
  if (!context || !student) return { sent: 0, skipped: true };

  const coachName = context.coach?.name || "your coach";
  const studentName = String(student.name || student.username || "your child").trim();
  const contactName = String(student.parentName || student.name || "there").trim();
  const subject = `Batch update for ${studentName}`;
  const message = [
    `Hello ${contactName},`,
    "",
    `${studentName}'s batch has been changed to ${context.batchCode}.`,
    "",
    `Coach: ${coachName}`,
    "Timings:",
    context.timings,
    `Next Class Date: ${context.nextClassDate}`,
    "",
    "Everything from the previous batch stays in the academy portal to look back on.",
    "",
    "Regards,",
    "Team Envision Chess Academy",
  ].join("\n");
  const metadata = {
    kind: "batch_changed",
    batchId: input.toBatchId,
    fromBatchId: input.fromBatchId || "",
    studentId,
    href: "/dashboard",
    notificationDedupKey: `batch_changed:${input.toBatchId}:${studentId}`,
  };

  const emails = resolveAudienceEmails(
    student.email
      ? { to: String(student.email), subject, message, metadata: { ...metadata, recipientType: "student", userId: studentId } }
      : null,
    student.parentEmail
      ? { to: String(student.parentEmail), subject, message, metadata: { ...metadata, recipientType: "parent", userId: studentId } }
      : null,
  );
  await Promise.all(
    emails.map((email) => sendAutomationEmail(email).catch((error: unknown) => console.error("Batch change email failed", error)))
  );

  await sendWhatsAppAutomationTemplate({
    user: student,
    templateName: "batch_changed_student",
    bodyParameters: [
      // The same greeting as the email: one family, one inbox, one phone.
      contactName || whatsappRecipientName(student),
      studentName,
      context.batchCode,
      coachName,
      context.timings,
      context.nextClassDate,
    ],
    metadata: { ...metadata, recipientType: student.parentName ? "parent" : "student" },
  }).catch((error: unknown) => console.error("Batch change WhatsApp failed", error));

  return { sent: 1 };
}
