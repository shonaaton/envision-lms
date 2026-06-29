import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Availability, Booking } from "@/models/Booking";
import { bookingSchema } from "@/lib/validation";
import { recordActivity } from "@/lib/activity";
import { Classroom } from "@/models/Classroom";
import { FeeAssignment, Notification } from "@/models/Fee";
import { User } from "@/models/User";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { ACADEMY_TIME_ZONE } from "@/lib/academyTime";
import { isBookingWithinAvailability, type AvailabilitySlot } from "@/lib/bookingAvailability";

export const dynamic = "force-dynamic";

type SessionUser = {
  id: string;
  role: "student" | "instructor" | "admin";
};

type AuthSession = {
  user: SessionUser;
};

type BookingDecision = {
  bookingType: "demo" | "credit_class" | "regular";
  status: "pending" | "confirmed";
  approvalStatus: "not_required" | "pending_admin" | "pending_coach";
};

type BasicUser = {
  _id: { toString(): string };
  name?: string;
  email?: string;
  phone?: string;
  parentName?: string;
  city?: string;
  country?: string;
  studentLevel?: string;
  accountStatus?: string;
  role?: "student" | "instructor" | "admin";
};

type AdminUser = BasicUser & { name?: string; email?: string };

type AvailabilityRecord = {
  feePerSession?: number;
  timezone?: string;
  slots?: AvailabilitySlot[];
};

type CreditAssignment = {
  creditBalance?: number;
};

function sessionUser(session: AuthSession) {
  return session.user;
}

function formatBookingTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: ACADEMY_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function classroomStartTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ACADEMY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

