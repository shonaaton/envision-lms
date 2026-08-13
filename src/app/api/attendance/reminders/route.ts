import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { academyDateKey, formatAcademyDateTime } from "@/lib/academyTime";
import { deriveScheduledSessionStatus } from "@/lib/classroomSessions";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { canAccessFeature } from "@/lib/featureAccess";
import { recordActivity } from "@/lib/activity";
import { Classroom } from "@/models/Classroom";
import { Attendance } from "@/models/Attendance";
import { Notification } from "@/models/Fee";

export const dynamic = "force-dynamic";

function objectId(value: any) {
  return value?._id?.toString?.() ?? value?.toString?.() ?? "";
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function singleSessionFor(classroom: any) {
  if (!classroom?.classDate) return null;
  return {
    _id: `${classroom._id}-single`,
    sessionNumber: 1,
    topicName: classroom.topicName || classroom.title,
    scheduledFor: classroom.classDate,
    startTime: classroom.startTime,
    durationMinutes: classroom.durationMinutes || 60,
    status: classroom.status || "scheduled",
  };
}

function coachForSession(classroom: any, scheduledSession: any) {
  return scheduledSession?.substituteCoach || classroom.coach || classroom.instructor || null;
}

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as "student" | "instructor" | "admin" | "sub-admin" | undefined;
  if (!session || !role || !["admin", "sub-admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await canAccessFeature("attendance", session.user as any, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const classroomId = String(body?.classroomId || "");
  const sessionId = String(body?.sessionId || "");
  if (!classroomId || !sessionId) return NextResponse.json({ error: "Missing session details" }, { status: 400 });

  await dbConnect();
  const classroom: any = await Classroom.findById(classroomId)
    .populate("coach instructor", "name username email")
    .populate("generatedSessions.substituteCoach", "name username email")
    .lean();
  if (!classroom) return NextResponse.json({ error: "Classroom not found" }, { status: 404 });

  const generated = Array.isArray(classroom.generatedSessions) ? classroom.generatedSessions : [];
  const scheduledSession = generated.find((item: any) => String(item?._id || "") === sessionId) || singleSessionFor(classroom);
  if (!scheduledSession || String(scheduledSession._id || "") !== sessionId) {
    return NextResponse.json({ error: "Scheduled class not found" }, { status: 404 });
  }

  const scheduledFor = new Date(scheduledSession.scheduledFor || classroom.classDate || body?.sessionDate);
  if (Number.isNaN(scheduledFor.getTime())) return NextResponse.json({ error: "Invalid session date" }, { status: 400 });
  if (body?.sessionDate && academyDateKey(scheduledFor) !== academyDateKey(body.sessionDate)) {
    return NextResponse.json({ error: "Session date does not match" }, { status: 400 });
  }

  const lifecycle = deriveScheduledSessionStatus(scheduledSession, new Date());
  if (!["completed", "missed"].includes(lifecycle)) {
    return NextResponse.json({ error: "Attendance reminder can only be sent for completed or missed sessions" }, { status: 400 });
  }

  const existingAttendance = await Attendance.exists({ classroom: classroomId, scheduledSessionId: sessionId });
  if (existingAttendance) {
    return NextResponse.json({ error: "Attendance is already marked for this session" }, { status: 409 });
  }

  const coach = coachForSession(classroom, scheduledSession);
  const coachId = objectId(coach);
  if (!coachId) return NextResponse.json({ error: "No coach is assigned to this session" }, { status: 400 });

  const href = `/attendance`;
  const appUrl = resolvePublicAppUrl(req);
  const attendanceUrl = appUrl ? `${appUrl}${href}` : "";
  const coachName = coach?.name || coach?.username || "Coach";
  const classTitle = classroom.title || "Class Session";
  const topicName = scheduledSession.topicName || classroom.topicName || classTitle;
  const scheduleText = formatAcademyDateTime(scheduledFor);
  const message = [
    `Hello ${coachName},`,
    "",
    `Attendance is still pending for ${classTitle}.`,
    `Topic: ${topicName}`,
    `Schedule: ${scheduleText}`,
    "",
    attendanceUrl ? `Please mark it here: ${attendanceUrl}` : "Please sign in to the academy dashboard and mark attendance.",
  ].join("\n");

  await Notification.create({
    user: coachId,
    type: "attendance.reminder",
    title: "Attendance reminder",
    message: `Please mark attendance for ${classTitle} - ${topicName}.`,
    metadata: { classroom: classroomId, sessionId, href },
  });

  const emailResult = coach?.email
    ? await sendAutomationEmail({
        to: String(coach.email),
        subject: `Attendance pending: ${classTitle}`,
        message,
        htmlBody: `<p>Hello ${escapeHtml(coachName)},</p>
          <p>Attendance is still pending for <strong>${escapeHtml(classTitle)}</strong>.</p>
          <p><strong>Topic:</strong> ${escapeHtml(topicName)}<br /><strong>Schedule:</strong> ${escapeHtml(scheduleText)}</p>
          ${attendanceUrl ? `<p><a href="${escapeHtml(attendanceUrl)}">Mark attendance</a></p>` : "<p>Please sign in to the academy dashboard and mark attendance.</p>"}`,
        metadata: { kind: "attendance_reminder", classroomId, sessionId, href },
      })
    : { delivered: false, skipped: true };

  await recordActivity({
    actor: (session.user as any).id,
    type: "attendance.reminder",
    label: `Sent attendance reminder to ${coachName}`,
    entityType: "Classroom",
    entityId: classroomId,
    metadata: { classroomId, sessionId, coachId, emailDelivered: Boolean((emailResult as any).delivered) },
  });

  return NextResponse.json({
    ok: true,
    notified: true,
    emailDelivered: Boolean((emailResult as any).delivered),
    emailSkipped: Boolean((emailResult as any).skipped),
  });
}
