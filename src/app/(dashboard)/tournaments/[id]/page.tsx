import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import "@/models/User";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { Link2, RefreshCcw, Trophy } from "lucide-react";
import { TournamentDetailClient } from "@/components/tournaments/TournamentDetailClient";
import { TournamentGame } from "@/models/TournamentGame";
import { playerKeyForUser } from "@/lib/tournamentEngine";

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

async function joinTournament(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const id = String(formData.get("id"));
  await dbConnect();
  await Tournament.findByIdAndUpdate(id, { $addToSet: { participants: (session.user as any).id } });
  revalidatePath(`/tournaments/${id}`);
}

async function leaveTournament(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session) return;
  const id = String(formData.get("id"));
  await dbConnect();
  const tournament: any = await Tournament.findById(id);
  if (!tournament) return;
  if (String(tournament.status || "") === "live" || String(tournament.status || "") === "completed") {
    revalidatePath(`/tournaments/${id}`);
    return;
  }
  tournament.participants = (tournament.participants || []).filter((participant: any) => participant?.toString?.() !== String((session.user as any).id));
  await tournament.save();
  revalidatePath(`/tournaments/${id}`);
}

function makeInvitePassword() {
  return randomBytes(4).toString("hex").toUpperCase();
}

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function buildCurrentSeat({
  userId,
  joined,
  tournament,
  activeGame,
  myGames,
}: {
  userId: string;
  joined: boolean;
  tournament: any;
  activeGame: any;
  myGames: any[];
}) {
  const myPlayerKey = playerKeyForUser(String(userId));
  const liveRound = (tournament.roundsData || []).find((round: any) => round.status !== "completed") || null;
  const seatFromRound = liveRound?.pairings?.find((pairing: any) => pairing.whiteKey === myPlayerKey || pairing.blackKey === myPlayerKey) || null;
  const fallbackGame = myGames[0] || null;

  if (activeGame) {
    return {
      roundNumber: Number(activeGame.roundNumber || tournament.currentRound || 0),
      boardNumber: Number(activeGame.tableNumber || 0),
      color: String(activeGame.whiteUser || "") === String(userId) ? "white" : "black",
      opponentName: String(activeGame.whiteUser || "") === String(userId) ? (activeGame.blackName || "Bye") : activeGame.whiteName,
      status: "active",
      result: activeGame.result || "*",
    };
  }

  if (seatFromRound) {
    return {
      roundNumber: Number(liveRound?.roundNumber || tournament.currentRound || 0),
      boardNumber: Number(seatFromRound.tableNumber || 0),
      color: seatFromRound.whiteKey === myPlayerKey ? "white" : "black",
      opponentName: seatFromRound.whiteKey === myPlayerKey ? (seatFromRound.blackName || "Bye") : seatFromRound.whiteName,
      status: seatFromRound.status === "completed" ? "completed" : "assigned",
      result: seatFromRound.result || "*",
    };
  }

  if (fallbackGame) {
    return {
      roundNumber: Number(fallbackGame.roundNumber || 0),
      boardNumber: Number(fallbackGame.tableNumber || 0),
      color: String(fallbackGame.whiteUser || "") === String(userId) ? "white" : "black",
      opponentName: String(fallbackGame.whiteUser || "") === String(userId) ? (fallbackGame.blackName || "Bye") : fallbackGame.whiteName,
      status: fallbackGame.status || "completed",
      result: fallbackGame.result || "*",
    };
  }

  return {
    roundNumber: Number(tournament.currentRound || 0),
    boardNumber: 0,
    color: "",
    opponentName: "",
    status: joined ? (tournament.status === "live" ? "waiting" : "joined") : "not_joined",
    result: "*",
  };
}

async function createExternalInvite(formData: FormData) {
  "use server";
  const session = await auth();
  if ((session?.user as any)?.role !== "admin") throw new Error("Forbidden");
  const id = String(formData.get("id"));
  await dbConnect();
  await Tournament.findByIdAndUpdate(id, {
    externalInvite: {
      enabled: true,
      token: randomBytes(18).toString("hex"),
      password: makeInvitePassword(),
      createdAt: new Date(),
    },
  });
  revalidatePath(`/tournaments/${id}`);
}

