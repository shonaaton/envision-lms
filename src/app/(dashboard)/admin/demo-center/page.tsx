import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarCheck, CheckCircle2, Clock3, GraduationCap, History, Link as LinkIcon, MessageSquareText, RotateCcw, UserCheck, X, XCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { formatAcademyDateTime } from "@/lib/academyTime";
import { notifyDemoApproved, notifyDemoConverted } from "@/lib/demoWorkflow";
import { sendAutomationEmail } from "@/lib/emailAutomation";
import { recordActivity } from "@/lib/activity";
import { Booking } from "@/models/Booking";
import { Classroom } from "@/models/Classroom";
import { Notification } from "@/models/Fee";
import { DemoFeedback } from "@/models/Onboarding";
import { User } from "@/models/User";
import { Course } from "@/models/Course";
import { Batch } from "@/models/Batch";

export const dynamic = "force-dynamic";

type DemoTab = "requested" | "upcoming" | "completed" | "missed" | "converted" | "closed" | "assessments";
type DemoManagerSession = Awaited<ReturnType<typeof auth>> & { user: { id?: string; role?: string } };

const tabs: Array<{ id: DemoTab; label: string }> = [
  { id: "requested", label: "Requested" },
  { id: "upcoming", label: "Booked / Upcoming" },
  { id: "completed", label: "Completed" },
  { id: "missed", label: "No Shows/Missed" },
  { id: "converted", label: "Converted" },
  { id: "closed", label: "Closed" },
  { id: "assessments", label: "Assessments" },
];

function contactNumber(record: { countryCode?: string; phone?: string }) {
  const phone = record.phone?.trim();
  if (!phone) return "No phone";
  return [record.countryCode, phone].map((part) => part?.trim()).filter(Boolean).join(" ");
}

function toLocalInput(value?: string | Date) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function demoStatusLabel(booking: any) {
  if (booking.demoStatus === "CLASSROOM_CREATED") return "Demo Scheduled";
  if (booking.demoStatus === "COACH_ASSIGNED") return "Coach Assigned";
  if (booking.demoStatus === "ASSESSMENT_PENDING") return "Assessment Pending";
  if (booking.demoStatus === "COMPLETED") return "Demo Done";
  if (booking.demoStatus === "STUDENT_NO_SHOW") return "Demo No Show";
  if (booking.demoStatus === "ABSENT") return "Demo Missed";
  if (booking.demoStatus === "CONVERTED") return "Converted";
  if (booking.demoStatus === "CLOSED") return "Closed";
  return "Demo Requested";
}

function classifyDemo(booking: any): DemoTab {
  if (booking.demoStatus === "CONVERTED") return "converted";
  if (booking.demoStatus === "CLOSED" || booking.status === "cancelled" || booking.demoStatus === "CANCELLED") return "closed";
  if (booking.demoStatus === "STUDENT_NO_SHOW" || booking.demoStatus === "ABSENT") return "missed";
  if (booking.demoStatus === "ASSESSMENT_PENDING") return "assessments";
  if (booking.feedbackStatus === "submitted" || booking.demoStatus === "COMPLETED") return "completed";
  if (booking.demoStatus === "CLASSROOM_CREATED" || booking.status === "confirmed") return "upcoming";
  return "requested";
}

async function assertCoachAvailable(coachId: string, startAt: Date, endAt: Date, ignoredBookingId?: string) {
  const overlapFilter: any = {
    instructor: coachId,
    status: { $in: ["pending", "confirmed"] },
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
  };
  if (ignoredBookingId) overlapFilter._id = { $ne: ignoredBookingId };
  const conflictingBooking: any = await Booking.findOne(overlapFilter).populate("student", "name").lean();
  if (conflictingBooking) {
    throw new Error(`Coach already has a booking with ${conflictingBooking.student?.name || "another student"} at this time.`);
  }
}

async function requireDemoManager(): Promise<DemoManagerSession> {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!["admin", "sub-admin"].includes(role)) redirect("/dashboard");
  return session as DemoManagerSession;
}

