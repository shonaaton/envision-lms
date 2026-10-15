import "server-only";

import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { messageFamily } from "@/lib/familyMessaging";
import { whatsappParam } from "@/lib/leave/leaveNotifications";
import { sendWhatsAppAutomationTemplate, whatsappRecipientName } from "@/lib/whatsappAutomationEvents";
// Labels come from the plan module, not the service: this file runs from
// instrumentation.ts, and the service reaches modules with Node-only imports.
import { holidayDayLabel, holidayRangeLabel } from "@/lib/holidays/holidayPlan";
import { AcademyHoliday } from "@/models/AcademyHoliday";
import { Announcement } from "@/models/Announcement";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

export const HOLIDAY_NOTICE_TEMPLATE = "academy_holiday_notice";
export const HOLIDAY_CANCELLED_TEMPLATE = "academy_holiday_cancelled";

type Kind = "declared" | "cancelled";

const CHUNK = 10;
/** A send that hasn't reported progress for this long is assumed dead and picked up again. */
const STALE_CLAIM_MS = 10 * 60_000;
const HREF = "/calendar";

/**
 * Everyone the academy is closing on: enrolled students (with their families),
 * coaches, and the staff who run the academy. Demo leads are not students yet
 * and have no classes to lose. Paused students stay in - they come back to the
 * same calendar.
 */
function audienceFilter() {
  return {
    isActive: { $ne: false },
    $or: [
      { role: "student", accountStatus: { $ne: "demo" } },
      { role: "instructor" },
      { role: "admin" },
      { role: "sub-admin", accessRole: null },
    ],
  };
}

function copyFor(holiday: any, kind: Kind) {
  const range = holidayRangeLabel(holiday);
  if (kind === "declared") {
    const title = `Academy holiday: ${range}`;
    const body = [
      holiday.message,
      "",
      `Academy closed: ${range}`,
      `Reason: ${holiday.reason}`,
      "",
      "Classes on these days move to the next scheduled class, and every course continues from the same topic. Your updated schedule is on the calendar in the academy portal.",
    ].join("\n");
    return { title, body };
  }
  return {
    title: `Academy holiday cancelled: ${range}`,
    body: [
      holiday.cancelMessage,
      "",
      `The academy holiday planned for ${range} has been cancelled. Classes go back to their original dates - please check the calendar in the academy portal.`,
    ].join("\n"),
  };
}

function templateFor(holiday: any, kind: Kind, name: string) {
  const start = holidayDayLabel(holiday.startKey);
  const end = holidayDayLabel(holiday.endKey);
  return kind === "declared"
    ? { templateName: HOLIDAY_NOTICE_TEMPLATE, bodyParameters: [name, start, end, holiday.reason, holiday.message].map((value) => whatsappParam(value)) }
    : { templateName: HOLIDAY_CANCELLED_TEMPLATE, bodyParameters: [name, start, end, holiday.cancelMessage].map((value) => whatsappParam(value)) };
}

async function deliverTo(user: any, holiday: any, kind: Kind, announcementId: unknown) {
  const { title, body } = copyFor(holiday, kind);
  const dedupKey = `holiday:${holiday._id}:${kind}:${user._id}`;
  const metadata = { kind: "academy_holiday", event: kind, holidayId: String(holiday._id), href: HREF, dedupKey };

  await Notification.updateOne(
    { user: user._id, "metadata.dedupKey": dedupKey },
    {
      $setOnInsert: {
        user: user._id,
        type: "announcement",
        title,
        message: body,
        metadata: { ...metadata, announcement: announcementId, targetType: "everyone", priority: "high" },
      },
    },
    { upsert: true }
  );

  if (user.role === "student") {
    const { templateName, bodyParameters } = templateFor(holiday, kind, whatsappRecipientName(user));
    await messageFamily({
      student: user,
      subject: title,
      message: [`Hello ${user.name || "there"},`, "", body, "", "Team Envision Chess Academy"].join("\n"),
      parentMessage: [`Hello ${user.parentName || "there"},`, "", body, "", "Team Envision Chess Academy"].join("\n"),
      templateName,
      bodyParameters,
      metadata: { ...metadata, studentId: String(user._id), notificationDedupKey: dedupKey },
    });
    return;
  }

  if (user.role === "instructor") {
    const jobs: Promise<unknown>[] = [];
    if (user.email) {
      jobs.push(sendAutomationEmail({
        to: String(user.email),
        subject: title,
        message: [`Hello ${user.name || "there"},`, "", body, "", "Team Envision Chess Academy"].join("\n"),
        actionLabel: "Open Calendar",
        metadata: { ...metadata, coachId: String(user._id), recipientType: "coach" },
      }));
    }
    const { templateName, bodyParameters } = templateFor(holiday, kind, whatsappRecipientName(user));
    jobs.push(sendWhatsAppAutomationTemplate({
      user,
      templateName,
      bodyParameters,
      metadata: { ...metadata, recipientType: "coach", notificationDedupKey: dedupKey },
    }));
    const results = await Promise.allSettled(jobs);
    if (results.every((result) => result.status === "rejected")) throw new Error("Every channel failed for this coach");
  }
  // Admins and sub-admins get the in-app copy only: they declared it.
}

