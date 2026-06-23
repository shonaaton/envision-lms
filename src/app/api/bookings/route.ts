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

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;
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
    const student: any = await User.findById((session.user as any).id).select("name email phone parentName city country studentLevel accountStatus").lean();
    if (!student || (session.user as any).role !== "student") return NextResponse.json({ error: "Only students can book sessions." }, { status: 403 });

    const overlap = await Booking.findOne({
      instructor: body.instructor,
      startAt: { $lt: new Date(body.endAt) },
      endAt: { $gt: new Date(body.startAt) },
      status: { $in: ["pending", "confirmed"] },
    });
    if (overlap) return NextResponse.json({ error: "Slot already booked" }, { status: 409 });

    const av = await Availability.findOne({ instructor: body.instructor }).lean();
    const isDemo = student.accountStatus === "demo" || body.bookingType === "demo";
    const requestedType = isDemo ? "demo" : body.bookingType === "credit_class" ? "credit_class" : "regular";
    let status: "pending" | "confirmed" = "pending";
    let approvalStatus: "pending_admin" | "not_required" = "pending_admin";
    let classroom: any = null;

    if (!isDemo && requestedType === "credit_class") {
      const assignment: any = await FeeAssignment.findOne({ student: student._id, type: "credits" }).lean();
      if (!assignment || Number(assignment.creditBalance || 0) <= 0) {
        return NextResponse.json({ error: "You need an active credit plan with credits available to book a class." }, { status: 400 });
      }
      status = "confirmed";
      approvalStatus = "not_required";
      const start = new Date(body.startAt);
      classroom = await Classroom.create({
        title: `Credit Class - ${student.name}`,
        description: body.notes || "Booked from available coach time.",
        classroomType: "single",
        status: "scheduled",
        level: "beginner",
        levelName: student.studentLevel || "Credit class",
        topicName: "Booked practice class",
        meetingProvider: "meet",
        coach: body.instructor,
        instructor: body.instructor,
        students: [student._id],
        classDate: start,
        startTime: start.toTimeString().slice(0, 5),
        durationMinutes: Math.max(15, Math.round((new Date(body.endAt).getTime() - start.getTime()) / 60000)),
        isActive: true,
      });
    }

    const created = await Booking.create({
      ...body,
      student: (session.user as any).id,
      startAt: new Date(body.startAt),
      endAt: new Date(body.endAt),
      status: isDemo ? "pending" : status || (av && (av as any).feePerSession > 0 ? "pending" : "confirmed"),
      approvalStatus,
      bookingType: requestedType,
      requestedByDemo: isDemo,
      classroom: classroom?._id,
      parentName: student.parentName,
      city: student.city,
      country: student.country,
      level: student.studentLevel,
      notes: body.notes,
    });
    const coach: any = await User.findById(body.instructor).select("name email").lean();
    const admins = await User.find({ role: "admin", isActive: true }).select("_id email name").lean();
    await Notification.insertMany([
      { user: student._id, type: "booking.created", title: isDemo ? "Demo request received" : "Class booked", message: isDemo ? "Your demo request is waiting for academy approval." : "Your class has been booked from available coach time.", metadata: { booking: created._id } },
      ...(coach?._id ? [{ user: coach._id, type: "booking.created", title: isDemo ? "Demo request pending" : "New class booked", message: `${student.name} requested ${isDemo ? "a demo" : "a class"} for ${new Date(body.startAt).toLocaleString("en-IN")}.`, metadata: { booking: created._id } }] : []),
      ...admins.map((admin: any) => ({ user: admin._id, type: "booking.created", title: isDemo ? "Demo booking needs approval" : "Credit class booked", message: `${student.name} booked ${isDemo ? "a demo" : "a credit class"} with ${coach?.name || "coach"}.`, metadata: { booking: created._id } })),
    ]);
    await Promise.all([
      student.email && sendAutomationEmail({ to: student.email, subject: isDemo ? "Demo booking request received" : "Your class is booked", message: `Hello ${student.name},\n\n${isDemo ? "Your demo booking request has been received and is waiting for academy approval." : "Your class has been booked successfully."}\n\nTime: ${new Date(body.startAt).toLocaleString("en-IN")}` }),
      coach?.email && sendAutomationEmail({ to: coach.email, subject: isDemo ? "Demo request pending approval" : "New class booked from your available time", message: `${student.name} requested ${isDemo ? "a demo class" : "a class"}.\n\nTime: ${new Date(body.startAt).toLocaleString("en-IN")}` }),
      ...admins.filter((admin: any) => admin.email).map((admin: any) => sendAutomationEmail({ to: admin.email, subject: isDemo ? "Demo booking needs approval" : "Credit class booked", message: `${student.name} booked ${isDemo ? "a demo" : "a credit class"} with ${coach?.name || "coach"}.\n\nTime: ${new Date(body.startAt).toLocaleString("en-IN")}` })),
    ]);
    await recordActivity({
      actor: (session.user as any).id,
      targetUser: (session.user as any).id,
      type: "booking.created",
      label: "Booked a coaching session",
      entityType: "Booking",
      entityId: created._id.toString(),
      metadata: { instructor: body.instructor, startAt: body.startAt, status: created.status, bookingType: created.bookingType, approvalStatus: created.approvalStatus },
    });
    return NextResponse.json(created);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}
