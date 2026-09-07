import { Types } from "mongoose";
import { ACADEMY_TIME_ZONE, formatAcademyDateTime, zonedDateTime } from "@/lib/academyTime";
import { recordActivity } from "@/lib/activity";
import { importantContactsFromEnvKeys, importantContactWhatsAppRecipientsByKeys } from "@/lib/importantContacts";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWhatsAppTextMessage } from "@/lib/whatsappAutomation";
import { sendWhatsAppAutomationTemplates } from "@/lib/whatsappAutomationEvents";
import { Booking } from "@/models/Booking";
import { Batch } from "@/models/Batch";
import { Notification } from "@/models/Fee";
import { InternalTask } from "@/models/InternalTask";
import { User } from "@/models/User";

export const DEMO_MANAGEMENT_HREF = "/admin/demo-center";

export function localDateTimeLabel(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function demoClassTimeLabel(value: string | Date) {
  return formatAcademyDateTime(value, { timeZoneName: "short" }, ACADEMY_TIME_ZONE);
}

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

const DEMO_REMINDER_RULES = [
  { key: "student_1_day", recipientType: "student", offsetMinutes: 24 * 60, windowText: "tomorrow" },
  { key: "student_1_hour", recipientType: "student", offsetMinutes: 60, windowText: "in 1 hour" },
  { key: "student_15_min", recipientType: "student", offsetMinutes: 15, windowText: "in 15 minutes" },
  { key: "coach_1_day", recipientType: "coach", offsetMinutes: 24 * 60, windowText: "tomorrow" },
  { key: "coach_30_min", recipientType: "coach", offsetMinutes: 30, windowText: "in 30 minutes" },
] as const;

async function reminderAlreadySent(bookingId: string, reminderKey: string, recipientType: string) {
  return Boolean(await Notification.exists({
    type: "demo.whatsapp_reminder",
    "metadata.bookingId": bookingId,
    "metadata.reminderKey": reminderKey,
    "metadata.recipientType": recipientType,
  }));
}

async function markReminderSent(input: {
  booking: any;
  userId?: string;
  reminderKey: string;
  recipientType: string;
  classTime: string;
}) {
  await Notification.create({
    user: input.userId || input.booking.student?._id || input.booking.student,
    type: "demo.whatsapp_reminder",
    title: "Demo reminder sent",
    message: `Demo reminder sent for ${input.classTime}.`,
    metadata: {
      bookingId: objectId(input.booking._id),
      reminderKey: input.reminderKey,
      recipientType: input.recipientType,
      href: DEMO_MANAGEMENT_HREF,
    },
  }).catch(() => undefined);
}

export function normalizeDemoRequestedTime(input: {
  startAt?: string;
  preferredDate?: string;
  preferredTime?: string;
  timezone?: string;
  durationMinutes?: number;
}) {
  const timezone = String(input.timezone || ACADEMY_TIME_ZONE).trim();
  const durationMinutes = Math.max(15, Number(input.durationMinutes || 30));
  const start = input.preferredDate && input.preferredTime
    ? zonedDateTime(input.preferredDate, input.preferredTime, timezone)
    : new Date(String(input.startAt || ""));
  if (!timezone || Number.isNaN(start.getTime())) throw new Error("Please choose a valid date, time, and timezone.");
  if (start.getTime() <= Date.now()) throw new Error("Please choose a future demo time.");
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return {
    start,
    end,
    timezone,
    localLabel: localDateTimeLabel(start, timezone),
    istLabel: formatAcademyDateTime(start, { timeZoneName: "short" }, ACADEMY_TIME_ZONE),
    durationMinutes,
  };
}

export async function demoManagementUsers() {
  return User.find({ role: { $in: ["admin", "sub-admin"] }, isActive: { $ne: false } })
    .select("_id email phone name role")
    .lean();
}

function configuredRecipients(key: string, label: string) {
  const roleContacts = label === "Salesperson"
    ? importantContactsFromEnvKeys("DEMO_SALESPERSON_CONTACT_KEYS", "sales")
    : label === "Sub-Admin"
      ? importantContactsFromEnvKeys("DEMO_SUB_ADMIN_CONTACT_KEYS", "sub-admin")
      : [];
  if (roleContacts.length) {
    return roleContacts.map((contact) => ({ name: contact.name, phone: contact.phone, role: contact.role, email: contact.email }));
  }
  return String(process.env[key] || "")
    .split(",")
    .map((phone, index) => phone.trim())
    .filter(Boolean)
    .map((phone, index) => ({ name: `${label} ${index + 1}`, phone, role: label.toLowerCase().replace(/\s+/g, "_") }));
}

export function configuredDemoNotificationRecipients() {
  return {
    sales: configuredRecipients("DEMO_SALESPERSON_WHATSAPP_NUMBERS", "Salesperson"),
    subAdmins: configuredRecipients("DEMO_SUB_ADMIN_WHATSAPP_NUMBERS", "Sub-Admin"),
  };
}

async function sendConfiguredDemoTexts(recipients: Array<{ name?: string; phone?: string; role?: string }>, text: string, metadata: Record<string, unknown>) {
  await Promise.all(recipients.map((recipient) =>
    sendWhatsAppTextMessage({
      to: recipient.phone || "",
      text,
      metadata: { ...metadata, recipientRole: recipient.role || "", configuredRecipient: true },
    }).catch(() => null)
  ));
}

async function sendStaffEmails(
  recipients: Array<{ name?: string; email?: string; role?: string }>,
  subject: string,
  messageFor: (recipient: { name?: string; email?: string; role?: string }) => string,
  metadata: Record<string, unknown>
) {
  await Promise.all(recipients
    .filter((recipient) => recipient.email)
    .map((recipient) => sendAutomationEmail({
      to: String(recipient.email),
      subject,
      message: messageFor(recipient),
      metadata: { ...metadata, recipientRole: recipient.role || "" },
    }).catch(() => null)));
}

export async function notifyDemoAccountCreated(user: any) {
  const admins = await demoManagementUsers();
  const configured = configuredDemoNotificationRecipients();
  const message = `New demo account created: ${user.name || "Prospect"} (${user.email || "no email"}). Phone: ${[user.countryCode, user.phone].filter(Boolean).join(" ") || "not provided"}.`;
  await Notification.insertMany(
    admins.map((admin: any) => ({
      user: admin._id,
      type: "demo.account.created",
      title: "New demo account",
      message,
      metadata: { demoUser: user._id, href: DEMO_MANAGEMENT_HREF, event: "DEMO_ACCOUNT_CREATED" },
    }))
  ).catch(() => undefined);
  await sendConfiguredDemoTexts([...configured.sales, ...configured.subAdmins], message, {
    kind: "demo_account_created",
    event: "DEMO_ACCOUNT_CREATED",
    demoUserId: user._id?.toString?.() || "",
  });
  await sendStaffEmails([...configured.sales, ...configured.subAdmins], "New demo account created", (recipient) => [
    `Hello ${recipient.name || "Team"},`,
    "",
    message,
    "",
    "Please review it from the Demo Center.",
  ].join("\n"), {
    kind: "demo_account_created",
    event: "DEMO_ACCOUNT_CREATED",
    demoUserId: user._id?.toString?.() || "",
    href: DEMO_MANAGEMENT_HREF,
  });
  await recordActivity({
    actor: user._id?.toString?.(),
    targetUser: user._id?.toString?.(),
    type: "demo.account.created",
    label: "Demo account created",
    entityType: "User",
    entityId: user._id?.toString?.(),
    metadata: { event: "DEMO_ACCOUNT_CREATED" },
  });
}

export async function notifyDemoRequestCreated(input: { booking: any; student: any; admins: any[] }) {
  const { booking, student, admins } = input;
  const title = "New demo request";
  const message = `${student.name || "A prospect"} requested a demo for ${booking.requestedLocalDateTime || localDateTimeLabel(booking.startAt, booking.requestedTimezone || ACADEMY_TIME_ZONE)}. IST: ${booking.requestedIstDateTime || formatAcademyDateTime(booking.startAt, { timeZoneName: "short" })}.`;
  await Notification.insertMany(
    admins.map((admin: any) => ({
      user: admin._id,
      type: "demo.request.created",
      title,
      message,
      metadata: { booking: booking._id, href: DEMO_MANAGEMENT_HREF, event: "DEMO_CLASS_REQUESTED" },
    }))
  );
  const configured = configuredDemoNotificationRecipients();
  await sendConfiguredDemoTexts(configured.subAdmins, `${message} Booking ID: ${booking._id}.`, {
    kind: "demo_class_requested",
    event: "DEMO_CLASS_REQUESTED",
    bookingId: booking._id?.toString?.() || "",
  });
  await sendStaffEmails([...configured.sales, ...configured.subAdmins], "New demo booking received", (recipient) => [
    `Hello ${recipient.name || "Team"},`,
    "",
    message,
    `Booking ID: ${booking._id}.`,
    "",
    "Please review and follow up from the Demo Center.",
  ].join("\n"), {
    kind: "demo_class_requested",
    event: "DEMO_CLASS_REQUESTED",
    bookingId: booking._id?.toString?.() || "",
    href: DEMO_MANAGEMENT_HREF,
  });
}

export async function ensureDemoRequestTask(input: { booking: any; student: any; owner?: any }) {
  const bookingId = input.booking?._id;
  if (!bookingId || !Types.ObjectId.isValid(String(bookingId))) return null;
  return InternalTask.findOneAndUpdate(
    { referenceType: "DemoBooking", referenceId: bookingId },
    {
      $setOnInsert: {
        title: `New Demo Request - ${input.student?.name || "Prospect"}`,
        details: [
          `Requested: ${input.booking.requestedLocalDateTime || localDateTimeLabel(input.booking.startAt, input.booking.requestedTimezone || ACADEMY_TIME_ZONE)}`,
          `IST: ${input.booking.requestedIstDateTime || formatAcademyDateTime(input.booking.startAt, { timeZoneName: "short" })}`,
          `Contact: ${[input.student?.countryCode, input.student?.phone].filter(Boolean).join(" ") || input.student?.email || "Not provided"}`,
        ].join("\n"),
        status: "pending",
        priority: "normal",
        assignedTo: input.owner?._id,
        referenceType: "DemoBooking",
        referenceId: bookingId,
        actionHref: DEMO_MANAGEMENT_HREF,
        metadata: { bookingId: String(bookingId), studentId: String(input.student?._id || ""), event: "DEMO_CLASS_REQUESTED" },
      },
    },
    { upsert: true, new: true }
  );
}

export async function notifyDemoApproved(input: { booking: any; student: any; coach: any; classroom: any }) {
  const classTime = input.booking.requestedIstDateTime || formatAcademyDateTime(input.booking.startAt, { timeZoneName: "short" });
  const staffRecipients = importantContactWhatsAppRecipientsByKeys(["sayandeb", "sayan_bose", "dhritabrata"]);
  await sendWhatsAppAutomationTemplates([
    {
      user: input.student,
      templateName: "demo_class_approved_student",
      bodyParameters: [input.student?.name || "there", classTime],
      metadata: { kind: "demo_class_approved", event: "DEMO_APPROVED", bookingId: input.booking._id.toString(), classroomId: input.classroom._id.toString() },
    },
    ...staffRecipients.map((recipient) => ({
      user: recipient,
      templateName: "demo_class_approved_staff_alert",
      bodyParameters: [recipient.name || "Team", input.student?.name || "student", classTime, input.coach?.name || "coach"],
      metadata: {
        kind: "demo_class_approved_staff",
        event: "DEMO_APPROVED",
        recipientType: recipient.role || "staff",
        bookingId: input.booking._id.toString(),
        classroomId: input.classroom._id.toString(),
        notificationDedupKey: `demo_approved:${input.booking._id.toString()}:staff`,
      },
    })),
    {
      user: input.coach,
      templateName: "demo_class_assigned_coach",
      bodyParameters: [input.coach?.name || "Coach", input.student?.name || "student", classTime],
      metadata: { kind: "demo_class_assigned", event: "DEMO_COACH_ASSIGNED", bookingId: input.booking._id.toString(), classroomId: input.classroom._id.toString() },
    },
  ]);
  await sendStaffEmails(staffRecipients, "Demo class approved", (recipient) => [
    `Hello ${recipient.name || "Team"},`,
    "",
    `Demo class for ${input.student?.name || "student"} has been approved and scheduled for ${classTime}.`,
    `Coach: ${input.coach?.name || "coach"}.`,
    "",
    "Please review the demo workflow in the academy portal.",
  ].join("\n"), {
    kind: "demo_class_approved_staff",
    event: "DEMO_APPROVED",
    bookingId: input.booking._id.toString(),
    classroomId: input.classroom._id.toString(),
    href: DEMO_MANAGEMENT_HREF,
  });
}

export async function processDueDemoReminders(now = new Date()) {
  const horizon = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const bookings: any[] = await Booking.find({
    bookingType: "demo",
    status: "confirmed",
    demoStatus: { $in: ["APPROVED", "CLASSROOM_CREATED"] },
    startAt: { $gt: now, $lte: horizon },
  })
    .populate("student instructor assignedCoach", "name email phone countryCode username role isActive")
    .sort({ startAt: 1 })
    .limit(300)
    .lean();

  let sent = 0;
  let skipped = 0;
  for (const booking of bookings) {
    const startAt = new Date(booking.startAt);
    if (Number.isNaN(startAt.getTime())) {
      skipped += 1;
      continue;
    }
    const bookingId = objectId(booking._id);
    const classTime = demoClassTimeLabel(startAt);
    const coach = booking.assignedCoach || booking.instructor;
    for (const rule of DEMO_REMINDER_RULES) {
      const triggerAt = new Date(startAt.getTime() - rule.offsetMinutes * 60 * 1000);
      if (now.getTime() < triggerAt.getTime()) continue;
      if (rule.offsetMinutes >= 24 * 60) {
        const assignedOrApprovedAt = booking.approvedAt || booking.assignedCoachAt || booking.createdAt;
        if (assignedOrApprovedAt && new Date(assignedOrApprovedAt).getTime() > triggerAt.getTime()) continue;
      }
      if (await reminderAlreadySent(bookingId, rule.key, rule.recipientType)) continue;
      const isCoach = rule.recipientType === "coach";
      const recipient = isCoach ? coach : booking.student;
      if ((!recipient?.phone && !recipient?.email) || recipient.isActive === false) {
        skipped += 1;
        continue;
      }
      let emailAttempted = false;
      if (recipient.email) {
        emailAttempted = true;
        await sendAutomationEmail({
          to: String(recipient.email),
          subject: isCoach ? "Demo class reminder" : "Your demo class reminder",
          message: isCoach
            ? [
                `Hello ${recipient.name || "Coach"},`,
                "",
                `Reminder: your demo class with ${booking.student?.name || "student"} is ${rule.windowText}.`,
                `Scheduled for: ${classTime}.`,
                "",
                "Please open the academy portal and be ready for the session.",
              ].join("\n")
            : [
                `Hello ${recipient.name || "there"},`,
                "",
                `Reminder: your Envision Chess Academy demo class is ${rule.windowText}.`,
                `Scheduled for: ${classTime}.`,
                "",
                "Please join from your academy dashboard at the scheduled time.",
              ].join("\n"),
          metadata: {
            kind: "demo_class_reminder",
            event: "DEMO_CLASS_REMINDER",
            bookingId,
            reminderKey: rule.key,
            recipientType: rule.recipientType,
            href: isCoach ? "/classrooms" : "/dashboard",
          },
        }).catch(() => null);
      }
      const results = recipient.phone
        ? await sendWhatsAppAutomationTemplates([{
            user: recipient,
            templateName: isCoach ? "demo_class_reminder_coach" : "demo_class_reminder_student",
            bodyParameters: isCoach
              ? [recipient.name || "Coach", booking.student?.name || "student", rule.windowText, classTime]
              : [recipient.name || "there", rule.windowText, classTime],
            metadata: {
              kind: "demo_class_reminder",
              event: "DEMO_CLASS_REMINDER",
              bookingId,
              reminderKey: rule.key,
              recipientType: rule.recipientType,
              href: isCoach ? "/classrooms" : "/dashboard",
              notificationDedupKey: `demo_reminder:${bookingId}:${rule.key}:${rule.recipientType}`,
            },
          }])
        : [];
      if (emailAttempted || results.some((result) => result.ok || result.skipped)) {
        await markReminderSent({
          booking,
          userId: objectId(recipient._id || recipient.id),
          reminderKey: rule.key,
          recipientType: rule.recipientType,
          classTime,
        });
        sent += 1;
      } else {
        skipped += 1;
      }
    }
  }
  return { checked: bookings.length, sent, skipped };
}

export async function notifyDemoMissed(input: { booking: any; student?: any; coach?: any; classroom?: any }) {
  const bookingId = objectId(input.booking?._id || input.booking);
  if (!bookingId) return { sent: 0 };
  const hasPopulatedStudent = input.booking?.student && typeof input.booking.student === "object" && input.booking.student.name;
  const booking: any = hasPopulatedStudent
    ? input.booking
    : await Booking.findById(bookingId).populate("student instructor assignedCoach", "name email phone countryCode username role").lean();
  const student = input.student || booking?.student;
  const classTime = demoClassTimeLabel(booking?.startAt || input.classroom?.classDate || new Date());
  const recipients = [
    ...importantContactWhatsAppRecipientsByKeys(["saptarshi"]).map((recipient) => ({
      recipient,
      templateName: "demo_no_show_reschedule_admin",
      bodyParameters: [recipient.name || "Saptarshi", student?.name || "student", classTime],
      role: "admin",
    })),
    ...importantContactWhatsAppRecipientsByKeys(["sayandeb"]).map((recipient) => ({
      recipient,
      templateName: "demo_no_show_sales_alert",
      bodyParameters: [recipient.name || "Sayandeb", student?.name || "student", classTime],
      role: "sales",
    })),
  ];
  await sendWhatsAppAutomationTemplates(recipients.map((item) => ({
    user: item.recipient,
    templateName: item.templateName,
    bodyParameters: item.bodyParameters,
    metadata: {
      kind: "demo_no_show_staff_alert",
      event: "DEMO_NO_SHOW",
      recipientType: item.role,
      bookingId,
      studentId: objectId(student?._id || student),
      href: DEMO_MANAGEMENT_HREF,
      notificationDedupKey: `demo_no_show:${bookingId}:${item.role}`,
    },
  })));
  await sendStaffEmails(recipients.map((item) => item.recipient), `Demo missed: ${student?.name || "Student"}`, (recipient) => {
    const isSales = recipient.role === "sales";
    return [
      `Hello ${recipient.name || "Team"},`,
      "",
      `${student?.name || "A student"} missed the demo class scheduled for ${classTime}.`,
      isSales
        ? "Please coordinate with Saptarshi to set a new timing and restart follow-up."
        : "If this is the first missed demo, please reschedule it from the Demo Center.",
      "",
      "Open the Demo Center to review the booking.",
    ].join("\n");
  }, {
    kind: "demo_no_show_staff_alert",
    event: "DEMO_NO_SHOW",
    bookingId,
    studentId: objectId(student?._id || student),
    href: DEMO_MANAGEMENT_HREF,
  });
  return { sent: recipients.length };
}

/**
 * A closed demo was revived because the CRM moved the lead back into a demo
 * stage. Nobody is watching the Demo Center for that, and the original slot has
 * already passed, so the sub-admin is told directly that this needs a coach and
 * a new time agreed with the parent.
 */
export async function notifyDemoReopened(input: {
  studentId: string;
  bookingId?: string;
  stageName?: string;
}) {
  const student: any = await User.findById(input.studentId)
    .select("name email phone countryCode username role")
    .lean();
  if (!student) return { sent: 0 };

  const contact = [student.countryCode, student.phone].filter(Boolean).join(" ").trim() || student.email || "no contact on file";
  const recipients = importantContactWhatsAppRecipientsByKeys(["saptarshi"]);
  const studentName = student.name || "a student";

  await sendWhatsAppAutomationTemplates(recipients.map((recipient) => ({
    user: recipient,
    templateName: "demo_reopened_admin",
    bodyParameters: [recipient.name || "Saptarshi", studentName, contact],
    metadata: {
      kind: "demo_reopened_admin",
      event: "DEMO_REOPENED",
      recipientType: recipient.role || "sub-admin",
      bookingId: input.bookingId || "",
      studentId: input.studentId,
      href: DEMO_MANAGEMENT_HREF,
      notificationDedupKey: `demo_reopened:${input.bookingId || input.studentId}`,
    },
  })));

  await sendStaffEmails(recipients, `Demo reopened: ${studentName}`, (recipient) => [
    `Hello ${recipient.name || "Saptarshi"},`,
    "",
    `The demo for ${studentName} has been reopened because the lead was moved back to "${input.stageName || "a demo stage"}" in the CRM.`,
    `Contact: ${contact}.`,
    "",
    "The originally requested slot has already passed, so this needs two things:",
    "1. Confirm a new date and time with the parent.",
    "2. Assign a coach and approve the demo from the Demo Center.",
    "",
    "The booking is flagged \"Needs a new time\" in the Requested tab.",
  ].join("\n"), {
    kind: "demo_reopened_admin",
    event: "DEMO_REOPENED",
    bookingId: input.bookingId || "",
    studentId: input.studentId,
    href: DEMO_MANAGEMENT_HREF,
  });

  return { sent: recipients.length };
}

export async function notifyDemoConverted(input: {
  studentId: string;
  bookingId?: string;
  courseName?: string;
  batchId?: string;
  batchName?: string;
}) {
  const [student, batch]: any[] = await Promise.all([
    User.findById(input.studentId).select("name email phone countryCode username role").lean(),
    input.batchId ? Batch.findById(input.batchId).select("name").lean() : null,
  ]);
  if (!student) return { sent: 0 };
  const recipients = importantContactWhatsAppRecipientsByKeys(["primary", "saptarshi", "dhritabrata", "sayan_bose", "sayandeb"]);
  const courseName = input.courseName || "Not set";
  const batchName = input.batchName || batch?.name || "Not set";
  await sendWhatsAppAutomationTemplates(recipients.map((recipient) => ({
    user: recipient,
    templateName: "demo_converted_staff_alert",
    bodyParameters: [
      recipient.name || "Team",
      student.name || "Student",
      courseName,
      batchName,
    ],
    metadata: {
      kind: "demo_converted_staff_alert",
      event: "DEMO_CONVERTED",
      recipientType: recipient.role || "staff",
      bookingId: input.bookingId || "",
      studentId: input.studentId,
      href: "/admin/demo-center",
      notificationDedupKey: `demo_converted:${input.studentId}:${input.bookingId || "no_booking"}`,
    },
  })));
  await sendStaffEmails(recipients, `Demo converted: ${student.name || "Student"}`, (recipient) => [
    `Hello ${recipient.name || "Team"},`,
    "",
    `${student.name || "Student"} has been converted from demo to enrolled student.`,
    `Course: ${courseName}.`,
    `Batch: ${batchName}.`,
    "",
    "Please review the student setup in the academy portal.",
  ].join("\n"), {
    kind: "demo_converted_staff_alert",
    event: "DEMO_CONVERTED",
    bookingId: input.bookingId || "",
    studentId: input.studentId,
    href: DEMO_MANAGEMENT_HREF,
  });
  return { sent: recipients.length };
}
