import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Booking } from "@/models/Booking";
import { DemoFeedback } from "@/models/Onboarding";
import { recordActivity } from "@/lib/activity";
import { notifyDemoFeedbackSubmitted } from "@/lib/demoWorkflow";
import { demoSalesRecipients } from "@/lib/demoNotificationRecipients";
import { curriculumByTier, curriculumSessionByNumber } from "@/lib/demoCurriculum";
import DemoAssessmentLeaveGuard from "@/components/demo/DemoAssessmentLeaveGuard";
import DemoFeedbackForm, { type SalesPersonOption } from "@/components/demo/DemoFeedbackForm";

export const dynamic = "force-dynamic";

function value(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

/** Sales staff who can be named as present, from the live directory. */
async function salesPeopleOptions(): Promise<SalesPersonOption[]> {
  // Fallback rows from the static contact list carry no user id, and the field
  // is a User reference, so only real accounts can be offered here.
  const recipients = await demoSalesRecipients();
  return recipients.filter((recipient) => recipient.userId && recipient.name).map((recipient) => ({ id: recipient.userId, name: recipient.name }));
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

  // The starting topic is stored as text so a report never has to re-resolve it,
  // but it is chosen by session number: several sessions in a tier share a name
  // ("Revision", "Practice Session") and only the number says which one.
  const recommendedCourseLevel = value(formData, "recommendedCourseLevel");
  const startingSession = curriculumSessionByNumber(recommendedCourseLevel, Number(value(formData, "recommendedStartingSession")));

  // Only a name from the live sales directory is accepted - the id arrives from
  // a dropdown, and a form post is not a promise that it came from one.
  const salesPersonPresent = value(formData, "salesPersonPresent") === "yes";
  const salesPersonId = value(formData, "salesPerson");
  const salesPerson = salesPersonPresent ? (await salesPeopleOptions()).find((person) => person.id === salesPersonId) : undefined;

  const hasFideRating = value(formData, "hasFideRating") === "yes";

  const alreadySubmitted = Boolean(
    await DemoFeedback.exists({ booking: booking._id, classroom: booking.classroom, status: "submitted" })
  );
  const feedback = await DemoFeedback.findOneAndUpdate(
    { booking: booking._id, classroom: booking.classroom },
    {
      booking: booking._id,
      demoUser: booking.student?._id || booking.student,
      coach: coachId,
      classroom: booking.classroom,
      attendanceStatus: "present",
      salesPersonPresent,
      salesPerson: salesPerson?.id || undefined,
      salesPersonName: salesPerson?.name || "",
      recommendedCourseLevel,
      recommendedSubLevel: startingSession?.levelName || "",
      recommendedStartingTopic: startingSession?.topic || "",
      recommendedStartingSession: startingSession?.sessionNumber || undefined,
      coachRecommendation: value(formData, "coachRecommendation"),
      hasFideRating,
      fideRating: hasFideRating ? Number(value(formData, "fideRating") || 0) || undefined : undefined,
      calculationPower: value(formData, "calculationPower"),
      tacticalStrength: value(formData, "tacticalStrength"),
      endgameKnowledge: value(formData, "endgameKnowledge"),
      positionalSense: value(formData, "positionalSense"),
      overallStrength: value(formData, "overallStrength"),
      salesAdminNotes: value(formData, "salesAdminNotes"),
      status: "submitted",
      submittedAt: new Date(),
      submittedBy: actorId,
    },
    { upsert: true, new: true }
  );
  await Booking.findByIdAndUpdate(booking._id, { demoStatus: "COMPLETED", feedbackStatus: "submitted" });
  // Whether the hand-off to sales has already happened, read before the upsert
  // above because the upsert is what sets it: without this every re-save sent
  // the whole "assessment submitted" fan-out again, and a coach correcting a
  // typo emailed and messaged three people a second time. Editing an
  // assessment is fine; announcing it twice is not.
  if (!alreadySubmitted) {
    // Never let a delivery failure lose the assessment the coach just typed.
    await notifyDemoFeedbackSubmitted({
      booking,
      student: booking.student,
      coach: booking.assignedCoach || booking.instructor,
      feedback,
    }).catch((error) => console.error("Demo feedback notification failed", error));
  }
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
  // An assessment is the write-up of a class that actually happened. A demo that
  // was never delivered - a no show, a missed slot, a closed lead - has nothing
  // to assess, and the leave guard below would otherwise trap whoever opened
  // this page in a form they cannot honestly fill in. Those leads belong in the
  // Demo Center's No Shows/Missed tab, where they can be rebooked or closed.
  const isAssessable = ["ASSESSMENT_PENDING", "COMPLETED", "CONVERTED"].includes(String(booking.demoStatus || "")) || Boolean(feedback);
  if (!isAssessable) redirect(role === "instructor" ? "/classrooms" : "/admin/demo-center?tab=missed");

  const salesPeople = await salesPeopleOptions();
  const coachName = booking.assignedCoach?.name || booking.instructor?.name || "Unassigned";

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <DemoAssessmentLeaveGuard />
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em]"><ClipboardList size={15} /> Demo Feedback</div>
        <h1 className="mt-1.5 text-xl font-black text-slate-950 sm:text-2xl">{booking.student?.name || "Demo student"}</h1>
        <p className="mt-1 text-sm leading-6 text-amber-900">Fill this in while the class is fresh. Sales converts the lead from what you write here.</p>
      </section>

      <DemoFeedbackForm
        action={submitDemoFeedback}
        bookingId={String(booking._id)}
        studentName={booking.student?.name || "Demo student"}
        coachName={coachName}
        salesPeople={salesPeople}
        curriculum={curriculumByTier()}
        defaults={{
          salesPersonPresent: Boolean(feedback?.salesPersonPresent),
          salesPerson: String(feedback?.salesPerson || ""),
          recommendedCourseLevel: String(feedback?.recommendedCourseLevel || ""),
          recommendedStartingSession: Number(feedback?.recommendedStartingSession || 0),
          coachRecommendation: String(feedback?.coachRecommendation || ""),
          hasFideRating: Boolean(feedback?.hasFideRating),
          fideRating: feedback?.fideRating ? String(feedback.fideRating) : "",
          calculationPower: String(feedback?.calculationPower || ""),
          tacticalStrength: String(feedback?.tacticalStrength || ""),
          endgameKnowledge: String(feedback?.endgameKnowledge || ""),
          positionalSense: String(feedback?.positionalSense || ""),
          overallStrength: String(feedback?.overallStrength || ""),
          salesAdminNotes: String(feedback?.salesAdminNotes || ""),
        }}
      />
    </main>
  );
}
