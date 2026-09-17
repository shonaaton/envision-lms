import "server-only";

import { isValidObjectId } from "mongoose";

import { formatAcademyDateTime } from "@/lib/academyTime";
import { recordActivity } from "@/lib/activity";
import { dbConnect } from "@/lib/db";
import { upsertDemoClassroom } from "@/lib/demoClassroom";
import { attributeDemoToLeadOwner, leadOwnersForStudents, notifyLeadOwnerOfDemo } from "@/lib/demoLeadOwner";
import { notifyDemoApproved } from "@/lib/demoWorkflow";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { canAccessFeature } from "@/lib/featureAccess";
import { parseMeetingUrlInput } from "@/lib/meetingUrl";
import { Booking } from "@/models/Booking";
import { Notification } from "@/models/Fee";
import { User } from "@/models/User";

/**
 * Booking and confirming demo classes, shared by the Demo Center and the
 * salesperson's dashboard. Failures come back as messages rather than throws:
 * both callers are plain form actions, where a throw is an error page instead of
 * something the person can act on.
 */

export type DemoScheduleResult = { ok: true; start: Date } | { ok: false; error: string };

type ScheduleInput = {
  coachId: string;
  start: Date;
  durationMinutes: number;
  meetingUrl: string;
  actorId: string;
};

/** The reason this coach cannot take the slot, or "" if they can. */
export async function coachClash(coachId: string, startAt: Date, endAt: Date, ignoredBookingId?: string) {
  const overlapFilter: any = {
    instructor: coachId,
    status: { $in: ["pending", "confirmed"] },
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
  };
  if (ignoredBookingId) overlapFilter._id = { $ne: ignoredBookingId };
  const conflictingBooking: any = await Booking.findOne(overlapFilter).populate("student", "name").lean();
  if (!conflictingBooking) return "";
  return `Coach already has a booking with ${conflictingBooking.student?.name || "another student"} at this time.`;
}

/**
 * Confirm a demo booking: build the classroom, lock in the coach and slot, and
 * tell the family, the coach, the staff and the salesperson.
 */
export async function confirmDemoBooking(input: ScheduleInput & { bookingId: string }): Promise<DemoScheduleResult> {
  const { bookingId, coachId, start, durationMinutes, actorId } = input;
  if (!coachId) return { ok: false, error: "Choose a coach before confirming." };
  if (Number.isNaN(start.getTime())) return { ok: false, error: "Choose a valid date and time." };
  const { url: meetingUrl, error: meetingUrlError } = parseMeetingUrlInput(input.meetingUrl);
  if (meetingUrlError) return { ok: false, error: meetingUrlError };
  await dbConnect();
  const booking: any = await Booking.findById(bookingId).populate("student instructor assignedCoach");
  if (!booking) return { ok: false, error: "That demo request no longer exists." };
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const clash = await coachClash(coachId, start, end, bookingId);
  if (clash) return { ok: false, error: clash };
  const studentId = booking.student?._id || booking.student;
  const classroom: any = await upsertDemoClassroom({
    booking,
    coachId,
    studentId,
    start,
    durationMinutes,
    meetingUrl,
    studentName: booking.student?.name,
    levelName: booking.level || booking.student?.studentLevel,
  });
  if (!classroom) return { ok: false, error: "Could not build the demo classroom for this booking." };
  const updatedBooking: any = await Booking.findByIdAndUpdate(booking._id, {
    instructor: coachId,
    assignedCoach: coachId,
    assignedCoachAt: new Date(),
    assignedCoachBy: actorId,
    startAt: start,
    endAt: end,
    status: "confirmed",
    approvalStatus: "approved",
    demoStatus: "CLASSROOM_CREATED",
    classroom: classroom._id,
    meetingUrl,
    approvedBy: actorId,
    approvedAt: new Date(),
    // An assessment is owed only once the demo has actually been taught, so this
    // is armed by the class-close flow (attendance "Present"), not by scheduling
    // the class. Setting it here put an "Assessment Pending" button on every
    // upcoming demo, and left it standing on demos the student never attended -
    // the admin was asked to write up a class that never happened.
    feedbackStatus: "not_required",
    needsNewTime: false,
  }, { new: true }).populate("student instructor assignedCoach");
  const admins = await User.find({ role: { $in: ["admin", "sub-admin"] }, isActive: { $ne: false } }).select("_id").lean();
  await Notification.insertMany([
    { user: booking.student?._id || booking.student, type: "demo.approved", title: "Demo class approved", message: `Your demo class is scheduled for ${formatAcademyDateTime(start)}.`, metadata: { booking: booking._id, classroom: classroom._id, href: "/classrooms", event: "DEMO_CLASSROOM_CREATED" } },
    { user: coachId, type: "demo.approved", title: "Demo class assigned", message: `A demo class is scheduled for ${formatAcademyDateTime(start)}.`, metadata: { booking: booking._id, classroom: classroom._id, href: "/classrooms", event: "DEMO_CLASSROOM_CREATED" } },
    ...admins.map((admin: any) => ({ user: admin._id, type: "demo.approved", title: "Demo class approved", message: "Demo classroom has been created.", metadata: { booking: booking._id, classroom: classroom._id, href: "/admin/demo-center", event: "DEMO_CLASSROOM_CREATED" } })),
  ]);
  await Promise.all([
    updatedBooking.student?.email && sendAutomationEmail({ to: updatedBooking.student.email, subject: "Your demo class is approved", message: `Your demo class is scheduled for ${formatAcademyDateTime(start)}. Please join from your academy dashboard.` }),
    updatedBooking.instructor?.email && sendAutomationEmail({ to: updatedBooking.instructor.email, subject: "Demo class assigned", message: `A demo class with ${updatedBooking.student?.name || "a student"} is scheduled for ${formatAcademyDateTime(start)}.` }),
  ]);
  await notifyDemoApproved({ booking: updatedBooking, student: updatedBooking.student, coach: updatedBooking.instructor, classroom }).catch(() => undefined);
  await notifyLeadOwnerOfDemo({ bookingId: booking._id.toString(), event: "confirmed", coachName: updatedBooking.instructor?.name }).catch((error) => console.error("Demo lead owner confirmation notice failed", error));
  await recordActivity({ actor: actorId, targetUser: String(booking.student?._id || booking.student || ""), type: "demo.booking.approved", label: "Approved demo and created classroom", entityType: "Booking", entityId: booking._id.toString(), metadata: { classroom: classroom._id.toString(), coach: coachId, event: "DEMO_CLASSROOM_CREATED" } });
  return { ok: true, start };
}

