import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/welcomeEmail";
import { CoachApplication } from "@/models/Onboarding";
import { User, generateUsername } from "@/models/User";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CheckCircle2, UserPlus, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

function tempPassword() {
  return `ENVCoach${Math.floor(100000 + Math.random() * 900000)}`;
}

function contactNumber(record: { countryCode?: string; phone?: string }) {
  const phone = record.phone?.trim();
  if (!phone) return "No phone";
  return [record.countryCode, phone].map((part) => part?.trim()).filter(Boolean).join(" ");
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
    revalidatePath("/admin/coach-applications");
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
  revalidatePath("/admin/coach-applications");
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
  revalidatePath("/admin/coach-applications");
  revalidatePath("/admin/onboarding");
}

export default async function CoachApplicationsPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") redirect("/dashboard");
  await dbConnect();
  const applications = await CoachApplication.find({}).sort({ createdAt: -1 }).limit(100).lean();

  return (
    <div className="space-y-5 p-2 text-slate-950">
      <header>
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
          <UserPlus size={14} /> Coach Applications
        </div>
        <h1 className="mt-2 text-3xl font-black text-brand">Coach Applications</h1>
        <p className="mt-1 text-sm text-slate-600">Review coach signups, approve qualified applicants, and create instructor accounts.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">Applications</h2>
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
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">{text}</div>;
}
