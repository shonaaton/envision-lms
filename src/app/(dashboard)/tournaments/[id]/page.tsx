import { auth } from "@/lib/auth";
import { dbConnect } from "@/lib/db";
import { inactiveStudentMessage } from "@/lib/studentAccess";
import { Tournament } from "@/models/Tournament";
import { User } from "@/models/User";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Link2, Trophy } from "lucide-react";
import { TournamentDetailClient } from "@/components/tournaments/TournamentDetailClient";
import { TournamentGame } from "@/models/TournamentGame";
import { playerKeyForUser } from "@/lib/tournamentEngine";

export const dynamic = "force-dynamic";

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

export default async function TournamentDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  await dbConnect();
  const tournament: any = await Tournament.findById(params.id).populate("participants", "name username rating").lean();
  if (!tournament) redirect("/tournaments");
  const currentStudent = role === "student" && userId ? await User.findById(userId).select("role isActive").lean() : null;
  const isInactiveStudent = role === "student" && ((currentStudent as any)?.role !== "student" || (currentStudent as any)?.isActive === false);
  if (isInactiveStudent) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 font-semibold text-amber-900"><Trophy size={18} /> Tournament access paused</div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-800">{inactiveStudentMessage}</p>
        </div>
      </div>
    );
  }
  const allowed = role === "admin" || role === "instructor" || tournament.access?.allActiveStudents || (tournament.access?.users || []).map((id: any) => id.toString()).includes(userId) || (tournament.participants || []).some((p: any) => p._id?.toString() === userId);
  if (!allowed) return <div className="p-6">You do not have access to this tournament.</div>;
  const joined = (tournament.participants || []).some((p: any) => p._id?.toString() === userId);
  const myPlayerKey = playerKeyForUser(String(userId || ""));
  const participantState = (tournament.participantStates || []).find((entry: any) => entry.playerKey === myPlayerKey) || null;
  const host = headers().get("host");
  const protocol = headers().get("x-forwarded-proto") || "https";
  const externalInviteUrl = tournament.externalInvite?.token ? `${protocol}://${host}/tournament-join/${tournament.externalInvite.token}` : "";
  const games = await TournamentGame.find({ tournament: params.id }).sort({ createdAt: -1 }).lean();
  const activeGame =
    games.find((game: any) => game.status === "active" && [game.whiteUser?.toString?.(), game.blackUser?.toString?.()].includes(String(userId))) || null;
  const myGames = games.filter((game: any) => [game.whiteUser?.toString?.(), game.blackUser?.toString?.()].includes(String(userId))).slice(0, 10);
  const activeGames = games.filter((game: any) => game.status === "active");
  const initialState = {
    tournament: toPlain(tournament),
    activeGame: activeGame ? toPlain(activeGame) : null,
    games: toPlain(games.slice(0, 25)),
    myGames: toPlain(myGames),
    featuredGame: activeGames[0] ? toPlain(activeGames[0]) : null,
    topGames: toPlain(activeGames.slice(0, 8)),
    joined,
    currentSeat: toPlain(buildCurrentSeat({ userId: String(userId || ""), joined, tournament, activeGame, myGames })),
    participantState: toPlain(participantState),
    canManage: role === "admin",
    canPlay: (role === "student" && !isInactiveStudent) || role === "admin",
  };
  /**
   * The page is a shell: access, the initial payload, and the invite link an
   * arbiter needs. Everything a player reads - status, their next step,
   * standings, boards, information - is the client's, which used to duplicate
   * a header, a join button and a nine-tile stat grid rendered here as well.
   */
  return (
    <div>
      {role === "admin" && externalInviteUrl ? (
        <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 lg:px-8">
          <div className="card border-brand/20 bg-brand-50/50">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-700">
              <Link2 size={15} aria-hidden /> External invitation link
            </h2>
            <p className="mt-1 text-xs text-brand-700/80">
              Anyone with this link can enter with a username{tournament.externalInvite?.accessMode === "password" ? " and the password below" : ""}.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_200px]">
              <label className="block text-xs font-semibold text-brand-700">
                Link
                <input readOnly className="input mt-1" value={externalInviteUrl} onFocus={(event) => event.currentTarget.select()} />
              </label>
              {tournament.externalInvite?.accessMode === "password" ? (
                <label className="block text-xs font-semibold text-brand-700">
                  Password
                  <input readOnly className="input mt-1 font-semibold" value={tournament.externalInvite.password || ""} />
                </label>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <TournamentDetailClient tournamentId={params.id} role={role || "student"} initialState={initialState} />
    </div>
  );
}
