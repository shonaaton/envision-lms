import { academyDateKey, formatAcademyDateTime } from "@/lib/academyTime";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { getSessionEnd } from "@/lib/classroomSessions";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { messageFamily, whatsappRecipientName } from "@/lib/familyMessaging";
import { sendWhatsAppAutomationTemplate } from "@/lib/whatsappAutomationEvents";
import { Attendance } from "@/models/Attendance";
import { Classroom } from "@/models/Classroom";
import { AcademySettings, Notification } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * Attendance notifications for families and coaches.
 *
 * Marking a student absent used to tell nobody. A warning only went out once a
 * repeat no-show threshold tripped, by which point a parent had been unaware
 * for weeks — and coaches were only nudged to mark attendance when an admin
 * pressed the button by hand.
 */

/** Statuses that mean the student was not in the class. */
const ABSENT_STATUSES = new Set(["absent", "not_joined", "student_no_show"]);

/** How long after a class ends an unmarked register nudges the coach. */
const ATTENDANCE_NUDGE_AFTER_MINUTES = 60;

/** How long the nudge keeps chasing before giving up on that class. */
const ATTENDANCE_NUDGE_WINDOW_HOURS = 48;

const SWEEP_LIMIT = 200;

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

/* ------------------------------------------------------------------ */
/* Same-day absence                                                    */
/* ------------------------------------------------------------------ */

/**
 * Tells a family, on the day, that their child missed a class.
 *
 * Called for every non-attending record when a register is marked. Deliberately
 * separate from the repeat-no-show warning: this one carries no consequence and
 * no credit language, it just closes the information gap.
 */
export async function notifyAbsenceToFamily(input: {
  studentId: any;
  classroom: any;
  session?: any;
  status: string;
  sessionDate: Date | string;
}) {
  if (!ABSENT_STATUSES.has(String(input.status || ""))) return { sent: 0, skipped: "not_absent" as const };

  const student: any = await User.findOne({ _id: input.studentId, role: "student", isActive: { $ne: false } })
    .select("name username email phone countryCode parentName parentEmail")
    .lean();
  if (!student) return { sent: 0, skipped: "student_unavailable" as const };

  const classroom = input.classroom?.title
    ? input.classroom
    : await Classroom.findById(objectId(input.classroom)).select("title courseName").lean();
  const title = String((classroom as any)?.title || (classroom as any)?.courseName || "class").trim() || "class";
  const when = formatAcademyDateTime(new Date(input.sessionDate), { hour: undefined, minute: undefined });
  const topic = String(input.session?.topicName || "").trim();
  const studentName = String(student.name || student.username || "there");

  const metadata = {
    kind: "attendance_absence_notice",
    classroomId: objectId((classroom as any)?._id || input.classroom),
    sessionId: objectId(input.session?._id),
    studentId: objectId(student._id),
    href: "/attendance",
    dedupKey: `absence:${objectId(input.session?._id) || when}:${objectId(student._id)}`,
  };

  const body = [
    `${studentName} was marked absent from "${title}" on ${when}.`,
    topic ? `Topic covered: ${topic}` : "",
    "",
    "If this is wrong, please tell the coach so the register can be corrected.",
  ].filter((line) => line !== "").join("\n");

  return messageFamily({
    student,
    subject: `Absent today: ${title}`,
    message: `Hello ${studentName},\n\n${body}`,
    parentMessage: `Hello ${student.parentName || "Parent"},\n\n${body}`,
    templateName: "attendance_absence_notice",
    bodyParameters: [whatsappRecipientName(student), studentName, title, when],
    metadata,
  });
}

/* ------------------------------------------------------------------ */
/* Coach attendance nudge                                              */
/* ------------------------------------------------------------------ */

/**
 * Chases coaches whose register is still empty an hour after the class ended.
 *
 * The template and the send have existed since the manual admin button was
 * built; this is the sweep that means nobody has to press it.
 */
