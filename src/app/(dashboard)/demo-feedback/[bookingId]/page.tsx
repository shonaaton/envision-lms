import { redirect } from "next/navigation";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Booking } from "@/models/Booking";
import { DemoFeedback } from "@/models/Onboarding";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

function value(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

async function submitDemoFeedback(formData: FormData) {
  "use server";
  const session = await auth();
  const role = (session?.user as any)?.role;
  const actorId = String((session?.user as any)?.id || "");
  if (!session?.user || !["instructor", "admin", "sub-admin"].includes(role)) return;
  await dbConnect();
  const booking: any = await Booking.findById(String(formData.get("bookingId") || "")).populate("student instructor assignedCoach");
  if (!booking || booking.bookingType !== "demo" || !booking.classroom) return;
  const coachId = String(booking.assignedCoach?._id || booking.instructor?._id || booking.instructor || "");
  if (role === "instructor" && coachId !== actorId) return;
  await DemoFeedback.findOneAndUpdate(
    { booking: booking._id, classroom: booking.classroom },
    {
      booking: booking._id,
      demoUser: booking.student?._id || booking.student,
      coach: coachId,
      classroom: booking.classroom,
      attendanceStatus: "present",
      chessLevel: value(formData, "chessLevel"),
      playingStrength: value(formData, "playingStrength"),
      hasFideRating: value(formData, "hasFideRating") === "yes",
      fideRating: Number(value(formData, "fideRating") || 0) || undefined,
      chessComRating: Number(value(formData, "chessComRating") || 0) || undefined,
      lichessRating: Number(value(formData, "lichessRating") || 0) || undefined,
      assessmentNotes: value(formData, "assessmentNotes"),
      strengths: value(formData, "strengths"),
      weaknesses: value(formData, "weaknesses"),
      recommendedCourseLevel: value(formData, "recommendedCourseLevel"),
      recommendedStartingTopic: value(formData, "recommendedStartingTopic"),
      coachComments: value(formData, "coachComments"),
      salesAdminNotes: value(formData, "salesAdminNotes"),
      status: "submitted",
      submittedAt: new Date(),
      submittedBy: actorId,
    },
    { upsert: true, new: true }
  );
  await Booking.findByIdAndUpdate(booking._id, { feedbackStatus: "submitted" });
  await recordActivity({
    actor: actorId,
    targetUser: String(booking.student?._id || booking.student || ""),
    type: "demo.feedback.submitted",
    label: "Submitted demo feedback",
    entityType: "Booking",
    entityId: booking._id.toString(),
    metadata: { classroom: String(booking.classroom), event: "DEMO_FEEDBACK_SUBMITTED" },
  });
  redirect("/classrooms?demoFeedback=submitted");
}

export default async function DemoFeedbackPage({ params }: { params: { bookingId: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const actorId = String((session?.user as any)?.id || "");
  if (!session?.user || !["instructor", "admin", "sub-admin"].includes(role)) redirect("/dashboard");
  await dbConnect();
  const booking: any = await Booking.findById(params.bookingId).populate("student instructor assignedCoach").lean();
  if (!booking || booking.bookingType !== "demo") redirect("/classrooms");
  const coachId = String(booking.assignedCoach?._id || booking.instructor?._id || booking.instructor || "");
  if (role === "instructor" && coachId !== actorId) redirect("/classrooms");
  const feedback: any = await DemoFeedback.findOne({ booking: booking._id, classroom: booking.classroom }).lean();

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wide"><ClipboardList size={18} /> Demo Feedback</div>
        <h1 className="mt-2 text-2xl font-black text-slate-950">Initial assessment for {booking.student?.name || "demo student"}</h1>
        <p className="mt-1 text-sm leading-6 text-amber-900">Capture the first coach assessment now. This schema is ready for the fuller assessment system later.</p>
      </section>

      <form action={submitDemoFeedback} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <input type="hidden" name="bookingId" value={String(booking._id)} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="chessLevel" label="Current chess level" defaultValue={feedback?.chessLevel} />
          <Field name="playingStrength" label="Approximate playing strength" defaultValue={feedback?.playingStrength} />
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase text-slate-500">FIDE rating?</span>
            <select name="hasFideRating" defaultValue={feedback?.hasFideRating ? "yes" : "no"} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm">
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <Field name="fideRating" label="FIDE rating" type="number" defaultValue={feedback?.fideRating} />
          <Field name="chessComRating" label="Chess.com rating" type="number" defaultValue={feedback?.chessComRating} />
          <Field name="lichessRating" label="Lichess rating" type="number" defaultValue={feedback?.lichessRating} />
          <Field name="recommendedCourseLevel" label="Recommended course level" defaultValue={feedback?.recommendedCourseLevel} />
          <Field name="recommendedStartingTopic" label="Recommended starting topic" defaultValue={feedback?.recommendedStartingTopic} />
        </div>
        <TextArea name="assessmentNotes" label="Basic assessment notes" defaultValue={feedback?.assessmentNotes} />
        <div className="grid gap-4 md:grid-cols-2">
          <TextArea name="strengths" label="Strengths" defaultValue={feedback?.strengths} />
          <TextArea name="weaknesses" label="Weaknesses" defaultValue={feedback?.weaknesses} />
        </div>
        <TextArea name="coachComments" label="Coach comments" defaultValue={feedback?.coachComments} />
        {role !== "instructor" ? <TextArea name="salesAdminNotes" label="Sales/admin notes" defaultValue={feedback?.salesAdminNotes} /> : null}
        <button className="btn-primary w-fit"><CheckCircle2 size={16} /> Submit Demo Feedback</button>
      </form>
    </main>
  );
}

function Field({ name, label, type = "text", defaultValue }: { name: string; label: string; type?: string; defaultValue?: string | number }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase text-slate-500">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue || ""} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
    </label>
  );
}

function TextArea({ name, label, defaultValue }: { name: string; label: string; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase text-slate-500">{label}</span>
      <textarea name={name} defaultValue={defaultValue || ""} className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm" />
    </label>
  );
}
