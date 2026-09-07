import { ACADEMY_TIME_ZONE, formatAcademyDateTime } from "@/lib/academyTime";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { getSessionStart } from "@/lib/classroomSessions";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { importantContactWhatsAppRecipientsByKeys, importantContactsByRole } from "@/lib/importantContacts";
import { requestGoogleReview } from "@/lib/reviewRequests";
import { resolveAudienceEmails } from "@/lib/studentContact";
import { sendWhatsAppAutomationTemplate, sendWhatsAppAutomationTemplates, whatsappRecipientName } from "@/lib/whatsappAutomationEvents";
import { Classroom } from "@/models/Classroom";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * Class lifecycle notifications.
 *
 * Demo classes have had reminders for a long time; the paid classes families
 * are billed for had none. This covers the four moments that matter:
 *
 *   - the class is about to start (T-30 and T-10)
 *   - the coach has not joined and somebody needs to intervene
 *   - a class was cancelled on the day it was due to run
 *   - the course finished
 *
 * The first two are swept by the scheduler every minute. The last two are
 * event-driven and are called from the classroom route that performs the
 * change.
 *
 * Sends are claimed before they go out, by marking the kind on the session
 * subdocument, so a second app instance sweeping the same minute cannot
 * re-send. A crash between claim and send drops that one reminder rather than
 * looping on it — the right way round for a message that reaches a parent.
 */

/** Reminder offsets before a class starts, in minutes. */
const START_REMINDER_OFFSETS = [30, 10] as const;

/**
 * How long after the scheduled start an unjoined class raises a staff alert.
 * Deliberately shorter than COACH_NO_SHOW_GRACE_MINUTES (20) in
 * `classroomLifecycle.ts`: that constant decides when a class is *recorded* as
 * a coach no-show, whereas this one is an early warning while somebody can
 * still get a coach into the room.
 */
const COACH_JOIN_ALERT_MINUTES = 5;

/** How far past the alert point a session is still worth alerting on. */
const COACH_ALERT_WINDOW_MINUTES = 30;

/** Cap on sessions handled per sweep, so one pass cannot run unbounded. */
const SWEEP_LIMIT = 200;

const TIME_ZONE_LABEL = ACADEMY_TIME_ZONE === "Asia/Kolkata" ? "IST" : ACADEMY_TIME_ZONE;

type SessionNotificationKind = "starting_t30" | "starting_t10" | "coach_missing" | "cancelled_same_day";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function startReminderKind(minutes: number): SessionNotificationKind {
  return minutes === 30 ? "starting_t30" : "starting_t10";
}

/**
 * Which reminder a class is due for right now, or null for none.
 *
 * Picks the *smallest* offset the class is still inside, so a class added nine
 * minutes before it starts sends the "10 minutes" notice rather than claiming
 * it starts in thirty. A sweep that runs late still sends — being inside the
 * window is what counts, not landing exactly on it — and because the remaining
 * minutes only fall, each offset can be reached at most once.
 */
export function dueStartReminderOffset(minutesUntilStart: number) {
  if (minutesUntilStart <= 0) return null;
  const candidates = START_REMINDER_OFFSETS.filter((offset) => minutesUntilStart <= offset);
  if (!candidates.length) return null;
  return Math.min(...candidates);
}

function sessionTimeLabel(start: Date) {
  return `${formatAcademyDateTime(start)} (${TIME_ZONE_LABEL})`;
}

function classroomLabel(classroom: any) {
  return String(classroom?.title || classroom?.courseName || "your class").trim() || "your class";
}

/**
 * Claims one notification kind for one session. Returns false when another
 * sweep already claimed it, which is the signal to skip rather than send.
 */
async function claimSessionNotification(classroomId: string, sessionId: string, kind: SessionNotificationKind) {
  const claimed = await Classroom.findOneAndUpdate(
    {
      _id: classroomId,
      generatedSessions: { $elemMatch: { _id: sessionId, notifiedKinds: { $ne: kind } } },
    },
    { $addToSet: { "generatedSessions.$.notifiedKinds": kind } },
    { new: true, projection: { _id: 1 } },
  ).lean();
  return Boolean(claimed);
}

