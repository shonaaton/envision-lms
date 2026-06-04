import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

async function joinExternalTournament(formData: FormData) {
  "use server";
  const token = String(formData.get("token") || "");
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "").trim();
  if (!token || !username || !password) return;

  await dbConnect();
  const tournament: any = await Tournament.findOne({ "externalInvite.enabled": true, "externalInvite.token": token });
  if (!tournament || tournament.externalInvite?.password !== password) return;

  const alreadyJoined = (tournament.externalParticipants || []).some((player: any) => player.username.toLowerCase() === username.toLowerCase());
  if (!alreadyJoined) {
    tournament.externalParticipants.push({ username, joinedAt: new Date() });
    await tournament.save();
  }
  revalidatePath(`/tournament-join/${token}`);
}

export default async function ExternalTournamentJoinPage({ params }: { params: { token: string } }) {
  await dbConnect();
  const tournament: any = await Tournament.findOne({ "externalInvite.enabled": true, "externalInvite.token": params.token }).lean();
  if (!tournament) notFound();

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-xl rounded-lg border border-white/10 bg-white p-6 text-slate-950 shadow-2xl">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-50 text-purple-700"><Trophy size={20} /></span>
          <div>
            <h1 className="text-2xl font-semibold">{tournament.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{tournament.description || "Join this tournament as a guest player."}</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 rounded-md bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div><div className="text-xs text-slate-500">Type</div><b>{tournament.type === "arena" ? "Arena" : "Swiss"}</b></div>
          <div><div className="text-xs text-slate-500">Start</div><b>{new Date(tournament.startAt).toLocaleString("en-IN")}</b></div>
          <div><div className="text-xs text-slate-500">Time Control</div><b>{tournament.timeControlMinutes}+{tournament.incrementSeconds}</b></div>
          <div><div className="text-xs text-slate-500">Guests Joined</div><b>{tournament.externalParticipants?.length || 0}</b></div>
        </div>

        <form action={joinExternalTournament} className="space-y-4">
          <input type="hidden" name="token" value={params.token} />
          <label className="block text-sm font-medium">
            Username
            <input name="username" required className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="Enter your tournament name" />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input name="password" required className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" placeholder="Enter invite password" />
          </label>
          <button className="h-10 w-full rounded-md bg-purple-700 px-4 text-sm font-semibold text-white">Join Tournament</button>
        </form>

        {(tournament.externalParticipants || []).length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Joined Guests</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {(tournament.externalParticipants || []).map((player: any) => (
                <div key={player.username} className="rounded-md bg-purple-50 px-3 py-2 text-sm">{player.username}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
