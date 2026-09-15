import { CalendarClock, CheckCircle2, Link as LinkIcon, PhoneCall } from "lucide-react";
import { getDemoBoard, type DemoBoardScope, type LeadOwnerDemoView, type UnbookedAccountView } from "@/lib/demoLeadOwner";
import { LeadMeetJoinButton } from "@/components/sales/LeadMeetJoinButton";
import { PopupShell, PopupTrigger } from "@/components/HashPopup";
import { assignDemoFromDashboard } from "@/app/(dashboard)/dashboard/demoActions";
import { User } from "@/models/User";

type CoachOption = { id: string; name: string };
export type DemoPanelNotice = { ok?: string; error?: string };

function OwnerChip({ name }: { name: string }) {
  return name ? (
    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">Sales: {name}</span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">No salesperson</span>
  );
}

function DemoRow({ demo, live, showOwner }: { demo: LeadOwnerDemoView; live: boolean; showOwner: boolean }) {
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">
          {demo.studentName}
          {demo.parentName ? <span className="font-normal text-slate-500"> · Parent {demo.parentName}</span> : null}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {demo.needsNewTime ? "Needs a new time" : demo.timeLabel}
          {demo.coachName ? ` · Coach ${demo.coachName}` : ""}
          {demo.contact ? ` · ${demo.contact}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {showOwner ? <OwnerChip name={demo.ownerName} /> : null}
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${demo.confirmed ? "bg-emerald-50 text-emerald-700" : "bg-purple-50 text-purple-700"}`}>
          {demo.statusLabel}
        </span>
        {live && demo.confirmed && !demo.needsNewTime ? (
          <LeadMeetJoinButton meetingUrl={demo.meetingUrl} startAt={demo.startAt} endAt={demo.endAt} />
        ) : null}
      </div>
    </li>
  );
}

/**
 * Book a demo for a sign-up who has not requested one. The action re-checks that
 * the viewer is this lead's salesperson or a demo manager.
 */
function AssignDemoPopup({ account, coaches }: { account: UnbookedAccountView; coaches: CoachOption[] }) {
  const modalId = `assign-lead-demo-${account.id}`;
  return (
    <>
      <PopupTrigger id={modalId} className="inline-flex items-center gap-1.5 rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-800">
        <CheckCircle2 size={13} aria-hidden="true" />
        Assign Demo
      </PopupTrigger>
      <PopupShell id={modalId} title="Assign a demo" subtitle={`${account.studentName} · no demo requested yet`}>
        <form action={assignDemoFromDashboard} className="grid gap-3">
          <input type="hidden" name="student" value={account.id} />
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Coach</span>
            <select name="coach" defaultValue="" className="input bg-white" required>
              <option value="">Assign coach</option>
              {coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Date and time (IST)</span>
              <input name="startAt" type="datetime-local" className="input bg-white" required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Minutes</span>
              <input name="durationMinutes" type="number" min={15} step={15} defaultValue={30} className="input bg-white" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Google Meet link</span>
            <span className="relative block">
              <LinkIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input name="meetingUrl" placeholder="Paste Google Meet link" className="input bg-white pl-9" />
            </span>
          </label>
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
            This books and confirms the demo straight away: the demo classroom is created and the family and coach are notified.
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <a href="#" className="btn-outline bg-white">Cancel</a>
            <button className="btn-primary"><CheckCircle2 size={15} /> Book &amp; Confirm Demo</button>
          </div>
        </form>
      </PopupShell>
    </>
  );
}

function UnbookedRow({ account, showOwner, coaches }: { account: UnbookedAccountView; showOwner: boolean; coaches: CoachOption[] }) {
  const tel = account.contact.replace(/[^\d+]/g, "");
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">
          {account.studentName}
          {account.parentName ? <span className="font-normal text-slate-500"> · Parent {account.parentName}</span> : null}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">Signed up {account.signedUpLabel}{account.contact ? ` · ${account.contact}` : ""}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {showOwner ? <OwnerChip name={account.ownerName} /> : null}
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${account.overdue ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
          {account.overdue ? "Follow up" : "Just signed up"}
        </span>
        {tel && /\d{6,}/.test(tel) ? (
          <a href={`tel:${tel}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-purple-300">
            <PhoneCall size={13} aria-hidden="true" />
            Call
          </a>
        ) : null}
        <AssignDemoPopup account={account} coaches={coaches} />
      </div>
    </li>
  );
}

/**
 * Demo leads on a dashboard. `mine` shows a salesperson the demos and unbooked
 * sign-ups routed to them by the CRM; `all` shows admins everything, labelled
 * with the salesperson. Renders nothing when empty unless `showEmpty`.
 */
export default async function LeadOwnerDemosPanel({ userId, scope = "mine", showEmpty = false, notice }: { userId: string; scope?: DemoBoardScope; showEmpty?: boolean; notice?: DemoPanelNotice }) {
  const { upcoming, recent, unbooked } = await getDemoBoard({ viewerId: userId, scope });
  const hasNotice = Boolean(notice?.ok || notice?.error);
  if (!upcoming.length && !recent.length && !unbooked.length && !showEmpty && !hasNotice) return null;
  const all = scope === "all";
  const coaches: CoachOption[] = unbooked.length
    ? ((await User.find({ role: "instructor", isActive: true }).select("name").sort({ name: 1 }).lean()) as any[]).map((coach) => ({ id: String(coach._id), name: String(coach.name || "Coach") }))
    : [];

  return (
    <section className="rounded-xl border border-purple-100 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock size={18} className="text-purple-700" aria-hidden="true" />
        <h2 className="font-semibold text-slate-900">{all ? "Demo leads by salesperson" : "My leads' demos"}</h2>
        {upcoming.length ? <span className="rounded-full bg-purple-700 px-2 py-0.5 text-[11px] font-semibold text-white">{upcoming.length} upcoming</span> : null}
        {unbooked.length ? <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white">{unbooked.length} not booked</span> : null}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {all
          ? "Every upcoming demo and unbooked demo account, with the salesperson the CRM assigned."
          : "Leads assigned to you in the CRM. Join the Google Meet when the class is about to start, and call sign-ups who have not booked yet - or assign their demo yourself."}
      </p>
      {hasNotice ? (
        <div
          role="status"
          className={`mt-3 rounded-lg border px-4 py-3 text-sm font-semibold ${notice?.error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
        >
          {notice?.error || notice?.ok}
        </div>
      ) : null}

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Upcoming demos</h3>
      {upcoming.length ? (
        <ul className="divide-y divide-slate-100">
          {upcoming.map((demo) => <DemoRow key={demo.id} demo={demo} live showOwner={all} />)}
        </ul>
      ) : (
        <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No upcoming demos right now.</p>
      )}

      {unbooked.length ? (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Signed up, no demo requested</h3>
          <ul className="divide-y divide-slate-100">
            {unbooked.map((account) => <UnbookedRow key={account.id} account={account} showOwner={all} coaches={coaches} />)}
          </ul>
        </>
      ) : null}

      {recent.length ? (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Last 14 days</h3>
          <ul className="divide-y divide-slate-100">
            {recent.map((demo) => <DemoRow key={demo.id} demo={demo} live={false} showOwner={all} />)}
          </ul>
        </>
      ) : null}
    </section>
  );
}