async function classroomRecipients(classroom: any, session: any) {
  // A session can carry its own roster (a split or make-up class); otherwise
  // everyone on the classroom is expected.
  const studentIds = (session?.students?.length ? session.students : classroom?.students || []).map(objectId).filter(Boolean);
  const coachId = objectId(session?.substituteCoach || classroom?.coach || classroom?.instructor);
  const [students, coach] = await Promise.all([
    studentIds.length
      ? User.find({ _id: { $in: studentIds }, role: "student", isActive: { $ne: false }, isPaused: { $ne: true } })
          .select("name username email phone countryCode parentName parentEmail")
          .lean()
      : [],
    coachId ? User.findById(coachId).select("name username email phone countryCode").lean() : null,
  ]);
  return { students: students as any[], coach: coach as any };
}

function joinUrl(classroom: any, session: any) {
  const appUrl = resolvePublicAppUrl();
  const meetingUrl = String(session?.meetingUrl || classroom?.meetingUrl || "").trim();
  if (meetingUrl) return meetingUrl;
  return appUrl ? `${appUrl}/classrooms/${objectId(classroom?._id)}` : "";
}

/* ------------------------------------------------------------------ */
/* Class starting soon                                                 */
/* ------------------------------------------------------------------ */

async function sendStartingSoonReminder(classroom: any, session: any, start: Date, minutes: number) {
  const { students, coach } = await classroomRecipients(classroom, session);
  if (!students.length && !coach) return { sent: 0 };

  const title = classroomLabel(classroom);
  const timeLabel = sessionTimeLabel(start);
  const topic = String(session?.topicName || "").trim();
  const url = joinUrl(classroom, session);
  const href = `/classrooms/${objectId(classroom._id)}`;
  const metadata = {
    kind: "class_starting_soon",
    classroomId: objectId(classroom._id),
    sessionId: objectId(session._id),
    minutesBefore: minutes,
    href,
  };

  const studentSends = students.map((student) => {
    const name = String(student.name || student.username || "there");
    const message = [
      `Hello ${name},`,
      "",
      `Your class "${title}" starts in ${minutes} minutes, at ${timeLabel}.`,
      topic ? `Topic: ${topic}` : "",
      "",
      url ? `Join here: ${url}` : "Please sign in to your academy dashboard to join.",
    ].filter((line) => line !== "").join("\n");
    return { student, name, message };
  });

  await Promise.all(
    studentSends.map(({ student, message }) =>
      Promise.all(
        resolveAudienceEmails(
          student.email ? { to: String(student.email), subject: `Class starting in ${minutes} minutes: ${title}`, message, metadata } : null,
          student.parentEmail
            ? {
                to: String(student.parentEmail),
                subject: `Class starting in ${minutes} minutes: ${title}`,
                message,
                metadata: { ...metadata, recipientType: "parent" },
              }
            : null,
        ).map((send) => sendAutomationEmail(send).catch(() => null)),
      ),
    ),
  );

  await sendWhatsAppAutomationTemplates(
    studentSends.map(({ student, name }) => ({
      user: student,
      templateName: "class_starting_soon_student",
      bodyParameters: [name, title, String(minutes), timeLabel],
      // The dedup key keeps T-30 and T-10 distinct while collapsing a student
      // and parent copy of the same one onto the shared number.
      metadata: { ...metadata, studentId: objectId(student._id), dedupKey: `class_start:${objectId(session._id)}:${minutes}` },
    })),
  );

  if (coach?.phone || coach?.email) {
    const coachName = String(coach.name || coach.username || "Coach");
    const coachMessage = [
      `Hello ${coachName},`,
      "",
      `Your class "${title}" starts in ${minutes} minutes, at ${timeLabel}.`,
      `Students expected: ${students.length}.`,
      topic ? `Topic: ${topic}` : "",
      "",
      url ? `Join here: ${url}` : "Please sign in to your academy dashboard to start the class.",
    ].filter((line) => line !== "").join("\n");
    if (coach.email) {
      await sendAutomationEmail({
        to: String(coach.email),
        subject: `Your class starts in ${minutes} minutes: ${title}`,
        message: coachMessage,
        metadata: { ...metadata, recipientType: "coach" },
      }).catch(() => null);
    }
    await sendWhatsAppAutomationTemplate({
      user: coach,
      templateName: "class_starting_soon_coach",
      bodyParameters: [coachName, title, String(minutes), timeLabel],
      metadata: { ...metadata, recipientType: "coach", dedupKey: `class_start_coach:${objectId(session._id)}:${minutes}` },
    }).catch(() => null);
  }

  return { sent: students.length + (coach ? 1 : 0) };
}

