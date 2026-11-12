import "server-only";

import { formatAcademyDateTime } from "@/lib/academyTime";
import { contactDisplayPhone } from "@/lib/contactEnquiries";
import { dbConnect } from "@/lib/db";
import { demoLeadCallOutcomeLabel } from "@/lib/demoLeadCalls";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { raiseDemoLeadReminderTask } from "@/lib/tasks/taskTriggers";
import { ContactMessage } from "@/models/ContactMessage";
import { DemoLeadReminder } from "@/models/DemoLeadReminder";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * Fires the call-back reminders salespeople set in the Demo Leads CRM: at the
 * time they chose, each one becomes a high-priority task in their Tasks list, a
 * bell notification and an email. Runs every minute from instrumentation.ts.
 *
 * Each reminder is claimed (scheduled -> sent) before anything is sent, so a
 * second server or an overlapping run never reminds twice; the notification is
 * keyed on the reminder too, and the email only follows a new notification.
 * A reminder more than a day overdue when first seen (the server was down) is
 * still sent, worded as missed, rather than dropped.
 */

const BATCH = 50;

export async function processDueDemoLeadReminders(now = new Date()) {
  await dbConnect();
  let sent = 0;
  for (let i = 0; i < BATCH; i += 1) {
    const reminder: any = await DemoLeadReminder.findOneAndUpdate(
      { status: "scheduled", dueAt: { $lte: now } },
      { $set: { status: "sent", sentAt: now } },
      { sort: { dueAt: 1 }, new: true },
    ).lean();
    if (!reminder) break;
    try {
      if (await deliverReminder(reminder, now)) sent += 1;
    } catch (error) {
      console.error("[demo-lead-reminders] could not send reminder", String(reminder._id), error);
    }
  }
  return { sent };
}

async function deliverReminder(reminder: any, now: Date) {
  const lead: any = await ContactMessage.findById(reminder.lead).select("name phone countryCode email leadLog").lean();
  if (!lead) {
    await DemoLeadReminder.updateOne({ _id: reminder._id }, { $set: { status: "cancelled", cancelledAt: now } });
    return false;
  }
  const person: any = await User.findById(reminder.assignedTo).select("_id name email isActive").lean();

  const task: any = await raiseDemoLeadReminderTask(reminder, lead);
  if (!person || person.isActive === false) return false;

  const name = String(lead.name || reminder.leadName || "the parent");
  const phone = contactDisplayPhone(lead.countryCode, lead.phone);
  const dueLabel = formatAcademyDateTime(reminder.dueAt, { timeZoneName: "short" });
  const late = now.getTime() - new Date(reminder.dueAt).getTime() > 24 * 3600_000;
  const lastCall = [...(lead.leadLog || [])].reverse().find((entry: any) => entry.kind === "call");
  const href = `/sales/leads?lead=${String(lead._id)}`;

  const title = late ? `Missed reminder: call ${name}` : `Reminder: call ${name} now`;
  const lines = [
    late ? `You asked to be reminded to call ${name} at ${dueLabel}. The reminder could not go out on time, so here it is now.` : `You asked to be reminded to call ${name} at ${dueLabel}.`,
    "",
    `Parent: ${name}`,
    `Number: ${phone || "Not recorded"}`,
    ...(reminder.note ? [`Your note: ${reminder.note}`] : []),
    lastCall ? `Last call: ${demoLeadCallOutcomeLabel(lastCall.outcome)}, ${formatAcademyDateTime(lastCall.at, { timeZoneName: "short" })}` : "Last call: none logged yet",
    "",
    "After the call, press Picked up or Missed on the lead and add your remarks. That closes this reminder's task.",
  ];

  const inserted = await Notification.updateOne(
    { user: person._id, "metadata.dedupKey": `demo_lead_reminder:${reminder._id}` },
    {
      $setOnInsert: {
        user: person._id,
        type: "demo_lead_reminder",
        title,
        message: lines.join("\n").slice(0, 1000),
        metadata: { href, dedupKey: `demo_lead_reminder:${reminder._id}`, leadId: String(lead._id), reminderId: String(reminder._id), taskId: task?._id ? String(task._id) : "" },
      },
    },
    { upsert: true },
  );
  if (!inserted.upsertedCount) return false;

  if (person.email) {
    await sendAutomationEmail({
      to: person.email,
      subject: title,
      message: [`Hello ${person.name || "there"},`, "", ...lines].join("\n"),
      actionLabel: "Open the lead",
      metadata: { kind: "demo_lead_reminder", href, dedupKey: `demo_lead_reminder:${reminder._id}`, reminderId: String(reminder._id) },
    }).catch((error) => console.error("[demo-lead-reminders] email failed", String(reminder._id), error));
  }
  return true;
}
