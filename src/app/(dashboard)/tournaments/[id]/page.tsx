import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

async function joinTournament(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const id = String(formData.get("id"));
  await dbConnect();
  await Tournament.findByIdAndUpdate(id, { $addToSet: { participants: (session.user as any).id } });
  revalidatePath(`/tournaments/${id}`);
}

export default async function TournamentDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id).populate("participants", "name username").lean();
  if (!tournament) redirect("/tournaments");
  const allowed = role === "admin" || tournament.access?.allActiveStudents || (tournament.access?.users || []).map((id: any) => id.toString()).includes(userId) || (tournament.participants || []).some((p: any) => p._id?.toString() === userId);
  if (!allowed) return <div className="p-6">You do not have access to this tournament.</div>;
  const joined = (tournament.participants || []).some((p: any) => p._id?.toString() === userId);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Trophy size={20} /></span>
            <div>
              <h1 className="text-2xl font-semibold">{tournament.name}</h1>
              <p className="mt-1 text-sm text-slate-500">{tournament.description || "Tournament details"}</p>
            </div>
          </div>
          {role !== "admin" && (
            <form action={joinTournament}>
              <input type="hidden" name="id" value={params.id} />
              <button disabled={joined} className="h-10 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">{joined ? "Joined" : "Join Tournament"}</button>
            </form>
          )}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Tournament Type</div><b>{tournament.type === "arena" ? "Arena" : "Swiss"}</b></div>
          <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Start Date & Time</div><b>{new Date(tournament.startAt).toLocaleString("en-IN")}</b></div>
          <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Time Control</div><b>{tournament.timeControlMinutes}+{tournament.incrementSeconds}</b></div>
          <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Status</div><b>{tournament.status}</b></div>
          {tournament.type === "arena" && <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Arena Duration</div><b>{tournament.arenaDurationMinutes} minutes</b></div>}
          {tournament.type === "swiss" && <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Rounds</div><b>{tournament.rounds}</b></div>}
          <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Starting Position</div><b>{tournament.startingPosition?.type === "custom" ? "Custom Position" : "Normal Starting Position"}</b></div>
          <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Participants</div><b>{tournament.participants?.length || 0}</b></div>
        </div>
      </div>
      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Participants</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {(tournament.participants || []).map((student: any) => <div key={student._id.toString()} className="rounded-md bg-slate-50 px-3 py-2 text-sm">{student.name}</div>)}
        </div>
        {(!tournament.participants || tournament.participants.length === 0) && <p className="text-sm text-slate-500">No participants have joined yet.</p>}
      </section>
    </div>
  );
}