async function notifyBookingUsers({
  booking,
  student,
  coach,
  admins,
  title,
  message,
}: {
  booking: any;
  student: any;
  coach: any;
  admins: any[];
  title: string;
  message: string;
}) {
  const recipients = [
    student?._id ? { user: student._id, email: student.email, name: student.name, href: "/booking" } : null,
    coach?._id ? { user: coach._id, email: coach.email, name: coach.name, href: "/availability" } : null,
    ...admins.map((admin: any) => ({ user: admin._id, email: admin.email, name: admin.name, href: "/admin/demo-bookings" })),
  ].filter(Boolean) as any[];
  await Notification.insertMany(
    recipients.map((recipient) => ({
      user: recipient.user,
      type: "booking.updated",
      title,
      message,
      metadata: { booking: booking._id, href: recipient.href },
    }))
  );
  await Promise.all(
    recipients
      .filter((recipient) => recipient.email)
      .map((recipient) =>
        sendAutomationEmail({
          to: recipient.email,
          subject: title,
          message: `Hello ${recipient.name || ""},\n\n${message}`,
          metadata: { bookingId: booking._id.toString(), href: recipient.href },
        })
      )
  );
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: userId, role } = sessionUser(session as AuthSession);
  await dbConnect();
  const filter = role === "admin" ? {} : { $or: [{ student: userId }, { instructor: userId }] };
  const list = await Booking.find(filter)
    .sort({ startAt: 1 })
    .populate("instructor student", "name email")
    .lean();
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = bookingSchema.parse(await req.json());
    await dbConnect();
    const { id: studentUserId, role } = sessionUser(session as AuthSession);
    const student = await User.findById(studentUserId).select("name email phone parentName city country studentLevel accountStatus").lean<BasicUser | null>();
    if (!student || role !== "student") return NextResponse.json({ error: "Only students can book sessions." }, { status: 403 });
    const instructor = await User.findOne({ _id: body.instructor, role: "instructor", isActive: true }).select("name email").lean<BasicUser | null>();
    if (!instructor) return NextResponse.json({ error: "That coach is no longer available for booking." }, { status: 404 });

    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      return NextResponse.json({ error: "Please choose a valid booking time." }, { status: 400 });
    }

    const overlap = await Booking.findOne({
      instructor: body.instructor,
      startAt: { $lt: endAt },
      endAt: { $gt: startAt },
      status: { $in: ["pending", "confirmed"] },
    });
    if (overlap) return NextResponse.json({ error: "Slot already booked" }, { status: 409 });

    const studentOverlap = await Booking.findOne({
      student: studentUserId,
      startAt: { $lt: endAt },
      endAt: { $gt: startAt },
      status: { $in: ["pending", "confirmed"] },
    });
    if (studentOverlap) return NextResponse.json({ error: "You already have another booking at that time." }, { status: 409 });

    const av = await Availability.findOne({ instructor: body.instructor }).lean<AvailabilityRecord | null>();
    const slotValidation = isBookingWithinAvailability({
      startAt,
      endAt,
      timeZone: String(av?.timezone || ACADEMY_TIME_ZONE),
      slots: Array.isArray(av?.slots) ? (av.slots as AvailabilitySlot[]) : [],
    });
    if (!slotValidation.ok) return NextResponse.json({ error: slotValidation.reason }, { status: 400 });

    const isDemo = student.accountStatus === "demo" || body.bookingType === "demo";
    const requestedType = isDemo ? "demo" : body.bookingType === "credit_class" ? "credit_class" : "regular";
    const decision: BookingDecision = isDemo
      ? { bookingType: "demo", status: "pending", approvalStatus: "pending_admin" }
      : requestedType === "credit_class"
        ? { bookingType: "credit_class", status: "pending", approvalStatus: "pending_coach" }
        : Number(av?.feePerSession || 0) > 0
          ? { bookingType: "regular", status: "pending", approvalStatus: "pending_coach" }
          : { bookingType: "regular", status: "confirmed", approvalStatus: "not_required" };

    if (decision.bookingType === "credit_class") {
      const assignment = await FeeAssignment.findOne({ student: student._id, type: "credits" }).lean<CreditAssignment | null>();
      if (!assignment || Number(assignment.creditBalance || 0) <= 0) {
        return NextResponse.json({ error: "You need an active credit plan with credits available to book a class." }, { status: 400 });
      }
    }

    const created = await Booking.create({
      ...body,
      student: studentUserId,
      startAt,
      endAt,
      status: decision.status,
      approvalStatus: decision.approvalStatus,
      bookingType: decision.bookingType,
      requestedByDemo: isDemo,
      parentName: student.parentName,
      city: student.city,
      country: student.country,
      level: student.studentLevel,
      notes: body.notes,
    });
    const coach = instructor;
    const admins = await User.find({ role: "admin", isActive: true }).select("_id email name").lean<AdminUser[]>();
    const adminTitle = isDemo
      ? "Demo booking needs approval"
      : decision.bookingType === "credit_class"
        ? "Credit class request raised"
        : "Booking request created";
    const adminMessage = isDemo
      ? `${student.name} requested a demo with ${coach?.name || "coach"}.`
      : decision.bookingType === "credit_class"
        ? `${student.name} requested a credit class with ${coach?.name || "coach"}.`
        : `${student.name} requested a class with ${coach?.name || "coach"}.`;
    await Notification.insertMany([
      { user: student._id, type: "booking.created", title: isDemo ? "Demo request received" : decision.status === "confirmed" ? "Class booked" : "Class request sent", message: isDemo ? "Your demo request is waiting for academy approval." : decision.status === "confirmed" ? "Your class has been confirmed." : "Your coach will review this class request before a classroom is created.", metadata: { booking: created._id, href: "/booking" } },
      ...(coach?._id ? [{ user: coach._id, type: "booking.created", title: isDemo ? "Demo request pending" : decision.status === "confirmed" ? "Class booked" : "New class request", message: `${student.name} requested ${isDemo ? "a demo" : "a class"} for ${formatBookingTime(startAt)}.`, metadata: { booking: created._id, href: "/availability" } }] : []),
      ...admins.map((admin) => ({ user: admin._id, type: "booking.created", title: adminTitle, message: adminMessage, metadata: { booking: created._id, href: "/admin/demo-bookings" } })),
    ]);
    await Promise.all([
      student.email && sendAutomationEmail({ to: student.email, subject: isDemo ? "Demo booking request received" : decision.status === "confirmed" ? "Class booked" : "Class request sent", message: `Hello ${student.name},\n\n${isDemo ? "Your demo booking request has been received and is waiting for academy approval." : decision.status === "confirmed" ? "Your class has been confirmed." : "Your class request has been sent to the coach for approval."}\n\nTime: ${formatBookingTime(startAt)}` }),
      coach?.email && sendAutomationEmail({ to: coach.email, subject: isDemo ? "Demo request pending approval" : decision.status === "confirmed" ? "Class booked" : "New class request awaiting your response", message: `${student.name} requested ${isDemo ? "a demo class" : "a class"}.\n\nTime: ${formatBookingTime(startAt)}` }),
      ...admins.filter((admin) => admin.email).map((admin) => sendAutomationEmail({ to: String(admin.email), subject: adminTitle, message: `${adminMessage}\n\nTime: ${formatBookingTime(startAt)}` })),
    ]);
    await recordActivity({
      actor: studentUserId,
      targetUser: studentUserId,
      type: "booking.created",
      label: "Booked a coaching session",
      entityType: "Booking",
      entityId: created._id.toString(),
      metadata: { instructor: body.instructor, startAt: startAt.toISOString(), status: created.status, bookingType: created.bookingType, approvalStatus: created.approvalStatus },
    });
    return NextResponse.json(created);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Bad request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await dbConnect();
  const { id: actorId, role } = sessionUser(session as AuthSession);
  const body = await req.json();
  const booking = await Booking.findById(body.bookingId).populate("student instructor", "name email studentLevel");
  if (!booking) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  const isAssignedCoach = booking.instructor?._id?.toString() === actorId;
  if (role !== "admin" && !isAssignedCoach) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (booking.status !== "pending") return NextResponse.json({ error: "This request has already been handled." }, { status: 409 });

  const admins = await User.find({ role: "admin", isActive: true }).select("_id email name").lean<AdminUser[]>();
  const student = booking.student;
  const coach = booking.instructor;
  const action = String(body.action || "");

  if (action === "approve") {
    if (booking.bookingType === "credit_class") {
      const assignment = await FeeAssignment.findOne({ student: student._id, type: "credits" }).lean<CreditAssignment | null>();
      if (!assignment || Number(assignment.creditBalance || 0) <= 0) {
        return NextResponse.json({ error: "The student no longer has available class credits." }, { status: 400 });
      }
    }
    const start = new Date(booking.proposedStartAt || booking.startAt);
    const end = new Date(booking.proposedEndAt || booking.endAt);
    const classroom = await Classroom.create({
      title: `${booking.bookingType === "demo" ? "Demo" : "Credit Class"} - ${student.name}`,
      description: booking.notes || "Approved from coach availability.",
      classroomType: "single",
      status: "scheduled",
      level: "beginner",
      levelName: booking.level || student.studentLevel || "Class request",
      topicName: booking.bookingType === "demo" ? "Demo class" : "Booked practice class",
      meetingProvider: "meet",
      coach: coach._id,
      instructor: coach._id,
      students: [student._id],
      classDate: start,
      startTime: classroomStartTime(start),
      durationMinutes: Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)),
      isActive: true,
    });
    booking.status = "confirmed";
    booking.approvalStatus = "coach_approved";
    booking.classroom = classroom._id;
    booking.startAt = start;
    booking.endAt = end;
    booking.coachNote = String(body.note || "");
    await booking.save();
    await notifyBookingUsers({
      booking,
      student,
      coach,
      admins,
      title: "Class request approved",
      message: `${coach.name} approved ${student.name}'s class for ${formatBookingTime(booking.startAt)}. The classroom is now scheduled.`,
    });
  } else if (action === "cancel") {
    booking.status = "cancelled";
    booking.approvalStatus = "coach_cancelled";
    booking.coachNote = String(body.note || "");
    await booking.save();
    await notifyBookingUsers({
      booking,
      student,
      coach,
      admins,
      title: "Class request cancelled",
      message: `${coach.name} could not accept the class requested for ${formatBookingTime(booking.startAt)}.`,
    });
  } else if (action === "suggest_time") {
    const proposedStart = new Date(body.proposedStartAt);
    const proposedEnd = new Date(body.proposedEndAt);
    if (Number.isNaN(proposedStart.getTime()) || Number.isNaN(proposedEnd.getTime()) || proposedEnd <= proposedStart) {
      return NextResponse.json({ error: "Please provide a valid suggested start and end time." }, { status: 400 });
    }
    booking.approvalStatus = "reschedule_proposed";
    booking.proposedStartAt = proposedStart;
    booking.proposedEndAt = proposedEnd;
    booking.coachNote = String(body.note || "");
    await booking.save();
    await notifyBookingUsers({
      booking,
      student,
      coach,
      admins,
      title: "Coach suggested a new class time",
      message: `${coach.name} suggested ${formatBookingTime(proposedStart)} for ${student.name}'s class request.`,
    });
  } else {
    return NextResponse.json({ error: "Unknown request action." }, { status: 400 });
  }

  return NextResponse.json(booking);
}