/**
 * Book and confirm a demo for a demo account that never sent a request - the
 * family was reached by phone or through the CRM, so there is no parent-chosen
 * time to review. The booking is created as a request and then confirmed through
 * `confirmDemoBooking`, so the classroom, notifications and salesperson routing
 * match an approved parent request exactly.
 */
export async function bookDemoForAccount(input: ScheduleInput & { studentId: string }): Promise<DemoScheduleResult> {
  const { studentId, coachId, start, durationMinutes, actorId } = input;
  if (!coachId) return { ok: false, error: "Choose a coach before booking the demo." };
  if (Number.isNaN(start.getTime())) return { ok: false, error: "Choose a valid date and time." };
  if (!isValidObjectId(studentId)) return { ok: false, error: "That demo account no longer exists." };
  // Checked before the request is created, so a mistyped link does not leave a half-booked demo behind.
  const meetingUrlError = parseMeetingUrlInput(input.meetingUrl).error;
  if (meetingUrlError) return { ok: false, error: meetingUrlError };
  await dbConnect();
  const student: any = await User.findOne({ _id: studentId, role: "student" }).select("name accountStatus parentName city country studentLevel").lean();
  if (!student || student.accountStatus !== "demo") return { ok: false, error: "This account is no longer a demo account." };
  const openDemo = await Booking.exists({ student: studentId, bookingType: "demo", archivedAt: null, status: { $in: ["pending", "confirmed"] } });
  if (openDemo) return { ok: false, error: `${student.name || "This student"} already has an open demo. Assign it from its card in the Demo Center.` };
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const clash = await coachClash(coachId, start, end);
  if (clash) return { ok: false, error: clash };

  const booking: any = await Booking.create({
    student: studentId,
    startAt: start,
    endAt: end,
    status: "pending",
    approvalStatus: "pending_admin",
    bookingType: "demo",
    demoStatus: "REQUESTED",
    requestedByDemo: false,
    requestedTimezone: "Asia/Kolkata",
    requestedLocalDateTime: formatAcademyDateTime(start),
    requestedIstDateTime: formatAcademyDateTime(start),
    requestedAt: new Date(),
    feedbackStatus: "not_required",
    parentName: student.parentName,
    city: student.city,
    country: student.country,
    level: student.studentLevel,
    adminNote: "Booked by the academy team - no request from the family.",
    idempotencyKey: `demo:staff:${studentId}:${start.toISOString()}`,
  });
  await attributeDemoToLeadOwner(String(booking._id)).catch((error) => console.error("Demo lead owner routing failed", error));
  await recordActivity({
    actor: actorId,
    targetUser: studentId,
    type: "demo.booking.requested",
    label: "Booked a demo for a demo account",
    entityType: "Booking",
    entityId: String(booking._id),
    metadata: { bookingType: "demo", demoStatus: "REQUESTED", source: "staff", event: "DEMO_CLASS_REQUESTED" },
  });

  const confirmed = await confirmDemoBooking({ ...input, bookingId: String(booking._id) });
  if (!confirmed.ok) {
    return { ok: false, error: `${confirmed.error} The demo was saved as a request, so it can still be confirmed from the Demo Center.` };
  }
  return confirmed;
}

/**
 * Who may book a demo for a demo account: demo managers (admins and sub-admins
 * with Demo Center approval) for any lead, and the salesperson the lead is
 * assigned to - by an admin's manual pick or by the CRM - for their own leads.
 */
export async function canScheduleDemoForAccount(user: any, studentId: string) {
  if (!user?.id || !isValidObjectId(studentId)) return false;
  await dbConnect();
  if (["admin", "sub-admin"].includes(String(user.role)) && (await canAccessFeature("demoCenter", user, "approve"))) return true;
  const student: any = await User.findOne({ _id: studentId, role: "student" }).select("name email phone").lean();
  if (!student) return false;
  const owner = (await leadOwnersForStudents([student])).get(String(student._id));
  return owner?.userId === String(user.id);
}