async function updateBookingRequest(formData: FormData) {
  "use server";
  const session = await requireDemoManager();
  await dbConnect();
  const actorId = String((session.user as any).id || "");
  const bookingId = String(formData.get("booking") || "");
  const coach = String(formData.get("coach") || "");
  const startAt = new Date(String(formData.get("startAt") || ""));
  const duration = Math.max(15, Number(formData.get("durationMinutes") || 30));
  const meetingUrl = String(formData.get("meetingUrl") || "").trim();
  if (!bookingId || !coach || Number.isNaN(startAt.getTime())) return;
  const booking: any = await Booking.findById(bookingId);
  if (!booking) return;
  const previousStartAt = booking.startAt;
  const previousEndAt = booking.endAt;
  const endAt = new Date(startAt.getTime() + duration * 60000);
  await assertCoachAvailable(coach, startAt, endAt, bookingId);
  booking.instructor = coach;
  booking.assignedCoach = coach;
  booking.assignedCoachAt = new Date();
  booking.assignedCoachBy = actorId;
  booking.startAt = startAt;
  booking.endAt = endAt;
  booking.meetingUrl = meetingUrl;
  booking.approvalStatus = "pending_admin";
  booking.status = "pending";
  booking.demoStatus = "COACH_ASSIGNED";
  if (previousStartAt && new Date(previousStartAt).getTime() !== startAt.getTime()) {
    booking.rescheduleCount = Number(booking.rescheduleCount || 0) + 1;
    booking.rescheduleHistory = [
      ...(Array.isArray(booking.rescheduleHistory) ? booking.rescheduleHistory : []),
      { fromStartAt: previousStartAt, fromEndAt: previousEndAt, toStartAt: startAt, toEndAt: endAt, reason: "Admin changed demo time", requestedBy: actorId, createdAt: new Date() },
    ];
  }
  await booking.save();
  await recordActivity({ actor: actorId, type: "demo.booking.coach_assigned", label: "Assigned coach to demo request", entityType: "Booking", entityId: bookingId, metadata: { coach, meetingUrl: Boolean(meetingUrl), event: "DEMO_COACH_ASSIGNED" } });
  revalidatePath("/admin/demo-center");
}

async function approveBooking(formData: FormData) {
  "use server";
  const session = await requireDemoManager();
  await dbConnect();
  const actorId = String((session.user as any).id || "");
  const bookingId = String(formData.get("booking") || "");
  const coachId = String(formData.get("coach") || "");
  const start = new Date(String(formData.get("startAt") || ""));
  const durationMinutes = Math.max(15, Number(formData.get("durationMinutes") || 30));
  const meetingUrl = String(formData.get("meetingUrl") || "").trim();
  const booking: any = await Booking.findById(bookingId).populate("student instructor assignedCoach");
  if (!booking || !coachId || Number.isNaN(start.getTime())) return;
  const end = new Date(start.getTime() + durationMinutes * 60000);
  await assertCoachAvailable(coachId, start, end, bookingId);
  let classroom: any = booking.classroom ? await Classroom.findById(booking.classroom) : await Classroom.findOne({ demoBooking: booking._id });
  if (!classroom) {
    classroom = await Classroom.create({
      title: `${booking.student?.name || "Student"} - Demo Class`,
      description: booking.notes || "Approved demo class.",
      classroomType: "demo",
      demoBooking: booking._id,
      status: "scheduled",
      level: "beginner",
      levelName: booking.level || booking.student?.studentLevel || "Demo",
      topicName: "Demo assessment class",
      meetingProvider: "meet",
      meetingUrl,
      coach: coachId,
      instructor: coachId,
      students: [booking.student?._id || booking.student],
      classDate: start,
      startTime: start.toTimeString().slice(0, 5),
      durationMinutes: 30,
      generatedSessions: [{
        sessionNumber: 1,
        topicName: "Demo assessment class",
        topicOrder: 0,
        scheduledFor: start,
        startTime: start.toTimeString().slice(0, 5),
        durationMinutes: 30,
        status: "scheduled",
      }],
      isActive: true,
    });
  } else {
    classroom.classroomType = "demo";
    classroom.coach = coachId;
    classroom.instructor = coachId;
    classroom.classDate = start;
    classroom.startTime = start.toTimeString().slice(0, 5);
    classroom.durationMinutes = 30;
    classroom.meetingUrl = meetingUrl || classroom.meetingUrl;
    await classroom.save();
  }
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
    feedbackStatus: "pending",
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
  await recordActivity({ actor: actorId, targetUser: String(booking.student?._id || booking.student || ""), type: "demo.booking.approved", label: "Approved demo and created classroom", entityType: "Booking", entityId: booking._id.toString(), metadata: { classroom: classroom._id.toString(), coach: coachId, event: "DEMO_CLASSROOM_CREATED" } });
  revalidatePath("/admin/demo-center");
  revalidatePath("/classrooms");
}