export default async function TournamentDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id).populate("participants", "name username").lean();
  if (!tournament) redirect("/tournaments");
  const allowed = role === "admin" || role === "instructor" || tournament.access?.allActiveStudents || (tournament.access?.users || []).map((id: any) => id.toString()).includes(userId) || (tournament.participants || []).some((p: any) => p._id?.toString() === userId);
  if (!allowed) return <div className="p-6">You do not have access to this tournament.</div>;
  const joined = (tournament.participants || []).some((p: any) => p._id?.toString() === userId);
  const host = headers().get("host");
  const protocol = headers().get("x-forwarded-proto") || "https";
  const externalInviteUrl = tournament.externalInvite?.token ? `${protocol}://${host}/tournament-join/${tournament.externalInvite.token}` : "";
  const games = await TournamentGame.find({ tournament: params.id }).sort({ createdAt: -1 }).lean();
  const activeGame =
    games.find((game: any) => game.status === "active" && [game.whiteUser?.toString?.(), game.blackUser?.toString?.()].includes(String(userId))) || null;
  const myGames = games.filter((game: any) => [game.whiteUser?.toString?.(), game.blackUser?.toString?.()].includes(String(userId))).slice(0, 10);
  const initialState = {
    tournament: toPlain(tournament),
    activeGame: activeGame ? toPlain(activeGame) : null,
    games: toPlain(games.slice(0, 25)),
    myGames: toPlain(myGames),
    joined,
    currentSeat: toPlain(buildCurrentSeat({ userId: String(userId || ""), joined, tournament, activeGame, myGames })),
    canManage: role === "admin",
    canPlay: role === "student" || role === "admin",
  };
  const registrationLocked = tournament.status === "live" || tournament.status === "completed";

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
          {role === "student" && (
            <div className="flex flex-wrap gap-2">
              {!joined ? (
                <form action={joinTournament}>
                  <input type="hidden" name="id" value={params.id} />
                  <button disabled={registrationLocked} className="h-10 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white disabled:bg-slate-300">{registrationLocked ? "Registration Locked" : "Join Tournament"}</button>
                </form>
              ) : (
                <>
                  <div className="inline-flex h-10 items-center rounded-md bg-emerald-50 px-4 text-sm font-semibold text-emerald-700">Registered</div>
                  {!registrationLocked ? (
                    <form action={leaveTournament}>
                      <input type="hidden" name="id" value={params.id} />
                      <button className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Leave Tournament</button>
                    </form>
                  ) : null}
                </>
              )}
            </div>
          )}
          {role === "admin" && (
            <form action={createExternalInvite}>
              <input type="hidden" name="id" value={params.id} />
              <button className="inline-flex h-10 items-center gap-2 rounded-md bg-purple-700 px-4 text-sm font-semibold text-white">
                {tournament.externalInvite?.enabled ? <RefreshCcw size={15} /> : <Link2 size={15} />}
                {tournament.externalInvite?.enabled ? "Regenerate External Link" : "Create External Link"}
              </button>
            </form>
          )}
        </div>
        {role === "admin" && tournament.externalInvite?.enabled && (
          <div className="mt-5 rounded-md border border-purple-100 bg-purple-50 p-4">
            <div className="mb-2 text-sm font-semibold text-purple-900">External tournament invite</div>
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <label className="text-xs font-medium text-purple-900">
                Share link
                <input readOnly className="mt-1 h-10 w-full rounded-md border border-purple-200 bg-white px-3 text-sm text-slate-950" value={externalInviteUrl} />
              </label>
              <label className="text-xs font-medium text-purple-900">
                Password
                <input readOnly className="mt-1 h-10 w-full rounded-md border border-purple-200 bg-white px-3 text-sm font-semibold text-slate-950" value={tournament.externalInvite.password || ""} />
              </label>
            </div>
            <p className="mt-2 text-xs text-purple-800">Anyone with this link can join using a username and this password. Regenerating creates a new link and password.</p>
          </div>
        )}
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Tournament Type</div><b>{tournament.type === "arena" ? "Arena" : "Swiss"}</b></div>
          <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Start Date & Time</div><b>{new Date(tournament.startAt).toLocaleString("en-IN")}</b></div>
          <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Time Control</div><b>{tournament.timeControlMinutes}+{tournament.incrementSeconds}</b></div>
          <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Lifecycle</div><b>{prettyStatus(tournament.status)}</b></div>
          <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Play Access</div><b>{accessState(tournament.status)}</b></div>
          {tournament.type === "arena" && <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Arena Duration</div><b>{tournament.arenaDurationMinutes} minutes</b></div>}
          {tournament.type === "swiss" && <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Rounds</div><b>{tournament.rounds}</b></div>}
          <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Starting Position</div><b>{tournament.startingPosition?.type === "custom" ? "Custom Position" : "Normal Starting Position"}</b></div>
          <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">Participants</div><b>{(tournament.participants?.length || 0) + (tournament.externalParticipants?.length || 0)}</b></div>
        </div>
      </div>
      <div className="mt-4">
        <TournamentDetailClient tournamentId={params.id} role={role || "student"} initialState={initialState} />
      </div>
      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Participants</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {(tournament.participants || []).map((student: any) => <div key={student._id.toString()} className="rounded-md bg-slate-50 px-3 py-2 text-sm">{student.name}</div>)}
          {(tournament.externalParticipants || []).map((player: any) => <div key={`external-${player.username}`} className="rounded-md bg-purple-50 px-3 py-2 text-sm">{player.username} <span className="text-xs text-purple-700">(external)</span></div>)}
        </div>
        {(!tournament.participants || tournament.participants.length === 0) && (!tournament.externalParticipants || tournament.externalParticipants.length === 0) && <p className="text-sm text-slate-500">No participants have joined yet.</p>}
      </section>
    </div>
  );
}
