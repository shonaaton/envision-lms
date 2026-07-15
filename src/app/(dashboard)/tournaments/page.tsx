import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import Link from "next/link";
import { Plus, Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

function prettyStatus(value: string) {
  return String(value || "draft").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function accessState(status: string) {
  const value = String(status || "").toLowerCase();
  if (value === "live") return "Joinable";
  if (value === "upcoming") return "Scheduled";
  return "Closed";
}

export default async function TournamentsPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  await dbConnect();
  const filter = role === "admin" || role === "instructor" ? {} : {
    $or: [{ "access.users": userId }, { participants: userId }, { "access.allActiveStudents": true }],
  };
  const tournaments = await Tournament.find(filter).sort({ startAt: 1 }).limit(200).lean();
  const safeTournaments = (tournaments || []).filter((item: any) => item && item._id);
  const now = Date.now();
  const sections = [
    {
      title: "Ongoing",
      items: safeTournaments.filter((item: any) => ["live", "playing"].includes(String(item.status))),
    },
    {
      title: "Starting Soon",
      items: safeTournaments.filter((item: any) => !["live", "playing", "completed", "finished", "cancelled"].includes(String(item.status)) && new Date(item.startAt).getTime() >= now && new Date(item.startAt).getTime() - now <= 60 * 60 * 1000),
    },
    {
      title: "Upcoming",
      items: safeTournaments.filter((item: any) => !["live", "playing", "completed", "finished", "cancelled"].includes(String(item.status)) && new Date(item.startAt).getTime() - now > 60 * 60 * 1000),
    },
    {
      title: "Finished",
      items: safeTournaments.filter((item: any) => ["completed", "finished"].includes(String(item.status))),
    },
    {
      title: "My Tournaments",
      items: safeTournaments.filter((item: any) => (item.participants || []).map((id: any) => id?.toString?.() || String(id)).includes(String(userId))),
    },
    {
      title: "Private / Invitation Tournaments",
      items: safeTournaments.filter((item: any) => item.externalInvite?.enabled || !item.access?.allActiveStudents),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 px-2 py-3 text-slate-950 sm:px-6 sm:py-5 lg:px-8">
      <div className="mb-3 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-purple-50 text-purple-700 sm:h-9 sm:w-9"><Trophy size={18} /></span>
          <div><h1 className="text-xl font-semibold sm:text-2xl">Tournaments</h1><p className="text-xs text-slate-500 sm:text-sm">Swiss and Arena tournaments available on the platform.</p></div>
        </div>
        {role === "admin" && <Link href="/tournaments/new" className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-purple-700 px-3 text-xs font-semibold text-white sm:h-10 sm:px-4 sm:text-sm"><Plus size={15} /> Create Tournament</Link>}
      </div>

      <div className="space-y-5">
        {sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-950">{section.title}</h2>
              <span className="text-xs font-semibold text-slate-500">{section.items.length}</span>
            </div>
            {section.items.length ? (
              <div className="grid grid-cols-1 gap-2 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
                {section.items.map((tournament: any) => <TournamentCard key={`${section.title}-${tournament._id.toString()}`} tournament={tournament} />)}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-white p-4 text-sm text-slate-500">No tournaments in this section.</div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function TournamentCard({ tournament }: { tournament: any }) {
  const participants = Number((tournament.participants || []).length) + Number((tournament.externalParticipants || []).length);
  const formatDetail = tournament.type === "arena" ? `${tournament.arenaDurationMinutes || 0} min` : `${tournament.rounds || 0} rounds`;
  const restricted = tournament.externalInvite?.enabled ? "Invitation enabled" : tournament.access?.allActiveStudents ? "All active students" : "Restricted";
  return (
    <Link href={`/tournaments/${tournament._id}`} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-purple-200 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-950">{tournament.name}</h3>
          <p className="mt-1 line-clamp-2 text-xs text-slate-500 sm:text-sm">{tournament.description || "No description added."}</p>
        </div>
        <span className="rounded-full bg-purple-50 px-2 py-1 text-xs font-medium capitalize text-purple-700">{tournament.type}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs text-slate-600 sm:mt-4 sm:gap-2 sm:text-sm">
        <div>Start</div><b>{new Date(tournament.startAt).toLocaleString("en-IN")}</b>
        <div>Time Control</div><b>{tournament.timeControlMinutes}+{tournament.incrementSeconds}</b>
        <div>{tournament.type === "arena" ? "Duration" : "Rounds"}</div><b>{formatDetail}</b>
        <div>Participants</div><b>{participants}</b>
        <div>Entry</div><b>{restricted}</b>
        <div>Status</div><b>{prettyStatus(tournament.status)}</b>
        <div>Action</div><b>{accessState(tournament.status) === "Joinable" ? "Join" : "View"}</b>
      </div>
    </Link>
  );
}