/* ------------------------------------------------------------------ */
/* Coach has not joined                                                */
/* ------------------------------------------------------------------ */

async function sendCoachMissingAlert(classroom: any, session: any, start: Date) {
  const { coach } = await classroomRecipients(classroom, session);
  const title = classroomLabel(classroom);
  const coachName = coach ? String(coach.name || coach.username || "the assigned coach") : "No coach assigned";
  const timeLabel = sessionTimeLabel(start);
  const minutesLate = Math.max(1, Math.round((Date.now() - start.getTime()) / 60000));
  const href = `/classrooms/${objectId(classroom._id)}`;
  const metadata = {
    kind: "class_coach_missing",
    classroomId: objectId(classroom._id),
    sessionId: objectId(session._id),
    coachId: objectId(coach?._id),
    href,
  };

  const staff = importantContactsByRole("admin").concat(importantContactsByRole("sub-admin"));
  const staffKeys = Array.from(new Set(staff.map((contact) => contact.key).filter(Boolean)));
  const message = [
    `${title} was due to start at ${timeLabel} and no coach has joined yet.`,
    `Assigned coach: ${coachName}.`,
    `Running ${minutesLate} minute${minutesLate === 1 ? "" : "s"} late.`,
    "",
    "Please check in with the coach or arrange a substitute.",
  ].join("\n");

  await Promise.all(
    Array.from(new Set(staff.map((contact) => contact.email).filter(Boolean))).map((email) =>
      sendAutomationEmail({
        to: String(email),
        subject: `Coach has not joined: ${title}`,
        message,
        metadata,
      }).catch(() => null),
    ),
  );

  if (staffKeys.length) {
    await sendWhatsAppAutomationTemplates(
      importantContactWhatsAppRecipientsByKeys(staffKeys).map((recipient) => ({
        user: recipient,
        templateName: "class_coach_missing_admin_alert",
        bodyParameters: [recipient.name || "Admin", title, coachName, timeLabel],
        metadata: { ...metadata, dedupKey: `coach_missing:${objectId(session._id)}` },
      })),
    );
  }

  // Also surface it in the portal for whoever opens it next.
  const adminUsers = await User.find({ role: { $in: ["admin", "sub-admin"] }, isActive: { $ne: false } }).select("_id").lean();
  if (adminUsers.length) {
    await Notification.insertMany(
      adminUsers.map((admin: any) => ({
        user: admin._id,
        type: "class.coach_missing",
        title: "Coach has not joined a class",
        message: `${title} started at ${timeLabel} and ${coachName} has not joined.`,
        metadata: { classroom: objectId(classroom._id), session: objectId(session._id), href },
      })),
      { ordered: false },
    ).catch(() => null);
  }

  return { alerted: staff.length };
}

/* ------------------------------------------------------------------ */
/* The sweep                                                           */
/* ------------------------------------------------------------------ */

/**
 * One pass over the classes due to start soon, or already started without a
 * coach. Safe to run concurrently with itself and with platform cron: every
 * send is claimed first.
 */
