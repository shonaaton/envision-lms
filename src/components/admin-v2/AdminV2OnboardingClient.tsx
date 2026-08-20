"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Eye, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AdminV2Card, AdminV2Modal, AdminV2Sheet, AdminV2Stat } from "./AdminV2Primitives";
import { cn } from "@/lib/utils";

type Coach = { _id: string; name: string; email?: string };
type Booking = {
  _id: string;
  student?: { name?: string; email?: string; username?: string };
  instructor?: Coach;
  startAt: string;
  endAt: string;
  approvalStatus: string;
  status: string;
  notes?: string;
  level?: string;
};
type CoachApplication = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  countryCode?: string;
  city?: string;
  country?: string;
  experience?: string;
  playingLevel?: string;
  fideId?: string;
  rating?: number;
  availabilityNote?: string;
  documentsUrl?: string;
  status: string;
};
type DemoStudent = { _id: string; name: string; email: string; username?: string; countryCode?: string; phone?: string; createdAt?: string };

function toLocalInput(value?: string | Date) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function AdminV2OnboardingClient() {
  const [tab, setTab] = useState<"demos" | "coaches" | "students">("demos");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [applications, setApplications] = useState<CoachApplication[]>([]);
  const [demoStudents, setDemoStudents] = useState<DemoStudent[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<CoachApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin-v2/onboarding", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Could not load onboarding");
      setLoading(false);
      return;
    }
    setBookings(data.bookings || []);
    setApplications(data.applications || []);
    setDemoStudents(data.demoStudents || []);
    setCoaches(data.coaches || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function action(payload: Record<string, unknown>) {
    const response = await fetch("/api/admin-v2/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "Action failed");
      return null;
    }
    if (data.tempPassword) {
      const value = `Username: ${data.username || ""}\nTemporary Password: ${data.tempPassword}`;
      setCredentials(value);
      navigator.clipboard?.writeText(value);
    }
    toast.success("Onboarding updated");
    await load();
    return data;
  }

  const pendingBookings = bookings.filter((item) => item.approvalStatus === "pending_admin" || item.status === "pending");
  const pendingApplications = applications.filter((item) => item.status === "pending" || item.status === "shortlisted");

  return (
    <div className="space-y-5">
      <AdminV2Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-brand/70">Onboarding</div>
            <h2 className="mt-1 text-2xl font-black text-brand">Demos & Coach Applications</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <AdminV2Stat label="Pending Demos" value={pendingBookings.length} tone="accent" />
            <AdminV2Stat label="Coach Apps" value={pendingApplications.length} />
            <AdminV2Stat label="Demo Students" value={demoStudents.length} />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ["demos", "Demo Requests"],
            ["coaches", "Coach Applications"],
            ["students", "Demo Students"],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id as any)} className={cn("rounded-full px-4 py-2 text-sm font-black transition", tab === id ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-brand/5 hover:text-brand")}>{label}</button>
          ))}
        </div>
      </AdminV2Card>

      {tab === "demos" ? (
        <div className="grid gap-3">
          {bookings.map((booking) => (
            <button key={booking._id} onClick={() => setSelectedBooking(booking)} className={cn("rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-brand/30", booking.approvalStatus === "pending_admin" ? "border-accent shadow-accent/20" : "border-slate-200")}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-black text-slate-950">{booking.student?.name || "Demo student"} with {booking.instructor?.name || "Unassigned coach"}</div>
                  <div className="mt-1 text-sm text-slate-500">{new Date(booking.startAt).toLocaleString("en-IN")} - {booking.approvalStatus}</div>
                  <div className="mt-1 text-xs text-slate-500">{booking.notes || "No note added"}</div>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-accent/25 px-3 py-1 text-xs font-black text-brand"><Clock3 size={14} /> Review</span>
              </div>
            </button>
          ))}
          {!loading && !bookings.length ? <Empty text="No demo bookings found." /> : null}
        </div>
      ) : null}

      {tab === "coaches" ? (
        <div className="grid gap-3">
          {applications.map((application) => (
            <button key={application._id} onClick={() => setSelectedApplication(application)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-brand/30">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-black text-slate-950">{application.name}</div>
                  <div className="mt-1 text-sm text-slate-500">{application.email} - {application.status}</div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{application.experience || "No experience note added."}</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-brand/5 px-3 py-1 text-xs font-black text-brand"><Eye size={14} /> Open</span>
              </div>
            </button>
          ))}
          {!loading && !applications.length ? <Empty text="No coach applications found." /> : null}
        </div>
      ) : null}

      {tab === "students" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {demoStudents.map((student) => (
            <article key={student._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="font-black text-slate-950">{student.name}</div>
              <div className="mt-1 text-sm text-slate-500">{student.email} - {student.username || "No username"}</div>
              <button onClick={() => void action({ action: "convert_demo_student", studentId: student._id })} className="btn-primary mt-4"><UserCheck size={16} /> Convert to Enrolled</button>
            </article>
          ))}
          {!loading && !demoStudents.length ? <Empty text="No demo students found." /> : null}
        </div>
      ) : null}

      {credentials ? (
        <AdminV2Card>
          <div className="text-sm font-black text-brand">Latest coach credentials copied</div>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-700">{credentials}</pre>
        </AdminV2Card>
      ) : null}

      <DemoApprovalModal booking={selectedBooking} coaches={coaches} onClose={() => setSelectedBooking(null)} onAction={action} />
      <CoachApplicationSheet application={selectedApplication} onClose={() => setSelectedApplication(null)} onAction={action} />
    </div>
  );
}

