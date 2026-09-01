import { academyDateKey, academyDateTime, ACADEMY_TIME_ZONE, formatAcademyDateTime } from "@/lib/academyTime";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { notifyFailure } from "@/lib/failureNotifications";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { Batch } from "@/models/Batch";
import { Classroom } from "@/models/Classroom";
import { Homework, HomeworkEmailReminder, Submission } from "@/models/Homework";
import { User } from "@/models/User";

type ReminderKind = "two_day" | "due_day";
type ReminderTone = ReminderKind | "manual";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000;
const TRANSIENT_DB_RETRY_DELAY_MS = 2_000;

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function uniqueIds(values: any[]) {
  return Array.from(new Set(values.map(objectId).filter(Boolean)));
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientMongoSelectionError(error: unknown) {
  const name = typeof error === "object" && error ? String((error as { name?: unknown }).name || "") : "";
  const message = error instanceof Error ? error.message : String(error || "");
  const reasonType =
    typeof error === "object" && error && "reason" in error
      ? String((error as { reason?: { type?: unknown } }).reason?.type || "")
      : "";
  return name === "MongoServerSelectionError"
    || name === "MongooseServerSelectionError"
    || /MongoServerSelectionError/i.test(message)
    || /server selection timed out/i.test(message)
    || /ReplicaSetNoPrimary/i.test(reasonType)
    || /connection <monitor> .* closed/i.test(message);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function reminderDueAt(homeworkDueAt: Date, kind: ReminderKind) {
  const targetDay = kind === "two_day" ? addDays(homeworkDueAt, -2) : homeworkDueAt;
  return academyDateTime(academyDateKey(targetDay), "08:00");
}

function reminderLabel(kind: ReminderKind) {
  return kind === "two_day" ? "2 days left" : "due today";
}

function reminderSubject(kind: ReminderKind, homeworkTitle: string) {
  return kind === "two_day"
    ? `Homework reminder: ${homeworkTitle} is due soon`
    : `Homework due today: ${homeworkTitle}`;
}

function dayKeyToUtcMs(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function academyDayDifference(target: Date, base = new Date()) {
  return Math.round((dayKeyToUtcMs(academyDateKey(target)) - dayKeyToUtcMs(academyDateKey(base))) / 86_400_000);
}

function manualReminderCopy(homeworkTitle: string, dueAt?: Date) {
  if (!dueAt || Number.isNaN(dueAt.getTime())) {
    return {
      subject: `Homework reminder: ${homeworkTitle}`,
      statusText: "pending submission",
    };
  }

  const daysUntilDue = academyDayDifference(dueAt);
  const dueDate = formatAcademyDateTime(dueAt, { hour: undefined, minute: undefined });
  if (daysUntilDue < 0) {
    return {
      subject: `Homework overdue: ${homeworkTitle}`,
      statusText: `overdue since ${dueDate}`,
    };
  }
  if (daysUntilDue === 0) {
    return {
      subject: `Homework due today: ${homeworkTitle}`,
      statusText: "due today",
    };
  }
  if (daysUntilDue === 1) {
    return {
      subject: `Homework reminder: ${homeworkTitle} is due tomorrow`,
      statusText: "due tomorrow",
    };
  }
  return {
    subject: `Homework reminder: ${homeworkTitle} is due in ${daysUntilDue} days`,
    statusText: `due in ${daysUntilDue} days, on ${dueDate}`,
  };
}

function reminderCopy(kind: ReminderTone, homeworkTitle: string, dueAt?: Date) {
  if (kind === "manual") return manualReminderCopy(homeworkTitle, dueAt);
  return {
    subject: reminderSubject(kind, homeworkTitle),
    statusText: reminderLabel(kind),
  };
}

async function assignedRecipientIds(homework: any) {
  const classroomId = objectId(homework.classroom);
  const directStudentIds = uniqueIds(homework.assignedStudents || []);
  const batchIds = uniqueIds(homework.assignedBatches || []);
  const [classroom, batches] = await Promise.all([
    classroomId ? Classroom.findById(classroomId).select("title students").lean() : null,
    batchIds.length ? Batch.find({ _id: { $in: batchIds } }).select("students").lean() : [],
  ]);
  const hasSpecificRecipients = directStudentIds.length > 0 || batchIds.length > 0;
  const batchStudentIds = (batches as any[]).flatMap((batch: any) => batch.students || []);
  const classroomStudentIds = homework.assignAllStudents || !hasSpecificRecipients
    ? ((classroom as any)?.students || [])
    : [];
  return {
    classroom,
    recipientIds: uniqueIds([...directStudentIds, ...batchStudentIds, ...classroomStudentIds]),
  };
}

async function pendingStudentsForHomework(homework: any) {
  const { classroom, recipientIds } = await assignedRecipientIds(homework);
  if (!recipientIds.length) return { classroom, students: [] as any[] };
  const submitted = await Submission.find({ homework: homework._id, student: { $in: recipientIds } })
    .select("student")
    .lean();
  const submittedIds = new Set(submitted.map((submission: any) => objectId(submission.student)));
  const pendingIds = recipientIds.filter((id) => !submittedIds.has(id));
  const students = pendingIds.length
    ? await User.find({ _id: { $in: pendingIds }, role: "student", isActive: { $ne: false } })
      .select("name username email phone")
      .lean()
    : [];
  return { classroom, students: students.filter((student: any) => Boolean(student.email || student.phone)) };
}

export async function queueHomeworkDeadlineReminders(homeworkInput: any) {
  await dbConnect();
  const homework: any = homeworkInput?._id && homeworkInput.dueAt
    ? homeworkInput
    : await Homework.findById(objectId(homeworkInput)).lean();
  const homeworkId = objectId(homework?._id || homeworkInput);
  if (!homeworkId) return { queued: 0, cancelled: 0 };

  if (!homework?.dueAt || homework.isPublished === false) {
    const cancelled = await HomeworkEmailReminder.updateMany(
      { homework: homeworkId, status: { $in: ["pending", "processing"] } },
      { $set: { status: "cancelled", cancelledAt: new Date(), lastError: "Homework has no active deadline." }, $unset: { processingStartedAt: 1 } }
    );
    return { queued: 0, cancelled: cancelled.modifiedCount || 0 };
  }

  const dueAt = new Date(homework.dueAt);
  if (Number.isNaN(dueAt.getTime())) return { queued: 0, cancelled: 0 };
  const { students } = await pendingStudentsForHomework(homework);
  const now = new Date();
  let queued = 0;

  for (const student of students) {
    for (const kind of ["two_day", "due_day"] as ReminderKind[]) {
      const sendAt = reminderDueAt(dueAt, kind);
      if (sendAt.getTime() <= now.getTime() || sendAt.getTime() > dueAt.getTime()) continue;
      const reminder: any = await HomeworkEmailReminder.findOneAndUpdate(
        { homework: homeworkId, student: student._id, kind },
        {
          $set: {
            studentEmail: String(student.email),
            studentName: student.name || student.username || "",
            dueAt: sendAt,
            homeworkDueAt: dueAt,
            status: "pending",
          },
          $unset: { processingStartedAt: 1, sentAt: 1, cancelledAt: 1, lastError: 1 },
          $setOnInsert: { attempts: 0 },
        },
        { upsert: true, new: true }
      ).lean();
      if (reminder?.status === "pending") {
        queued += 1;
        scheduleHomeworkReminder(reminder._id, new Date(reminder.dueAt));
      }
    }
  }

  const validStudentIds = students.map((student: any) => student._id);
  await HomeworkEmailReminder.updateMany(
    {
      homework: homeworkId,
      status: { $in: ["pending", "processing"] },
      student: { $nin: validStudentIds },
    },
    { $set: { status: "cancelled", cancelledAt: new Date(), lastError: "Student is no longer pending for this homework." }, $unset: { processingStartedAt: 1 } }
  );

  return { queued, cancelled: 0 };
}

async function sendHomeworkReminderEmail(input: {
  homework: any;
  classroom: any;
  student: any;
  kind: ReminderTone;
  request?: Request;
}) {
  const appUrl = resolvePublicAppUrl(input.request);
  const homeworkId = objectId(input.homework._id);
  const href = `/homework/${homeworkId}`;
  const assignmentUrl = appUrl ? `${appUrl}${href}` : "";
  const dueText = input.homework.dueAt ? formatAcademyDateTime(input.homework.dueAt) : "No deadline set";
  const timeZoneLabel = ACADEMY_TIME_ZONE === "Asia/Kolkata" ? "IST" : ACADEMY_TIME_ZONE;
  const studentName = String(input.student.name || input.student.username || "there");
  const title = String(input.homework.title || "Homework");
  const classroomTitle = String(input.classroom?.title || "");
  const copy = reminderCopy(input.kind, title, input.homework.dueAt ? new Date(input.homework.dueAt) : undefined);
  const statusText = copy.statusText;
  const message = [
    `Hello ${studentName},`,
    "",
    `This is a reminder that "${title}" is ${statusText}.`,
    classroomTitle ? `Classroom: ${classroomTitle}` : "",
    `Submission deadline: ${dueText} (${timeZoneLabel})`,
    "",
    assignmentUrl ? `Open homework: ${assignmentUrl}` : "Please sign in to your academy dashboard to complete the homework.",
  ].filter((line) => line !== "").join("\n");

  const email = input.student.email
    ? await sendAutomationEmail({
        to: String(input.student.email),
        subject: copy.subject,
        message,
        htmlBody: `<p>Hello ${escapeHtml(studentName)},</p>
      <p>This is a reminder that <strong>${escapeHtml(title)}</strong> is ${escapeHtml(statusText)}.</p>
      ${classroomTitle ? `<p><strong>Classroom:</strong> ${escapeHtml(classroomTitle)}</p>` : ""}
      <p><strong>Submission deadline:</strong> ${escapeHtml(dueText)} (${escapeHtml(timeZoneLabel)})</p>
      ${assignmentUrl ? `<p><a href="${escapeHtml(assignmentUrl)}">Open homework</a></p>` : "<p>Please sign in to your academy dashboard to complete the homework.</p>"}`,
        metadata: {
          kind: "homework_reminder",
          reminderKind: input.kind,
          homeworkId,
          classroomId: objectId(input.homework.classroom),
          dueAt: input.homework.dueAt ? new Date(input.homework.dueAt).toISOString() : null,
          href,
        },
      })
    : { delivered: false, skipped: true };
  const whatsapp = await sendWhatsAppAutomationTemplate({
    user: input.student,
    templateName: input.kind === "manual" && input.homework.dueAt && new Date(input.homework.dueAt).getTime() < Date.now()
      ? "homework_overdue_reminder"
      : "homework_due_reminder",
    bodyParameters: [studentName, title, `${dueText} (${timeZoneLabel})`],
    metadata: {
      kind: "homework_reminder",
      reminderKind: input.kind,
      homeworkId,
      classroomId: objectId(input.homework.classroom),
      href,
    },
  });
  return { ...email, delivered: Boolean((email as any).delivered || whatsapp.delivered), whatsapp };
}

export async function processHomeworkEmailReminder(reminderId: unknown) {
  await dbConnect();
  const now = new Date();
  const staleProcessingBefore = new Date(now.getTime() - 2 * 60 * 1000);
  const reminder: any = await HomeworkEmailReminder.findOneAndUpdate(
    {
      _id: reminderId,
      dueAt: { $lte: now },
      $or: [
        { status: "pending" },
        { status: "processing", processingStartedAt: { $lte: staleProcessingBefore } },
      ],
    },
    {
      $set: { status: "processing", processingStartedAt: now },
      $inc: { attempts: 1 },
      $unset: { lastError: 1 },
    },
    { new: true }
  ).lean();
  if (!reminder) return { processed: false };

  const homework: any = await Homework.findById(reminder.homework).lean();
  if (!homework?.dueAt || homework.isPublished === false) {
    await HomeworkEmailReminder.updateOne(
      { _id: reminder._id, status: "processing" },
      { $set: { status: "cancelled", cancelledAt: new Date(), lastError: "Homework deadline is no longer active." }, $unset: { processingStartedAt: 1 } }
    );
    return { processed: true, cancelled: true };
  }

  const alreadySubmitted = await Submission.exists({ homework: reminder.homework, student: reminder.student });
  if (alreadySubmitted) {
    await HomeworkEmailReminder.updateOne(
      { _id: reminder._id, status: "processing" },
      { $set: { status: "skipped", lastError: "Student already submitted this homework." }, $unset: { processingStartedAt: 1 } }
    );
    return { processed: true, skipped: true };
  }

  const [studentRecord, classroom] = await Promise.all([
    User.findById(reminder.student).select("name username email phone isActive role").lean(),
    Classroom.findById(homework.classroom).select("title").lean(),
  ]);
  const student = studentRecord as any;
  if ((!student?.email && !student?.phone) || student.isActive === false || student.role !== "student") {
    await HomeworkEmailReminder.updateOne(
      { _id: reminder._id, status: "processing" },
      { $set: { status: "cancelled", cancelledAt: new Date(), lastError: "Student email or WhatsApp phone is unavailable." }, $unset: { processingStartedAt: 1 } }
    );
    return { processed: true, cancelled: true };
  }

  const result = await sendHomeworkReminderEmail({
    homework,
    classroom,
    student,
    kind: reminder.kind,
  });
  if (result.delivered) {
    await HomeworkEmailReminder.updateOne(
      { _id: reminder._id, status: "processing" },
      { $set: { status: "sent", sentAt: new Date() }, $unset: { processingStartedAt: 1, lastError: 1 } }
    );
    return { processed: true, sent: true };
  }

  const attempts = Number(reminder.attempts || 1);
  await HomeworkEmailReminder.updateOne(
    { _id: reminder._id, status: "processing" },
    {
      $set: attempts >= MAX_ATTEMPTS
        ? { status: "failed", lastError: "Email automation did not confirm delivery." }
        : { status: "pending", dueAt: new Date(Date.now() + RETRY_DELAY_MS), lastError: "Email delivery will be retried." },
      $unset: { processingStartedAt: 1 },
    }
  );
  if (attempts >= MAX_ATTEMPTS) {
    void notifyFailure({
      title: "Homework email reminder exhausted retries",
      error: "Email automation did not confirm delivery.",
      metadata: {
        automation: "homework_email_reminder",
        reminderId: String(reminder._id || ""),
        homeworkId: String(reminder.homework || ""),
        studentId: String(reminder.student || ""),
        studentEmail: String(reminder.studentEmail || ""),
        reminderKind: String(reminder.kind || ""),
        attempts,
      },
    });
  } else {
    scheduleHomeworkReminder(reminder._id, new Date(Date.now() + RETRY_DELAY_MS));
  }
  return { processed: true, failed: attempts >= MAX_ATTEMPTS };
}

function scheduleHomeworkReminder(reminderId: unknown, dueAt: Date) {
  const waitMs = Math.max(0, dueAt.getTime() - Date.now());
  const timer = setTimeout(() => {
    void processHomeworkEmailReminder(reminderId).catch((error) => {
      console.error("Homework email reminder failed", error);
      void notifyFailure({ title: "Homework email reminder failed", error, metadata: { automation: "homework_email_reminder", reminderId: String(reminderId || "") } });
      scheduleHomeworkReminder(reminderId, new Date(Date.now() + RETRY_DELAY_MS));
    });
  }, waitMs);
  timer.unref?.();
}

async function seedUpcomingHomeworkReminders(limit = 50) {
  const now = new Date();
  const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const homework = await Homework.find({
    isPublished: { $ne: false },
    dueAt: { $gte: now, $lte: soon },
  })
    .select("_id")
    .sort({ dueAt: 1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .lean();

  for (const item of homework) await queueHomeworkDeadlineReminders(item._id);
}

export async function processDueHomeworkEmailReminders(limit = 50) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await dbConnect();
      await seedUpcomingHomeworkReminders();
      const now = new Date();
      const staleProcessingBefore = new Date(now.getTime() - 2 * 60 * 1000);
      const due = await HomeworkEmailReminder.find({
        dueAt: { $lte: now },
        $or: [
          { status: "pending" },
          { status: "processing", processingStartedAt: { $lte: staleProcessingBefore } },
        ],
      })
        .select("_id")
        .sort({ dueAt: 1 })
        .limit(Math.min(Math.max(limit, 1), 100))
        .lean();

      const results = [];
      for (const reminder of due) results.push(await processHomeworkEmailReminder(reminder._id));
      return {
        checked: due.length,
        sent: results.filter((result) => result.sent).length,
        skipped: results.filter((result) => result.skipped).length,
        cancelled: results.filter((result) => result.cancelled).length,
        failed: results.filter((result) => result.failed).length,
      };
    } catch (error) {
      if (!isTransientMongoSelectionError(error)) throw error;
      if (attempt >= 2) return { checked: 0, sent: 0, skipped: 0, cancelled: 0, failed: 0, skippedDbUnavailable: true };
      await sleep(TRANSIENT_DB_RETRY_DELAY_MS);
    }
  }

  return { checked: 0, sent: 0, skipped: 0, cancelled: 0, failed: 0 };
}

export async function sendManualHomeworkReminder(homeworkId: unknown, request?: Request) {
  await dbConnect();
  const homework: any = await Homework.findById(homeworkId).lean();
  if (!homework) throw new Error("Homework not found");
  const { classroom, students } = await pendingStudentsForHomework(homework);
  const deliveries = await Promise.all(students.map((student: any) => sendHomeworkReminderEmail({
    homework,
    classroom,
    student,
    kind: "manual",
    request,
  })));
  return {
    recipients: students.length,
    delivered: deliveries.filter((delivery) => delivery.delivered).length,
    skipped: deliveries.filter((delivery) => delivery.skipped).length,
  };
}

export async function cancelHomeworkDeadlineReminders(homeworkId: unknown, reason = "Homework was removed.") {
  await dbConnect();
  const result = await HomeworkEmailReminder.updateMany(
    { homework: homeworkId, status: { $in: ["pending", "processing"] } },
    { $set: { status: "cancelled", cancelledAt: new Date(), lastError: reason }, $unset: { processingStartedAt: 1 } }
  );
  return { cancelled: result.modifiedCount || 0 };
}