export async function processDueClassSessionReminders() {
  await dbConnect();
  const now = new Date();
  const horizon = new Date(now.getTime() + (Math.max(...START_REMINDER_OFFSETS) + 1) * 60_000);
  const lookBehind = new Date(now.getTime() - (COACH_ALERT_WINDOW_MINUTES + 1) * 60_000);

  const classrooms: any[] = await Classroom.find({
    isActive: { $ne: false },
    isPaused: { $ne: true },
    isTestClassroom: { $ne: true },
    status: { $nin: ["completed", "cancelled"] },
    generatedSessions: {
      $elemMatch: {
        status: { $in: ["scheduled", "ongoing", "in_progress"] },
        scheduledFor: { $gte: lookBehind, $lte: horizon },
      },
    },
  })
    .select("title courseName meetingUrl coach instructor students generatedSessions")
    .limit(SWEEP_LIMIT)
    .lean();

  let startReminders = 0;
  let coachAlerts = 0;

  for (const classroom of classrooms) {
    for (const session of classroom.generatedSessions || []) {
      if (!["scheduled", "ongoing", "in_progress"].includes(String(session.status || ""))) continue;
      const start = getSessionStart(session);
      if (!start) continue;
      const minutesUntilStart = (start.getTime() - now.getTime()) / 60_000;

      const offset = dueStartReminderOffset(minutesUntilStart);
      if (offset !== null) {
        const kind = startReminderKind(offset);
        if (
          !(session.notifiedKinds || []).includes(kind) &&
          (await claimSessionNotification(objectId(classroom._id), objectId(session._id), kind))
        ) {
          await sendStartingSoonReminder(classroom, session, start, offset);
          startReminders += 1;
        }
      }

      const minutesSinceStart = -minutesUntilStart;
      if (
        minutesSinceStart >= COACH_JOIN_ALERT_MINUTES &&
        minutesSinceStart <= COACH_ALERT_WINDOW_MINUTES &&
        !session.actualStartedAt &&
        !(session.notifiedKinds || []).includes("coach_missing")
      ) {
        if (await claimSessionNotification(objectId(classroom._id), objectId(session._id), "coach_missing")) {
          await sendCoachMissingAlert(classroom, session, start);
          coachAlerts += 1;
        }
      }
    }
  }

  return { classrooms: classrooms.length, startReminders, coachAlerts };
}

/* ------------------------------------------------------------------ */
/* Event-driven: cancellation and course completion                    */
/* ------------------------------------------------------------------ */

/**
 * Tells the families when a class is called off on the day it was due to run.
 * A cancellation further out reaches them through the existing schedule-change
 * notice, so this deliberately only fires for same-day.
 */
export async function notifySessionCancelled(classroomInput: any, sessionInput: any) {
  const classroom = classroomInput?.students ? classroomInput : await Classroom.findById(objectId(classroomInput)).lean();
  if (!classroom) return { sent: 0, skipped: "classroom_not_found" as const };

  const session = sessionInput?.scheduledFor
    ? sessionInput
    : (classroom as any).generatedSessions?.find((item: any) => objectId(item._id) === objectId(sessionInput));
  const start = session ? getSessionStart(session) : null;
  if (!start) return { sent: 0, skipped: "no_session_start" as const };

  const now = new Date();
  const isSameDay = formatAcademyDateTime(start, { hour: undefined, minute: undefined })
    === formatAcademyDateTime(now, { hour: undefined, minute: undefined });
  if (!isSameDay || start.getTime() < now.getTime()) return { sent: 0, skipped: "not_same_day" as const };

  if (!(await claimSessionNotification(objectId((classroom as any)._id), objectId(session._id), "cancelled_same_day"))) {
    return { sent: 0, skipped: "already_notified" as const };
  }

  const { students, coach } = await classroomRecipients(classroom, session);
  const title = classroomLabel(classroom);
  const timeLabel = sessionTimeLabel(start);
  const href = `/classrooms/${objectId((classroom as any)._id)}`;
  const metadata = {
    kind: "class_cancelled_same_day",
    classroomId: objectId((classroom as any)._id),
    sessionId: objectId(session._id),
    href,
  };

  await Promise.all(
    students.map((student) => {
      const name = String(student.name || student.username || "there");
      const message = [
        `Hello ${name},`,
        "",
        `Today's class "${title}", scheduled for ${timeLabel}, has been cancelled.`,
        "",
        "No class credit will be used for it, and the next class goes ahead as scheduled.",
        "We are sorry for the short notice.",
      ].join("\n");
      return Promise.all(
        resolveAudienceEmails(
          student.email ? { to: String(student.email), subject: `Class cancelled today: ${title}`, message, metadata } : null,
          student.parentEmail
            ? { to: String(student.parentEmail), subject: `Class cancelled today: ${title}`, message, metadata: { ...metadata, recipientType: "parent" } }
            : null,
        ).map((send) => sendAutomationEmail(send).catch(() => null)),
      );
    }),
  );

  await sendWhatsAppAutomationTemplates(
    students.map((student) => ({
      user: student,
      templateName: "class_cancelled_student",
      bodyParameters: [whatsappRecipientName(student), title, timeLabel],
      metadata: { ...metadata, studentId: objectId(student._id), dedupKey: `class_cancelled:${objectId(session._id)}` },
    })),
  );

  if (coach?.email) {
    await sendAutomationEmail({
      to: String(coach.email),
      subject: `Class cancelled today: ${title}`,
      message: `Hello ${coach.name || "Coach"},\n\nToday's class "${title}" at ${timeLabel} has been cancelled. The students have been informed.`,
      metadata: { ...metadata, recipientType: "coach" },
    }).catch(() => null);
  }

  return { sent: students.length, skipped: null };
}