function DemoApprovalModal({ booking, coaches, onClose, onAction }: { booking: Booking | null; coaches: Coach[]; onClose: () => void; onAction: (payload: Record<string, unknown>) => Promise<any> }) {
  const [coach, setCoach] = useState("");
  const [startAt, setStartAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  useEffect(() => {
    setCoach(booking?.instructor?._id || "");
    setStartAt(toLocalInput(booking?.startAt));
    setDurationMinutes(booking ? Math.max(15, Math.round((new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime()) / 60000)) : 60);
  }, [booking]);
  return (
    <AdminV2Modal open={!!booking} title="Approve Demo" description={booking?.student?.name || "Demo request"} onClose={onClose}>
      {booking ? (
        <div className="grid gap-3">
          <select className="input" value={coach} onChange={(event) => setCoach(event.target.value)}>
            <option value="">Select coach</option>
            {coaches.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
          <input className="input" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
          <input className="input" type="number" min={15} step={15} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} />
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button className="btn-primary" onClick={() => void onAction({ action: "approve_demo", bookingId: booking._id, coach, startAt, durationMinutes }).then(onClose)}><CheckCircle2 size={16} /> Approve</button>
            <button className="btn-outline" onClick={() => void onAction({ action: "update_demo", bookingId: booking._id, coach, startAt, durationMinutes })}>Save Changes</button>
            <button className="btn-outline border-rose-200 text-rose-700" onClick={() => void onAction({ action: "reject_demo", bookingId: booking._id }).then(onClose)}><XCircle size={16} /> Reject</button>
          </div>
        </div>
      ) : null}
    </AdminV2Modal>
  );
}

function CoachApplicationSheet({ application, onClose, onAction }: { application: CoachApplication | null; onClose: () => void; onAction: (payload: Record<string, unknown>) => Promise<any> }) {
  return (
    <AdminV2Sheet open={!!application} title={application?.name || "Coach Application"} description={application?.email} onClose={onClose}>
      {application ? (
        <div className="flex min-h-full flex-col">
          <div className="grid gap-4">
            <Info label="Status" value={application.status} />
            <Info label="Phone" value={[application.countryCode, application.phone].filter(Boolean).join(" ") || "-"} />
            <Info label="Location" value={[application.city, application.country].filter(Boolean).join(", ") || "-"} />
            <Info label="Playing Level" value={application.playingLevel || "-"} />
            <Info label="FIDE / Rating" value={[application.fideId, application.rating].filter(Boolean).join(" / ") || "-"} />
            <Info label="Experience" value={application.experience || "No experience note added."} />
            <Info label="Availability" value={application.availabilityNote || "-"} />
            {application.documentsUrl ? <a className="btn-outline w-fit" href={application.documentsUrl} target="_blank">Open Documents</a> : null}
          </div>
          <div className="sticky bottom-0 mt-6 flex flex-wrap gap-2 border-t border-slate-100 bg-white pt-4">
            <button className="btn-primary" onClick={() => void onAction({ action: "approve_coach", applicationId: application._id }).then(onClose)}><CheckCircle2 size={16} /> Approve</button>
            <button className="btn-outline border-rose-200 text-rose-700" onClick={() => void onAction({ action: "reject_coach", applicationId: application._id }).then(onClose)}><XCircle size={16} /> Reject</button>
          </div>
        </div>
      ) : null}
    </AdminV2Sheet>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{text}</div>;
}

