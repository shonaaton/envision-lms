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
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CalendarCheck, CheckCircle2, UserPlus, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

function tempPassword() {
  return `ENVCoach${Math.floor(100000 + Math.random() * 900000)}`;
}

function contactNumber(record: { countryCode?: string; phone?: string }) {
  const phone = record.phone?.trim();
  if (!phone) return "No phone";
  return [record.countryCode, phone].map((part) => part?.trim()).filter(Boolean).join(" ");
}

async function approveBooking(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  const booking: any = await Booking.findById(String(formData.get("booking"))).populate("student instructor").lean();
  if (!booking) return;
  const start = new Date(booking.startAt);
  const end = new Date(booking.endAt);
  const classroom = await Classroom.create({
    title: `Demo Class - ${booking.student?.name || booking.student?.studentName || "Student"}`,
    description: booking.notes || "Approved demo class.",
    classroomType: "single",
    status: "scheduled",
    level: "beginner",
    levelName: booking.level || "Demo",
    topicName: "Demo assessment class",
    meetingProvider: "meet",
    coach: booking.instructor?._id || booking.instructor,
    instructor: booking.instructor?._id || booking.instructor,
    students: [booking.student?._id || booking.student],
    classDate: start,
    startTime: start.toTimeString().slice(0, 5),
    durationMinutes: Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)),
    isActive: true,
  });
  await Booking.findByIdAndUpdate(booking._id, {
    status: "confirmed",
    approvalStatus: "approved",
    classroom: classroom._id,
  });
  const admins = await User.find({ role: "admin", isActive: true }).select("_id").lean();
  await Notification.insertMany([
    { user: booking.student?._id || booking.student, type: "demo.approved", title: "Demo class approved", message: `Your demo class is scheduled for ${start.toLocaleString("en-IN")}.`, metadata: { booking: booking._id, classroom: classroom._id } },
    { user: booking.instructor?._id || booking.instructor, type: "demo.approved", title: "Demo class assigned", message: `A demo class is scheduled for ${start.toLocaleString("en-IN")}.`, metadata: { booking: booking._id, classroom: classroom._id } },
    ...admins.map((admin: any) => ({ user: admin._id, type: "demo.approved", title: "Demo class approved", message: "Demo classroom has been created.", metadata: { booking: booking._id, classroom: classroom._id } })),
  ]);
  await Promise.all([
    booking.student?.email && sendAutomationEmail({ to: booking.student.email, subject: "Your demo class is approved", message: `Your demo class is scheduled for ${start.toLocaleString("en-IN")}. Please join from your academy dashboard.` }),
    booking.instructor?.email && sendAutomationEmail({ to: booking.instructor.email, subject: "Demo class assigned", message: `A demo class with ${booking.student?.name || "a student"} is scheduled for ${start.toLocaleString("en-IN")}.` }),
  ]);
  revalidatePath("/admin/onboarding");
  revalidatePath("/classrooms");
}

async function updateBookingRequest(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  const bookingId = String(formData.get("booking"));
  const coach = String(formData.get("coach") || "");
  const startRaw = String(formData.get("startAt") || "");
  const duration = Math.max(15, Number(formData.get("durationMinutes") || 60));
  const startAt = new Date(startRaw);
  if (!bookingId || !coach || Number.isNaN(startAt.getTime())) return;
  const endAt = new Date(startAt.getTime() + duration * 60000);
  await Booking.findByIdAndUpdate(bookingId, {
    instructor: coach,
    startAt,
    endAt,
    approvalStatus: "pending_admin",
    status: "pending",
  });
  revalidatePath("/admin/onboarding");
}

async function rejectBooking(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  await Booking.findByIdAndUpdate(String(formData.get("booking")), { status: "cancelled", approvalStatus: "rejected" });
  revalidatePath("/admin/onboarding");
}