async function closeDemo(formData: FormData) {
  "use server";
  const session = await requireDemoManager();
  await dbConnect();
  const actorId = String((session.user as any).id || "");
  const bookingId = String(formData.get("booking") || "");
  const reason = String(formData.get("reason") || "Other").trim();
  await Booking.findByIdAndUpdate(bookingId, { status: "cancelled", approvalStatus: "rejected", demoStatus: "CLOSED", cancellationReason: reason });
  await recordActivity({ actor: actorId, type: "demo.booking.closed", label: "Closed demo lead", entityType: "Booking", entityId: bookingId, metadata: { reason, event: "DEMO_CLOSED" } });
  revalidatePath("/admin/demo-center");
}

async function convertDemoStudent(formData: FormData) {
  "use server";
  const session = await requireDemoManager();
  await dbConnect();
  const actorId = String((session.user as any).id || "");
  const studentId = String(formData.get("student") || "");
  const bookingId = String(formData.get("booking") || "");
  const courseId = String(formData.get("course") || "");
  const batchId = String(formData.get("batch") || "");
  const startingDateText = String(formData.get("startingDate") || "");
  const course: any = courseId ? await Course.findById(courseId).select("name").lean() : null;
  const conversionSetup = {
    recommendedLevel: String(formData.get("recommendedLevel") || "").trim(),
    course: courseId || undefined,
    courseName: course?.name || String(formData.get("courseName") || "").trim(),
    classType: String(formData.get("classType") || "").trim(),
    startingDate: startingDateText ? new Date(startingDateText) : undefined,
    batch: batchId || undefined,
    convertedFromBooking: bookingId || undefined,
    convertedAt: new Date(),
    convertedBy: actorId,
  };
  await User.findByIdAndUpdate(studentId, {
    accountStatus: "enrolled",
    conversionSetup,
    ...(conversionSetup.recommendedLevel ? { studentLevel: conversionSetup.recommendedLevel } : {}),
    ...(batchId ? { $addToSet: { batches: batchId }, $pull: { tags: "demo" } } : { $pull: { tags: "demo" } }),
  });
  if (batchId) {
    await Batch.findByIdAndUpdate(batchId, {
      $addToSet: {
        students: studentId,
        studentEnrollments: { student: studentId, enrolledAt: conversionSetup.startingDate || conversionSetup.convertedAt },
      },
    });
  }
  if (bookingId) await Booking.findByIdAndUpdate(bookingId, { demoStatus: "CONVERTED" });
  const batch: any = batchId ? await Batch.findById(batchId).select("name").lean() : null;
  await notifyDemoConverted({
    studentId,
    bookingId,
    courseName: conversionSetup.courseName,
    batchId,
    batchName: batch?.name,
  }).catch((error) => console.error("Demo conversion WhatsApp failed", error));
  await recordActivity({ actor: actorId, targetUser: studentId, type: "demo.student.converted", label: "Converted demo user to enrolled student", entityType: "User", entityId: studentId, metadata: { booking: bookingId || undefined, course: courseId || undefined, batch: batchId || undefined, classType: conversionSetup.classType || undefined, event: "DEMO_CONVERTED" } });
  revalidatePath("/admin/demo-center");
  revalidatePath("/admin/users");
}

async function extendDemoAccess(formData: FormData) {
  "use server";
  const session = await requireDemoManager();
  await dbConnect();
  const actorId = String((session.user as any).id || "");
  const studentId = String(formData.get("student") || "");
  const student: any = await User.findById(studentId).select("demoExpiresAt accountStatus").lean();
  if (!student || student.accountStatus !== "demo") return;
  const base = student.demoExpiresAt && new Date(student.demoExpiresAt).getTime() > Date.now() ? new Date(student.demoExpiresAt) : new Date();
  const demoExpiresAt = new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000);
  await User.findByIdAndUpdate(studentId, { demoExpiresAt, $inc: { demoExtensionCount: 1 } });
  await recordActivity({ actor: actorId, targetUser: studentId, type: "demo.access.extended", label: "Extended demo access by 7 days", entityType: "User", entityId: studentId, metadata: { demoExpiresAt, event: "DEMO_ACCESS_EXTENDED" } });
  revalidatePath("/admin/demo-center");
}

