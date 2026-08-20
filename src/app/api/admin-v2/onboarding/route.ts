import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { sendWelcomeEmail } from "@/lib/welcomeEmail";
import { Booking } from "@/models/Booking";
import { Classroom } from "@/models/Classroom";
import { Notification } from "@/models/Fee";
import { CoachApplication } from "@/models/Onboarding";
import { User, generateUsername } from "@/models/User";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  return (session?.user as any)?.role === "admin" ? session : null;
}

function tempPassword() {
  return `ENVCoach${Math.floor(100000 + Math.random() * 900000)}`;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await dbConnect();
  const [bookings, applications, demoStudents, coaches] = await Promise.all([
    Booking.find({ bookingType: "demo" }).populate("student instructor", "name email countryCode phone username accountStatus").sort({ createdAt: -1 }).limit(100).lean(),
    CoachApplication.find({}).sort({ createdAt: -1 }).limit(100).lean(),
    User.find({ role: "student", accountStatus: "demo" }, { passwordHash: 0 }).sort({ createdAt: -1 }).limit(100).lean(),
    User.find({ role: "instructor", isActive: true }, { name: 1, email: 1 }).sort({ name: 1 }).lean(),
  ]);
  return NextResponse.json({ bookings, applications, demoStudents, coaches });
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session.user as any).id;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  await dbConnect();

  if (action === "update_demo") {
    const bookingId = String(body.bookingId || "");
    const coach = String(body.coach || "");
    const startAt = new Date(String(body.startAt || ""));
    const durationMinutes = Math.max(15, Number(body.durationMinutes || 60));
    if (!bookingId || !coach || Number.isNaN(startAt.getTime())) return NextResponse.json({ error: "Missing demo details." }, { status: 400 });
    await Booking.findByIdAndUpdate(bookingId, {
      instructor: coach,
      startAt,
      endAt: new Date(startAt.getTime() + durationMinutes * 60000),
      approvalStatus: "pending_admin",
      status: "pending",
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "approve_demo") {
    const booking: any = await Booking.findById(String(body.bookingId || "")).populate("student instructor");
    if (!booking) return NextResponse.json({ error: "Demo booking not found." }, { status: 404 });
    const start = new Date(body.startAt || booking.startAt);
    const durationMinutes = Math.max(15, Number(body.durationMinutes || Math.round((new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime()) / 60000) || 60));
    const coachId = String(body.coach || booking.instructor?._id || booking.instructor || "");
    if (!coachId || Number.isNaN(start.getTime())) return NextResponse.json({ error: "Coach and start time are required." }, { status: 400 });
    const classroom = await Classroom.create({
      title: `Demo Class - ${booking.student?.name || booking.student?.studentName || "Student"}`,
      description: booking.notes || "Approved demo class.",
      classroomType: "single",
      status: "scheduled",
      level: "beginner",
      levelName: booking.level || "Demo",
      topicName: "Demo assessment class",
      meetingProvider: "meet",
      coach: coachId,
      instructor: coachId,
      students: [booking.student?._id || booking.student],
      classDate: start,
      startTime: start.toTimeString().slice(0, 5),
      durationMinutes,
      isActive: true,
    });
    await Booking.findByIdAndUpdate(booking._id, {
      instructor: coachId,
      startAt: start,
      endAt: new Date(start.getTime() + durationMinutes * 60000),
      status: "confirmed",
      approvalStatus: "approved",
      classroom: classroom._id,
    });
    const admins = await User.find({ role: "admin", isActive: true }).select("_id").lean();
    await Notification.insertMany([
      { user: booking.student?._id || booking.student, type: "demo.approved", title: "Demo class approved", message: `Your demo class is scheduled for ${start.toLocaleString("en-IN")}.`, metadata: { booking: booking._id, classroom: classroom._id } },
      { user: coachId, type: "demo.approved", title: "Demo class assigned", message: `A demo class is scheduled for ${start.toLocaleString("en-IN")}.`, metadata: { booking: booking._id, classroom: classroom._id } },
      ...admins.map((admin: any) => ({ user: admin._id, type: "demo.approved", title: "Demo class approved", message: "Demo classroom has been created.", metadata: { booking: booking._id, classroom: classroom._id } })),
    ]);
    await Promise.all([
      booking.student?.email && sendAutomationEmail({ to: booking.student.email, subject: "Your demo class is approved", message: `Your demo class is scheduled for ${start.toLocaleString("en-IN")}. Please join from your academy dashboard.` }),
      booking.instructor?.email && sendAutomationEmail({ to: booking.instructor.email, subject: "Demo class assigned", message: `A demo class with ${booking.student?.name || "a student"} is scheduled for ${start.toLocaleString("en-IN")}.` }),
    ]);
    return NextResponse.json({ ok: true, classroom: classroom._id.toString() });
  }

  if (action === "reject_demo") {
    await Booking.findByIdAndUpdate(String(body.bookingId || ""), { status: "cancelled", approvalStatus: "rejected" });
    return NextResponse.json({ ok: true });
  }

  if (action === "approve_coach") {
    const application: any = await CoachApplication.findById(String(body.applicationId || "")).lean();
    if (!application) return NextResponse.json({ error: "Coach application not found." }, { status: 404 });
    const exists = await User.findOne({ email: application.email });
    if (exists) {
      await CoachApplication.findByIdAndUpdate(application._id, { status: "approved", convertedUser: exists._id, reviewedBy: actorId, reviewedAt: new Date() });
      return NextResponse.json({ ok: true, existing: true });
    }
    const password = tempPassword();
    const user = await User.create({
      username: await generateUsername(application.name),
      name: application.name,
      email: application.email,
      phone: application.phone,
      countryCode: application.countryCode,
      city: application.city,
      country: application.country,
      passwordHash: await bcrypt.hash(password, 10),
      tempPassword: password,
      role: "instructor",
      accountStatus: "approved",
      isActive: true,
      fideId: application.fideId,
      rating: application.rating || 0,
      notes: application.experience,
    });
    await CoachApplication.findByIdAndUpdate(application._id, { status: "approved", convertedUser: user._id, reviewedBy: actorId, reviewedAt: new Date() });
    await sendWelcomeEmail({ name: user.name, email: user.email, username: user.username, role: "instructor", temporaryPassword: password });
    return NextResponse.json({ ok: true, username: user.username, tempPassword: password });
  }

  if (action === "reject_coach") {
    await CoachApplication.findByIdAndUpdate(String(body.applicationId || ""), { status: "rejected", reviewedBy: actorId, reviewedAt: new Date() });
    return NextResponse.json({ ok: true });
  }

  if (action === "convert_demo_student") {
    await User.findByIdAndUpdate(String(body.studentId || ""), { accountStatus: "enrolled", $pull: { tags: "demo" } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

