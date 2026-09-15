import "server-only";

import { resolvePublicAppUrl } from "@/lib/appUrl";
import { ACADEMY_TIME_ZONE, formatAcademyDateTime } from "@/lib/academyTime";
import { getSessionStart } from "@/lib/classroomSessions";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { importantContactsByKeys } from "@/lib/importantContacts";
import { Classroom } from "@/models/Classroom";
import { User } from "@/models/User";

/**
 * Tells the admin when a completed class ended without homework going out.
 *
 * Auto-assignment fails quietly by design - a missing template must never
 * block an attendance save - so without this the only trace is a row in the
 * Recent Automation Events feed, which nobody reads until a parent asks where
 * the homework is.
 *
 * The recipient is resolved from the user directory by email (see
 * `demoNotificationRecipients.ts` for why) and falls back to the primary
 * admin contact when that lookup comes back empty.
 */

const DEFAULT_ALERT_EMAILS = ["sayantanchandra12@gmail.com"];

const STATUS_LABELS: Record<string, string> = {
  missing_template: "No matching homework template",
  ambiguous_template: "More than one template matched",
  skipped_no_batch: "No batch to assign to",
  skipped_no_next_class: "No next class for the deadline",
  error: "Automation error",
};

const NEXT_STEPS: Record<string, string> = {
  missing_template:
    "Create a template for this topic, or move the existing one to this class's course and level. Then assign this class's homework manually.",
  ambiguous_template:
    "Deactivate or re-link the extra templates so only one fits this class. Then assign this class's homework manually.",
  skipped_no_batch: "Add the batch to the class. Then assign this class's homework manually.",
  skipped_no_next_class:
    "Schedule the next class, or change the template's due policy to assign without a deadline. Then assign this class's homework manually.",
  error: "Check the error above. Then assign this class's homework manually.",
};

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

export function homeworkAlertEmails() {
  const configured = String(process.env.HOMEWORK_AUTOMATION_ALERT_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ALERT_EMAILS;
}

async function alertRecipients() {
  const emails = homeworkAlertEmails();
  const users: any[] = await User.find({ email: { $in: emails }, isActive: { $ne: false } }).select("name email").lean();
  const resolved = users.map((user) => ({ name: String(user.name || "").trim(), email: String(user.email || "").trim().toLowerCase() }));
  if (resolved.length) return resolved;
  console.warn("Homework automation alert: no recipient found in the user directory, using the configured contact list.");
  return importantContactsByKeys(["primary"])
    .filter((contact) => contact.email)
    .map((contact) => ({ name: contact.name, email: contact.email }));
}

function sessionLabel(session: any) {
  if (!session) return "";
  const start = getSessionStart(session);
  const timeZoneLabel = ACADEMY_TIME_ZONE === "Asia/Kolkata" ? "IST" : ACADEMY_TIME_ZONE;
  const when = start ? `${formatAcademyDateTime(start)} (${timeZoneLabel})` : "";
  return [session.sessionNumber ? `#${session.sessionNumber}` : "", when].filter(Boolean).join(" - ");
}

export async function notifyHomeworkNotAssigned(input: {
  classroom?: any;
  classroomId: string;
  scheduledSessionId: string;
  status: string;
  reason: string;
  topicName?: string;
}) {
  await dbConnect();
  const classroom: any =
    input.classroom || (await Classroom.findById(input.classroomId).select("title courseName levelName coach instructor generatedSessions topicName").lean());
  const session = (classroom?.generatedSessions || []).find((item: any) => String(item?._id || "") === input.scheduledSessionId) || null;
  const topicName = input.topicName || session?.topicName || classroom?.topicName || "Not set";
  const coachId = objectId(classroom?.coach) || objectId(classroom?.instructor);
  const [recipients, coach] = await Promise.all([
    alertRecipients(),
    coachId ? User.findById(coachId).select("name").lean() : null,
  ]);
  if (!recipients.length) return { sent: 0 };

  const appUrl = resolvePublicAppUrl();
  const templatesUrl = appUrl ? `${appUrl}/admin/homework-templates` : "";
  const classTitle = classroom?.title || input.classroomId;
  const statusLabel = STATUS_LABELS[input.status] || input.status.replace(/_/g, " ");
  const subject = `Homework not assigned: ${classTitle} - ${topicName}`;

  const deliveries = await Promise.all(
    recipients.map((recipient) => {
      const message = [
        `Hello ${recipient.name || "Admin"},`,
        "",
        "A class was completed but its homework was not assigned automatically.",
        "",
        `Class: ${classTitle}`,
        `Course: ${classroom?.courseName || "Not set"} - ${classroom?.levelName || "Not set"}`,
        sessionLabel(session) ? `Session: ${sessionLabel(session)}` : "",
        `Topic: ${topicName}`,
        (coach as any)?.name ? `Coach: ${(coach as any).name}` : "",
        "",
        `Problem: ${statusLabel}`,
        `Details: ${input.reason}`,
        "",
        `What to do: ${NEXT_STEPS[input.status] || NEXT_STEPS.error}`,
        "",
        templatesUrl ? `Review Templates: ${templatesUrl}` : "",
      ]
        .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
        .join("\n");
      return sendAutomationEmail({
        to: recipient.email,
        subject,
        message,
        actionLabel: "Review Templates",
        metadata: {
          kind: "homework_automation_alert",
          reason: input.status,
          classroomId: input.classroomId,
          sessionId: input.scheduledSessionId,
          topicName,
          href: "/admin/homework-templates",
        },
      });
    })
  );
  return { sent: deliveries.filter((delivery) => delivery.ok).length };
}