export async function processDueAttendanceNudges() {
  await dbConnect();
  const now = new Date();
  const nudgeBefore = new Date(now.getTime() - ATTENDANCE_NUDGE_AFTER_MINUTES * 60_000);
  const giveUpBefore = new Date(now.getTime() - ATTENDANCE_NUDGE_WINDOW_HOURS * 3_600_000);

  const classrooms: any[] = await Classroom.find({
    isActive: { $ne: false },
    isTestClassroom: { $ne: true },
    generatedSessions: {
      $elemMatch: {
        status: { $in: ["scheduled", "ongoing", "in_progress", "completed"] },
        attendanceMarkedAt: { $exists: false },
        scheduledFor: { $gte: giveUpBefore, $lte: nudgeBefore },
      },
    },
  })
    .select("title courseName coach instructor generatedSessions")
    .limit(SWEEP_LIMIT)
    .lean();

  const appUrl = resolvePublicAppUrl();
  const attendanceUrl = appUrl ? `${appUrl}/attendance` : "";
  let nudged = 0;

  for (const classroom of classrooms) {
    for (const session of classroom.generatedSessions || []) {
      if (session.attendanceMarkedAt) continue;
      if ((session.notifiedKinds || []).includes("attendance_nudge")) continue;
      const end = getSessionEnd(session);
      if (!end || end > nudgeBefore || end < giveUpBefore) continue;

      const alreadyMarked = await Attendance.exists({ classroom: classroom._id, scheduledSessionId: objectId(session._id) });
      if (alreadyMarked) continue;

      // Claim before sending, exactly as the class reminders do.
      const claimed = await Classroom.findOneAndUpdate(
        {
          _id: classroom._id,
          generatedSessions: { $elemMatch: { _id: session._id, notifiedKinds: { $ne: "attendance_nudge" } } },
        },
        { $addToSet: { "generatedSessions.$.notifiedKinds": "attendance_nudge" } },
        { new: true, projection: { _id: 1 } },
      ).lean();
      if (!claimed) continue;

      const coachId = objectId(session.substituteCoach || classroom.coach || classroom.instructor);
      if (!coachId) continue;
      const coach: any = await User.findById(coachId).select("name username email phone countryCode").lean();
      if (!coach) continue;

      const classTitle = String(classroom.title || classroom.courseName || "Class session");
      const coachName = String(coach.name || coach.username || "Coach");
      const scheduleText = formatAcademyDateTime(session.scheduledFor);
      const metadata = { kind: "attendance_reminder", classroomId: objectId(classroom._id), sessionId: objectId(session._id), href: "/attendance" };

      await Notification.create({
        user: coachId,
        type: "attendance.reminder",
        title: "Attendance reminder",
        message: `Please mark attendance for ${classTitle}.`,
        metadata: { classroom: objectId(classroom._id), sessionId: objectId(session._id), href: "/attendance" },
      }).catch(() => null);

      if (coach.email) {
        await sendAutomationEmail({
          to: String(coach.email),
          subject: `Attendance pending: ${classTitle}`,
          message: [
            `Hello ${coachName},`,
            "",
            `Attendance is still pending for ${classTitle}.`,
            `Schedule: ${scheduleText}`,
            "",
            attendanceUrl ? `Please mark it here: ${attendanceUrl}` : "Please sign in to the academy dashboard and mark attendance.",
          ].join("\n"),
          metadata,
        }).catch(() => null);
      }
      await sendWhatsAppAutomationTemplate({
        user: coach,
        templateName: "attendance_pending_coach",
        bodyParameters: [coachName, classTitle, scheduleText],
        metadata,
      }).catch(() => null);
      nudged += 1;
    }
  }

  return { classrooms: classrooms.length, nudged };
}

/* ------------------------------------------------------------------ */
/* Monthly summary                                                     */
/* ------------------------------------------------------------------ */

function previousMonthRange(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { start, end };
}

/**
 * Emails each family last month's attendance record.
 *
 * Email only: it is a table of counts, which reads badly in a WhatsApp
 * template and is worth keeping in an inbox.
 */
export async function sendMonthlyAttendanceSummaries(now = new Date(), options?: { force?: boolean }) {
  await dbConnect();
  const { start, end } = previousMonthRange(now);
  const monthLabel = formatAcademyDateTime(start, { day: undefined, hour: undefined, minute: undefined });
  const monthKey = academyDateKey(start).slice(0, 7);

  // Claim the month before sending anything. The job is swept hourly so that a
  // restart cannot make it miss the window, which means the claim is the only
  // thing standing between a family and twelve copies of the same summary.
  if (!options?.force) {
    // Settings are created lazily elsewhere; make sure the singleton the claim
    // writes to exists without pulling in the whole fees module for it.
    if (!(await AcademySettings.exists({}))) await AcademySettings.create({}).catch(() => null);
    const claimed = await AcademySettings.findOneAndUpdate(
      { lastMonthlyAttendanceSummaryMonth: { $ne: monthKey } },
      { $set: { lastMonthlyAttendanceSummaryMonth: monthKey } },
      { new: true, projection: { _id: 1 } },
    ).lean();
    if (!claimed) return { students: 0, sent: 0, skipped: "already_sent_this_month" as const };
  }

  const rows: any[] = await Attendance.aggregate([
    { $match: { sessionDate: { $gte: start, $lt: end } } },
    { $unwind: "$records" },
    {
      $group: {
        _id: "$records.student",
        present: { $sum: { $cond: [{ $in: ["$records.status", ["present", "late"]] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $in: ["$records.status", ["absent", "not_joined", "student_no_show"]] }, 1, 0] } },
        total: { $sum: 1 },
      },
    },
  ]);
  if (!rows.length) return { students: 0, sent: 0, skipped: null };

  const students: any[] = await User.find({
    _id: { $in: rows.map((row) => row._id).filter(Boolean) },
    role: "student",
    isActive: { $ne: false },
  })
    .select("name username email parentName parentEmail")
    .lean();
  const byId = new Map(students.map((student) => [objectId(student._id), student]));

  let sent = 0;
  for (const row of rows) {
    const student = byId.get(objectId(row._id));
    if (!student) continue;
    const attended = Number(row.present || 0);
    const total = Number(row.total || 0);
    if (!total) continue;
    const percentage = Math.round((attended / total) * 100);
    const studentName = String(student.name || student.username || "there");
    const body = [
      `Here is ${studentName}'s attendance for ${monthLabel}.`,
      "",
      `Classes held: ${total}`,
      `Attended: ${attended}`,
      `Missed: ${Number(row.absent || 0)}`,
      `Attendance: ${percentage}%`,
      "",
      percentage >= 90
        ? "Excellent consistency — it shows in the progress."
        : percentage >= 75
          ? "Good attendance. Regular practice between classes will help further."
          : "Attendance has slipped this month. Please speak to us if the class timing needs changing.",
    ].join("\n");

    const result = await messageFamily({
      student,
      subject: `Attendance summary for ${monthLabel}: ${studentName}`,
      message: `Hello ${studentName},\n\n${body}`,
      parentMessage: `Hello ${student.parentName || "Parent"},\n\n${body}`,
      metadata: {
        kind: "attendance_monthly_summary",
        studentId: objectId(student._id),
        month: academyDateKey(start).slice(0, 7),
        href: "/attendance",
      },
    });
    if (result.emailsSent) sent += 1;
  }

  return { students: rows.length, sent, skipped: null };
}