async function approveCoachApplication(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  const reviewerId = (session!.user as any).id;
  await dbConnect();
  const application: any = await CoachApplication.findById(String(formData.get("application"))).lean();
  if (!application) return;
  const exists = await User.findOne({ email: application.email });
  if (exists) {
    await CoachApplication.findByIdAndUpdate(application._id, { status: "approved", convertedUser: exists._id, reviewedBy: reviewerId, reviewedAt: new Date() });
    revalidatePath("/admin/onboarding");
    return;
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
  await CoachApplication.findByIdAndUpdate(application._id, { status: "approved", convertedUser: user._id, reviewedBy: reviewerId, reviewedAt: new Date() });
  await sendWelcomeEmail({
    name: user.name,
    email: user.email,
    username: user.username,
    role: "instructor",
    temporaryPassword: password,
  });
  revalidatePath("/admin/onboarding");
  revalidatePath("/admin/users");
}

async function rejectCoachApplication(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  const reviewerId = (session!.user as any).id;
  await dbConnect();
  await CoachApplication.findByIdAndUpdate(String(formData.get("application")), { status: "rejected", reviewedBy: reviewerId, reviewedAt: new Date() });
  revalidatePath("/admin/onboarding");
}

async function convertDemoStudent(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  await dbConnect();
  await User.findByIdAndUpdate(String(formData.get("student")), {
    accountStatus: "enrolled",
    $pull: { tags: "demo" },
  });
  revalidatePath("/admin/onboarding");
  revalidatePath("/admin/users");
}

export default async function AdminOnboardingPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/dashboard");
  await dbConnect();
  const [bookings, applications, demoStudents, coaches] = await Promise.all([
    Booking.find({ bookingType: "demo" }).populate("student instructor", "name email countryCode phone username accountStatus").sort({ createdAt: -1 }).limit(100).lean(),
    CoachApplication.find({}).sort({ createdAt: -1 }).limit(100).lean(),
    User.find({ role: "student", accountStatus: "demo" }, { passwordHash: 0 }).sort({ createdAt: -1 }).limit(100).lean(),
    User.find({ role: "instructor", isActive: true }, { name: 1, email: 1 }).sort({ name: 1 }).lean(),
  ]);

  return (
    <div className="space-y-5 p-2 text-slate-950">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
          <UserPlus size={14} /> Onboarding
        </div>
        <h1 className="mt-2 text-3xl font-black text-brand">Demo Bookings & Coach Applications</h1>
        <p className="mt-1 text-sm text-slate-600">Approve demo classrooms, review coach applications, and convert demo students after enrollment.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-xl font-black"><CalendarCheck size={20} className="text-brand" /> Demo Bookings</h2>
        <div className="mt-4 grid gap-3">
          {bookings.map((booking: any) => (
            <div key={booking._id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-black">{booking.student?.name || "Demo student"} with {booking.instructor?.name || "Coach"}</div>
                  <div className="mt-1 text-sm text-slate-500">{new Date(booking.startAt).toLocaleString("en-IN")} · {booking.approvalStatus}</div>
                  <div className="mt-1 text-xs text-slate-500">{booking.notes || "No note added"}</div>
                  {booking.approvalStatus === "pending_admin" && (
                    <form action={updateBookingRequest} className="mt-3 grid gap-2 md:grid-cols-[220px_220px_120px_auto]">
                      <input type="hidden" name="booking" value={booking._id.toString()} />
                      <select name="coach" defaultValue={booking.instructor?._id?.toString() || ""} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                        {coaches.map((coach: any) => <option key={coach._id} value={coach._id.toString()}>{coach.name}</option>)}
                      </select>
                      <input name="startAt" type="datetime-local" defaultValue={new Date(booking.startAt).toISOString().slice(0, 16)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" />
                      <input name="durationMinutes" type="number" min={15} defaultValue={Math.max(15, Math.round((new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime()) / 60000))} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" />
                      <button className="rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-brand">Update</button>
                    </form>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {booking.approvalStatus === "pending_admin" && (
                    <>
                      <form action={approveBooking}><input type="hidden" name="booking" value={booking._id.toString()} /><button className="btn-primary"><CheckCircle2 size={15} /> Approve</button></form>
                      <form action={rejectBooking}><input type="hidden" name="booking" value={booking._id.toString()} /><button className="btn-outline border-rose-200 text-rose-700"><XCircle size={15} /> Reject</button></form>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {bookings.length === 0 && <Empty text="No demo bookings yet." />}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">Coach Applications</h2>
        <div className="mt-4 grid gap-3">
          {applications.map((application: any) => (
            <div key={application._id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-black">{application.name}</div>
                  <div className="mt-1 text-sm text-slate-500">{application.email} · {contactNumber(application)} · {application.status}</div>
                  <div className="mt-2 max-w-3xl text-sm text-slate-700">{application.experience || "No experience note added."}</div>
                </div>
                {application.status === "pending" || application.status === "shortlisted" ? (
                  <div className="flex flex-wrap gap-2">
                    <form action={approveCoachApplication}><input type="hidden" name="application" value={application._id.toString()} /><button className="btn-primary"><CheckCircle2 size={15} /> Approve Coach</button></form>
                    <form action={rejectCoachApplication}><input type="hidden" name="application" value={application._id.toString()} /><button className="btn-outline border-rose-200 text-rose-700"><XCircle size={15} /> Reject</button></form>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {applications.length === 0 && <Empty text="No coach applications yet." />}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">Demo Students</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {demoStudents.map((student: any) => (
            <div key={student._id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="font-black">{student.name}</div>
              <div className="mt-1 text-sm text-slate-500">{student.email} · {student.username}</div>
              <div className="mt-1 text-sm text-slate-500">{contactNumber(student)}</div>
              <div className="mt-2 text-xs text-slate-500">
                Computer {student.demoUsage?.playComputer || 0}/{student.demoLimits?.playComputer || 0} · Square {student.demoUsage?.squareTrainer || 0}/{student.demoLimits?.squareTrainer || 0} · King Hunt {student.demoUsage?.kingHunt || 0}/{student.demoLimits?.kingHunt || 3}
              </div>
              <form action={convertDemoStudent} className="mt-3">
                <input type="hidden" name="student" value={student._id.toString()} />
                <button className="btn-outline bg-white">Convert to Enrolled Student</button>
              </form>
            </div>
          ))}
          {demoStudents.length === 0 && <Empty text="No demo students yet." />}
        </div>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">{text}</div>;
}
