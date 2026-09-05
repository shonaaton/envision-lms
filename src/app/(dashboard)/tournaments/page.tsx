import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { inactiveStudentMessage } from "@/lib/studentAccess";
import { Tournament } from "@/models/Tournament";
import { User } from "@/models/User";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Clock3, Plus, Trophy, Users } from "lucide-react";
import { describeTournament, relativeTime, type TournamentSummary } from "@/lib/tournament/playerAction";

export const dynamic = "force-dynamic";

const TONE_STYLES: Record<TournamentSummary["tone"], string> = {
  live: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  soon: "bg-accent-50 text-brand-700 ring-accent-500/40",
  upcoming: "bg-slate-100 text-slate-600 ring-slate-500/15",
  finished: "bg-slate-100 text-slate-500 ring-slate-500/15",
  cancelled: "bg-red-50 text-red-600 ring-red-500/20",
};

function TournamentCard({ tournament, joined, now }: { tournament: any; joined: boolean; now: number }) {
  const summary = describeTournament(tournament);
  const id = String(tournament._id);
  const startAt = tournament.startAt ? new Date(tournament.startAt) : null;
  const live = summary.tone === "live";

  return (
    <Link
      href={`/tournaments/${id}`}
      // A live event is lifted by a brand-tinted edge rather than by shouting:
      // in a long list the eye should find it without the page feeling noisy.
      className={[
        "group relative flex flex-col gap-3 rounded-lg border bg-white/95 p-4 shadow-sm transition duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-900/10 focus-visible:-translate-y-0.5",
        live ? "border-brand/30 shadow-brand-900/10" : "border-slate-200/80 shadow-brand-900/5",
      ].join(" ")}
    >
      {live ? <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 rounded-t-lg bg-brand" /> : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-950 group-hover:text-brand">{tournament.name}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{summary.format}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${TONE_STYLES[summary.tone]}`}>
          {summary.statusLabel}
        </span>
      </div>

      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <div className="inline-flex items-center gap-1.5">
          <Clock3 size={13} className="text-slate-400" aria-hidden />
          <dt className="sr-only">Time control</dt>
          <dd className="font-semibold tabular-nums">{summary.timeControl}</dd>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <Users size={13} className="text-slate-400" aria-hidden />
          <dt className="sr-only">Players</dt>
          <dd className="tabular-nums">{summary.participants}</dd>
        </div>
        {startAt ? (
          <div className="inline-flex items-center gap-1.5">
            <CalendarClock size={13} className="text-slate-400" aria-hidden />
            <dt className="sr-only">Starts</dt>
            <dd>
              {summary.tone === "upcoming" || summary.tone === "soon" ? (
                <span className="font-semibold text-slate-700">{relativeTime(startAt, now)}</span>
              ) : (
                startAt.toLocaleDateString(undefined, { day: "numeric", month: "short" })
              )}
            </dd>
          </div>
        ) : null}
      </dl>

      {joined ? (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand ring-1 ring-brand/15">
          <CheckCircle2 size={11} aria-hidden /> Entered
        </span>
      ) : null}
    </Link>
  );
}

export default async function TournamentsPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  await dbConnect();

  const currentStudent =
    role === "student" && userId ? await User.findById(userId).select("isActive role").lean() : null;
  if (role === "student" && ((currentStudent as any)?.role !== "student" || (currentStudent as any)?.isActive === false)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="card border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2 font-semibold text-amber-900">
            <Trophy size={18} aria-hidden /> Tournaments paused
          </div>
          <p className="mt-2 text-sm leading-6 text-amber-800">{inactiveStudentMessage}</p>
          <Link href="/dashboard" className="btn-primary mt-4">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const filter =
    role === "admin" || role === "instructor"
      ? {}
      : { $or: [{ "access.users": userId }, { participants: userId }, { "access.allActiveStudents": true }] };
  const tournaments = await Tournament.find(filter).sort({ startAt: -1 }).limit(200).lean();
  const all = (tournaments || []).filter((item: any) => item && item._id);
  const now = Date.now();

  const isJoined = (item: any) =>
    (item.participants || []).map((id: any) => String(id?._id ?? id)).includes(String(userId));
  const isOver = (item: any) => ["completed", "finished", "cancelled"].includes(String(item.status));
  const isLive = (item: any) => ["live", "playing"].includes(String(item.status));

  /* Four sections, in the order a player cares about them: what is happening
     now, what they are part of, what is coming, and what is done. */
  const live = all.filter(isLive);
  const mine = all.filter((item: any) => isJoined(item) && !isOver(item) && !isLive(item));
  const upcoming = all
    .filter((item: any) => !isOver(item) && !isLive(item) && !isJoined(item))
    .sort((a: any, b: any) => new Date(a.startAt || 0).getTime() - new Date(b.startAt || 0).getTime());
  const completed = all.filter(isOver);

  const sections = [
    { title: "Live now", items: live, hint: "Join in progress or watch a board." },
    { title: "You are entered", items: mine, hint: "Your board opens automatically when each starts." },
    { title: "Upcoming", items: upcoming, hint: "" },
    { title: "Completed", items: completed.slice(0, 24), hint: "" },
  ].filter((section) => section.items.length);

  const canCreate = role === "admin";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
            <Trophy size={22} className="text-brand" aria-hidden /> Tournaments
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {live.length ? `${live.length} event${live.length === 1 ? "" : "s"} running right now.` : "Arena and Swiss events for the academy."}
          </p>
        </div>
        {canCreate ? (
          <Link href="/tournaments/new" className="btn-primary">
            <Plus size={16} aria-hidden /> New tournament
          </Link>
        ) : null}
      </header>

      {sections.length ? (
        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-500">{section.title}</h2>
                <span className="text-xs tabular-nums text-slate-400">{section.items.length}</span>
                {section.hint ? <span className="ml-auto hidden text-xs text-slate-400 sm:block">{section.hint}</span> : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((tournament: any) => (
                  <TournamentCard key={String(tournament._id)} tournament={tournament} joined={isJoined(tournament)} now={now} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="card py-12 text-center">
          <Trophy size={28} className="mx-auto text-slate-300" aria-hidden />
          <h2 className="mt-3 font-semibold text-slate-900">No tournaments yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {canCreate
              ? "Create an Arena or Swiss event and it will appear here for everyone who can enter it."
              : "When your coach schedules an event you can enter, it will appear here."}
          </p>
          {canCreate ? (
            <Link href="/tournaments/new" className="btn-primary mt-4">
              <Plus size={16} aria-hidden /> New tournament
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