/**
 * Sends the end-of-course note once every class in a series is behind us.
 * Email only — it carries a summary worth reading, which a WhatsApp template
 * cannot hold.
 */
export async function notifyCourseCompleted(classroomInput: any) {
  const classroom: any = classroomInput?.generatedSessions
    ? classroomInput
    : await Classroom.findById(objectId(classroomInput)).lean();
  if (!classroom) return { sent: 0 };

  const sessions = classroom.generatedSessions || [];
  const taught = sessions.filter((session: any) => String(session.status || "") === "completed");
  const { students } = await classroomRecipients(classroom, null);
  if (!students.length) return { sent: 0 };

  const title = classroomLabel(classroom);
  const appUrl = resolvePublicAppUrl();
  const href = "/dashboard";
  const metadata = { kind: "course_completed", classroomId: objectId(classroom._id), href };
  const topics = Array.from(
    new Set(taught.map((session: any) => String(session.topicName || "").trim()).filter(Boolean)),
  );

  const sends = students.map((student) => {
    const name = String(student.name || student.username || "there");
    const message = [
      `Hello ${name},`,
      "",
      `"${title}" is now complete. Well played.`,
      "",
      `Classes taught: ${taught.length} of ${sessions.length}.`,
      topics.length ? `Topics covered: ${topics.join(", ")}.` : "",
      "",
      appUrl ? `See the full progress record: ${appUrl}${href}` : "Sign in to your academy dashboard to see the full progress record.",
      "",
      "Speak to your coach about what to enrol in next.",
    ].filter((line) => line !== "").join("\n");
    return { student, message };
  });

  await Promise.all(
    sends.map(({ student, message }) =>
      Promise.all(
        resolveAudienceEmails(
          student.email ? { to: String(student.email), subject: `Course complete: ${title}`, message, metadata } : null,
          student.parentEmail
            ? { to: String(student.parentEmail), subject: `Course complete: ${title}`, message, metadata: { ...metadata, recipientType: "parent" } }
            : null,
        ).map((send) => sendAutomationEmail(send).catch(() => null)),
      ),
    ),
  );

  // Finishing a level is the happier of the two moments the academy asks for a
  // Google review. Each family is asked at most once a year, and never while an
  // invoice is outstanding — requestGoogleReview() enforces both.
  const levelName = String(classroom.levelName || classroom.courseName || "").trim();
  await Promise.all(
    students.map((student) =>
      requestGoogleReview({ student, trigger: "level_complete", context: levelName || title })
        .catch((error) => console.error("Review request failed", error)),
    ),
  );

  return { sent: students.length };
}