async function ensureAnnouncement(holiday: any, kind: Kind, field: "announcement" | "cancelAnnouncement") {
  const existing = holiday[field]?.announcement;
  if (existing) return existing;
  const { title, body } = copyFor(holiday, kind);
  const recipientCount = await User.countDocuments(audienceFilter());
  const announcement: any = await Announcement.create({
    title,
    message: body,
    priority: "high",
    targetType: "everyone",
    recipientCount,
    createdBy: kind === "declared" ? holiday.createdBy : holiday.cancelledBy || holiday.createdBy,
    sentAt: new Date(),
  });
  await AcademyHoliday.updateOne({ _id: holiday._id }, { $set: { [`${field}.announcement`]: announcement._id } });
  return announcement._id;
}

async function claim(field: "announcement" | "cancelAnnouncement") {
  const now = new Date();
  return AcademyHoliday.findOneAndUpdate(
    {
      $or: [
        { [`${field}.status`]: "pending" },
        { [`${field}.status`]: "sending", [`${field}.claimedAt`]: { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
      ],
    },
    { $set: { [`${field}.status`]: "sending", [`${field}.claimedAt`]: now } },
    { new: true, sort: { createdAt: 1 } }
  );
}

async function deliver(holiday: any, kind: Kind, field: "announcement" | "cancelAnnouncement") {
  const announcementId = await ensureAnnouncement(holiday, kind, field);
  let cursor = holiday[field]?.cursor || null;
  for (;;) {
    const users: any[] = await User.find({ ...audienceFilter(), ...(cursor ? { _id: { $gt: cursor } } : {}) })
      .select("_id name email role phone countryCode parentName parentEmail")
      .sort({ _id: 1 })
      .limit(CHUNK)
      .lean();
    if (!users.length) break;
    const results = await Promise.allSettled(users.map((user) => deliverTo(user, holiday, kind, announcementId)));
    const failed = results.filter((result) => result.status === "rejected").length;
    results.forEach((result, index) => {
      if (result.status === "rejected") console.error("[holiday] notice failed", { user: String(users[index]._id), error: result.reason });
    });
    cursor = users[users.length - 1]._id;
    await AcademyHoliday.updateOne(
      { _id: holiday._id },
      {
        $set: { [`${field}.cursor`]: cursor, [`${field}.claimedAt`]: new Date() },
        $inc: { [`${field}.sentCount`]: users.length - failed, [`${field}.failedCount`]: failed },
      }
    );
  }
  await AcademyHoliday.updateOne({ _id: holiday._id }, { $set: { [`${field}.status`]: "sent", [`${field}.finishedAt`]: new Date() } });
}

/**
 * Send any holiday announcement (or cancellation) that is waiting. Runs from
 * the scheduler and straight after a holiday is declared or cancelled; the
 * claim makes the two safe to overlap, and the cursor makes a restart resume.
 */
export async function processHolidayAnnouncements() {
  await dbConnect();
  let sent = 0;
  for (const [field, kind] of [["announcement", "declared"], ["cancelAnnouncement", "cancelled"]] as const) {
    for (let guard = 0; guard < 5; guard += 1) {
      const holiday = await claim(field);
      if (!holiday) break;
      try {
        await deliver(holiday, kind, field);
        sent += 1;
      } catch (error) {
        console.error("[holiday] announcement run failed", { holiday: String(holiday._id), error });
        // Leave it claimed; it is retried once the claim goes stale.
      }
    }
  }
  return { sent };
}

export function kickHolidayAnnouncements() {
  void processHolidayAnnouncements().catch((error) => console.error("[holiday] announcement kick failed", error));
}