export default async function DemoCenterPage({ searchParams }: { searchParams?: { tab?: string } }) {
  await requireDemoManager();
  await dbConnect();
  const activeTab = tabs.some((tab) => tab.id === searchParams?.tab) ? searchParams?.tab as DemoTab : "requested";
  const [bookings, demoStudents, coaches, feedback, courses, batches] = await Promise.all([
    Booking.find({ bookingType: "demo" }).populate("student instructor assignedCoach", "name email countryCode phone username accountStatus parentName city country studentLevel demoExpiresAt").sort({ createdAt: -1 }).limit(300).lean(),
    User.find({ role: "student", accountStatus: "demo" }, { passwordHash: 0 }).sort({ createdAt: -1 }).limit(300).lean(),
    User.find({ role: "instructor", isActive: true }, { name: 1, email: 1 }).sort({ name: 1 }).lean(),
    DemoFeedback.find({}).populate("booking demoUser coach classroom", "startAt demoStatus feedbackStatus name email title").sort({ submittedAt: -1, createdAt: -1 }).limit(300).lean(),
    Course.find({ isActive: { $ne: false } }).select("name level").sort({ name: 1 }).lean(),
    Batch.find({ isActive: { $ne: false } }).select("name level").sort({ name: 1 }).lean(),
  ]);
  const visibleBookings = activeTab === "assessments" ? [] : bookings.filter((booking: any) => classifyDemo(booking) === activeTab);
  const counts = Object.fromEntries(tabs.map((tab) => [tab.id, tab.id === "assessments" ? feedback.length : bookings.filter((booking: any) => classifyDemo(booking) === tab.id).length]));
  const feedbackByBooking = new Map(feedback.map((item: any) => [String(item.booking?._id || item.booking), item]));

  return (
    <div className="space-y-5 p-2 text-slate-950">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
          <GraduationCap size={14} /> Demo Management
        </div>
        <h1 className="mt-2 text-3xl font-black text-brand">Demo Center</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">Manage the full demo journey: requested time, coach assignment, demo classroom, assessment, conversion, and closed leads.</p>
      </header>

      <nav className="flex overflow-x-auto rounded-lg bg-slate-100 p-1">
        {tabs.map((tab) => (
          <Link key={tab.id} href={`/admin/demo-center?tab=${tab.id}`} className={`min-w-fit rounded-md px-4 py-2 text-sm font-black ${activeTab === tab.id ? "bg-white text-brand shadow" : "text-slate-600 hover:bg-white/70"}`}>
            {tab.label} <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700">{counts[tab.id]}</span>
          </Link>
        ))}
      </nav>

      {activeTab !== "assessments" ? (
        <section className="grid gap-3">
          {visibleBookings.map((booking: any) => (
            <DemoCard key={booking._id.toString()} booking={booking} coaches={coaches} courses={courses} batches={batches} feedback={feedbackByBooking.get(String(booking._id))} />
          ))}
          {!visibleBookings.length ? <Empty text={`No demos in ${tabs.find((tab) => tab.id === activeTab)?.label || "this tab"}.`} /> : null}
        </section>
      ) : (
        <section className="grid gap-3">
          {feedback.map((item: any) => (
            <article key={item._id.toString()} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-black text-slate-950">{item.demoUser?.name || "Demo student"}</div>
                  <div className="mt-1 text-sm text-slate-500">Coach: {item.coach?.name || "-"} · Recommended: {item.recommendedCourseLevel || "-"}</div>
                  <div className="mt-1 text-xs font-bold uppercase text-slate-400">{item.status === "submitted" ? "Submitted" : "Draft / waiting for coach"}</div>
                  <div className="mt-1 text-sm text-slate-600">Engagement: {item.studentEngagement || "-"} · Format: {item.coachRecommendation || "-"} · Frequency: {item.suggestedClassFrequency || "-"}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{item.parentFacingSummary || item.assessmentNotes || "No parent-facing summary yet."}</p>
                </div>
                <Link href={`/demo-feedback/${item.booking?._id || item.booking}`} className="btn-outline bg-white">Open Assessment</Link>
              </div>
            </article>
          ))}
          {!feedback.length ? <Empty text="No submitted demo assessments yet." /> : null}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-black">Demo Accounts Without Active Request</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {demoStudents
            .filter((student: any) => !bookings.some((booking: any) => String(booking.student?._id || booking.student) === String(student._id) && ["pending", "confirmed"].includes(String(booking.status || ""))))
            .map((student: any) => {
              const extendModalId = `extend-demo-account-${student._id.toString()}`;
              return (
                <div key={student._id.toString()} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="font-black">{student.name}</div>
                  <div className="text-sm text-slate-500">{student.email} · {contactNumber(student)}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">Demo access: {student.demoExpiresAt ? formatAcademyDateTime(student.demoExpiresAt) : "No expiry set"}</div>
                  <div className="mt-2">
                    <PopupTrigger id={extendModalId} className="btn-outline bg-white">
                      <Clock3 size={15} /> Extend Demo Validity
                    </PopupTrigger>
                  </div>
                  <PopupShell id={extendModalId} title="Extend demo account validity" subtitle={`${student.name || "Demo student"} · Current expiry: ${student.demoExpiresAt ? formatAcademyDateTime(student.demoExpiresAt) : "No expiry set"}`}>
                    <form action={extendDemoAccess} className="grid gap-4">
                      <input type="hidden" name="student" value={student._id.toString()} />
                      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
                        This adds 7 more days to the demo account without moving it into enrolled students.
                      </div>
                      <div className="flex justify-end gap-2">
                        <a href="#" className="btn-outline bg-white">Cancel</a>
                        <button className="btn-primary"><Clock3 size={15} /> Extend +7 Days</button>
                      </div>
                    </form>
                  </PopupShell>
                </div>
              );
            })}
        </div>
      </section>
    </div>
  );
}

function DemoCard({ booking, coaches, courses, batches, feedback }: { booking: any; coaches: any[]; courses: any[]; batches: any[]; feedback?: any }) {
  const student = booking.student || {};
  const startAt = toLocalInput(booking.startAt);
  const duration = Math.max(15, Math.round((new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime()) / 60000) || 30);
  const isExpired = student.demoExpiresAt && new Date(student.demoExpiresAt).getTime() < Date.now();
  const cardId = booking._id.toString();
  const assignModalId = `assign-demo-${cardId}`;
  const extendModalId = `extend-demo-${cardId}`;
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black text-slate-950">{student.name || "Demo student"}</h2>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase text-amber-700">{demoStatusLabel(booking)}</span>
            {booking.rescheduleCount ? <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600"><History size={12} className="mr-1 inline" /> {booking.rescheduleCount} changes</span> : null}
          </div>
          <div className="mt-1 text-sm text-slate-500">{student.parentName ? `Parent: ${student.parentName} · ` : ""}{contactNumber(student)} · {student.city || booking.city || "-"} · {booking.requestedTimezone || "Timezone not captured"}</div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <Info label="Requested" value={booking.requestedLocalDateTime || formatAcademyDateTime(booking.startAt)} />
            <Info label="IST" value={booking.requestedIstDateTime || formatAcademyDateTime(booking.startAt)} />
            <Info label="Coach" value={booking.assignedCoach?.name || booking.instructor?.name || "Unassigned"} />
            <Info label="Level" value={booking.level || student.studentLevel || "Not set"} />
          </div>
          <div className={`mt-3 w-fit rounded-full px-3 py-1 text-xs font-bold ${isExpired ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
            Demo access: {student.demoExpiresAt ? formatAcademyDateTime(student.demoExpiresAt) : "No expiry set"}{isExpired ? " (expired)" : ""}
          </div>
          {booking.notes ? (
            <div className="mt-3 rounded-xl border border-brand/10 bg-purple-50/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-brand">
                <MessageSquareText size={15} /> Demo Request Message
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{booking.notes}</p>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No parent message was added with this request.
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <PopupTrigger id={assignModalId} className="btn-primary">
          <CheckCircle2 size={15} /> Assign / Confirm Demo
        </PopupTrigger>
        {booking.classroom ? <Link href={`/classrooms/${booking.classroom}`} className="btn-outline bg-white"><CalendarCheck size={15} /> Open Demo Classroom</Link> : null}
        {booking.feedbackStatus === "pending" && booking.classroom ? <Link href={`/demo-feedback/${booking._id}`} className="btn-outline bg-white"><Clock3 size={15} /> Assessment Pending</Link> : null}
        {booking.feedbackStatus === "submitted" ? (
          <form action={convertDemoStudent} className="grid w-full gap-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 xl:max-w-3xl">
            <div className="text-sm font-black text-emerald-950">Convert {student.name || "demo student"} to Student</div>
            <input type="hidden" name="booking" value={booking._id.toString()} />
            <input type="hidden" name="student" value={String(student._id || booking.student)} />
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              <select name="recommendedLevel" defaultValue={student.studentLevel || "beginner"} className="input bg-white">
                <option value="absolute_beginner">Absolute Beginner</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="federated">Federated</option>
                <option value="not_set">Not set</option>
              </select>
              <select name="course" defaultValue="" className="input bg-white">
                <option value="">Course optional</option>
                {courses.map((course: any) => <option key={course._id.toString()} value={course._id.toString()}>{course.name}</option>)}
              </select>
              <select name="classType" defaultValue={feedback?.coachRecommendation || "group"} className="input bg-white">
                <option value="group">Group</option>
                <option value="individual">Individual</option>
                <option value="either">Either</option>
              </select>
              <input name="startingDate" type="date" className="input bg-white" />
              <select name="batch" defaultValue="" className="input bg-white">
                <option value="">Batch optional</option>
                {batches.map((batch: any) => <option key={batch._id.toString()} value={batch._id.toString()}>{batch.name}</option>)}
              </select>
            </div>
            <button className="btn-primary w-fit"><UserCheck size={15} /> Confirm Conversion</button>
          </form>
        ) : null}
        <PopupTrigger id={extendModalId} className="btn-outline bg-white">
          <Clock3 size={15} /> Extend Demo Validity
        </PopupTrigger>
        <form action={closeDemo} className="flex flex-wrap gap-2">
          <input type="hidden" name="booking" value={booking._id.toString()} />
          <select name="reason" defaultValue="Not interested" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
            <option>Student requested cancellation</option>
            <option>Unable to contact</option>
            <option>Not interested</option>
            <option>Already joined another academy</option>
            <option>Duplicate lead</option>
            <option>Incorrect details</option>
            <option>Other</option>
          </select>
          <button className="btn-outline border-rose-200 bg-white text-rose-700"><XCircle size={15} /> Close Demo</button>
        </form>
      </div>
      <PopupShell id={assignModalId} title="Assign coach and confirm demo" subtitle={`${student.name || "Demo student"} · ${booking.requestedLocalDateTime || formatAcademyDateTime(booking.startAt)}`}>
        <form action={approveBooking} className="grid gap-3">
          <input type="hidden" name="booking" value={cardId} />
          <label className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Coach</span>
            <select name="coach" defaultValue={booking.assignedCoach?._id?.toString() || booking.instructor?._id?.toString() || ""} className="input bg-white" required>
              <option value="">Assign coach</option>
              {coaches.map((coach: any) => <option key={coach._id.toString()} value={coach._id.toString()}>{coach.name}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Final date and time</span>
              <input name="startAt" type="datetime-local" defaultValue={startAt} className="input bg-white" required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Minutes</span>
              <input name="durationMinutes" type="number" min={15} step={15} defaultValue={duration || 30} className="input bg-white" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">Google Meet link</span>
            <span className="relative block">
              <LinkIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input name="meetingUrl" defaultValue={booking.meetingUrl || ""} placeholder="Paste Google Meet link" className="input bg-white pl-9" />
            </span>
          </label>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
            Accept creates the demo classroom. Change Time / Assign Coach keeps it as a pending admin review with the updated details.
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <a href="#" className="btn-outline bg-white">Cancel</a>
            <button formAction={updateBookingRequest} className="btn-outline bg-white"><RotateCcw size={15} /> Change Time / Assign Coach</button>
            <button formAction={approveBooking} className="btn-primary"><CheckCircle2 size={15} /> Accept Requested Time</button>
          </div>
        </form>
      </PopupShell>
      <PopupShell id={extendModalId} title="Extend demo account validity" subtitle={`${student.name || "Demo student"} · Current expiry: ${student.demoExpiresAt ? formatAcademyDateTime(student.demoExpiresAt) : "No expiry set"}`}>
        <form action={extendDemoAccess} className="grid gap-4">
          <input type="hidden" name="student" value={String(student._id || booking.student)} />
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
            This adds 7 more days to the demo account. The account stays separate from enrolled students until conversion.
          </div>
          <div className="flex justify-end gap-2">
            <a href="#" className="btn-outline bg-white">Cancel</a>
            <button className="btn-primary"><Clock3 size={15} /> Extend +7 Days</button>
          </div>
        </form>
      </PopupShell>
    </article>
  );
}

function PopupTrigger({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  return (
    <a href={`#${id}`} className={className}>{children}</a>
  );
}

function PopupShell({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div id={id} className="fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/55 p-4 target:flex">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-950">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <a href="#" className="grid h-9 w-9 flex-none place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:border-purple-200 hover:text-brand">
            <X size={16} />
          </a>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">{text}</div>;
}
