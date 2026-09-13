import { CalendarClock, PhoneCall } from "lucide-react";
import { getDemoBoard, type DemoBoardScope, type LeadOwnerDemoView, type UnbookedAccountView } from "@/lib/demoLeadOwner";
import { LeadMeetJoinButton } from "@/components/sales/LeadMeetJoinButton";

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

function UnbookedRow({ account, showOwner }: { account: UnbookedAccountView; showOwner: boolean }) {
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
      </div>
    </li>
  );
}

/**
 * Demo leads on a dashboard. `mine` shows a salesperson the demos and unbooked
 * sign-ups routed to them by the CRM; `all` shows admins everything, labelled
 * with the salesperson. Renders nothing when empty unless `showEmpty`.
 */
export default async function LeadOwnerDemosPanel({ userId, scope = "mine", showEmpty = false }: { userId: string; scope?: DemoBoardScope; showEmpty?: boolean }) {
  const { upcoming, recent, unbooked } = await getDemoBoard({ viewerId: userId, scope });
  if (!upcoming.length && !recent.length && !unbooked.length && !showEmpty) return null;
  const all = scope === "all";

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
          : "Leads assigned to you in the CRM. Join the Google Meet when the class is about to start, and call sign-ups who have not booked yet."}
      </p>

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
            {unbooked.map((account) => <UnbookedRow key={account.id} account={account} showOwner={all} />)}
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
