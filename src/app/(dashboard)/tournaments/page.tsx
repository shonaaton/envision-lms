import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import Link from "next/link";
import { Plus, Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TournamentsPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  await dbConnect();
  const filter = role === "admin" || role === "instructor" ? {} : {
    $or: [{ "access.users": userId }, { participants: userId }, { "access.allActiveStudents": true }],
  };
  const tournaments = await Tournament.find(filter).sort({ startAt: 1 }).limit(200).lean();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Trophy size={18} /></span>
          <div><h1 className="text-2xl font-semibold">Tournaments</h1><p className="text-sm text-slate-500">Swiss and Arena tournaments available on the platform.</p></div>
        </div>
        {role === "admin" && <Link href="/tournaments/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white"><Plus size={15} /> Create Tournament</Link>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tournaments.map((tournament: any) => (
          <Link key={tournament._id.toString()} href={`/tournaments/${tournament._id}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-purple-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">{tournament.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{tournament.description || "No description added."}</p>
              </div>
              <span className="rounded-full bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700">{tournament.type}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600">
              <div>Start</div><b>{new Date(tournament.startAt).toLocaleString("en-IN")}</b>
              <div>Time Control</div><b>{tournament.timeControlMinutes}+{tournament.incrementSeconds}</b>
              <div>Status</div><b>{tournament.status}</b>
            </div>
          </Link>
        ))}
      </div>
      {tournaments.length === 0 && <div className="rounded-lg border border-dashed bg-white p-6 text-sm text-slate-500">No tournaments available yet.</div>}
    </div>
  );
}
