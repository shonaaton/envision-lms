import { Types } from "mongoose";
import { ACADEMY_TIME_ZONE, formatAcademyDateTime, zonedDateTime } from "@/lib/academyTime";
import { recordActivity } from "@/lib/activity";
import { sendWhatsAppTextMessage } from "@/lib/whatsappAutomation";
import { sendWhatsAppAutomationTemplates } from "@/lib/whatsappAutomationEvents";
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
  await sendWhatsAppAutomationTemplates([
    {
      user: input.student,
      templateName: "demo_class_approved_student",
      bodyParameters: [input.student?.name || "there", input.booking.requestedIstDateTime || formatAcademyDateTime(input.booking.startAt, { timeZoneName: "short" })],
      metadata: { kind: "demo_class_approved", event: "DEMO_APPROVED", bookingId: input.booking._id.toString(), classroomId: input.classroom._id.toString() },
    },
    {
      user: input.coach,
      templateName: "demo_class_assigned_coach",
      bodyParameters: [input.coach?.name || "Coach", input.student?.name || "student", input.booking.requestedIstDateTime || formatAcademyDateTime(input.booking.startAt, { timeZoneName: "short" })],
      metadata: { kind: "demo_class_assigned", event: "DEMO_COACH_ASSIGNED", bookingId: input.booking._id.toString(), classroomId: input.classroom._id.toString() },
    },
  ]);
}
