"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Crown, Download, Play, RefreshCcw, Shield, Swords, Trophy } from "lucide-react";

type DetailState = {
  tournament: any;
  activeGame: any;
  games: any[];
  myGames: any[];
  joined: boolean;
  currentSeat: any;
  canManage: boolean;
  canPlay: boolean;
};

function statusChip(status: string) {
  if (status === "live") return "bg-emerald-50 text-emerald-700";
  if (status === "completed") return "bg-slate-100 text-slate-700";
  return "bg-amber-50 text-amber-700";
}

function exportCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function resultLabel(game: any) {
  if (!game) return "-";
  if (game.status === "active") return "In progress";
  if (game.termination === "bye") return "Bye";
  if (game.termination === "resign") return "Resigned";
  if (game.result === "1/2-1/2") return "Draw";
  return game.result || "-";
}

function seatStatusLabel(seat: any, tournamentStatus: string) {
  if (!seat) return "Waiting";
  if (seat.status === "not_joined") return "Join required";
  if (seat.status === "active") return "Board live";
  if (seat.status === "assigned") return "Assigned";
  if (seat.status === "completed") return tournamentStatus === "completed" ? "Tournament finished" : "Round finished";
  if (seat.status === "waiting") return "Waiting";
  if (seat.status === "joined") return "Ready";
  return "Waiting";
}

export function TournamentDetailClient({
  tournamentId,
  role,
  initialState,
}: {
  tournamentId: string;
  role: string;
  initialState: DetailState;
}) {
  const router = useRouter();
  const [state, setState] = useState<DetailState>(initialState);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${tournamentId}/state`, { cache: "no-store" });
    if (!response.ok) return;
    setState(await response.json());
  }, [tournamentId]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function runAction(path: string) {
    setError("");
    startTransition(async () => {
      const response = await fetch(path, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error || "Could not update tournament.");
        return;
      }
      await refresh();
      router.refresh();
    });
  }

  const tournament = state?.tournament || {};
  const standings = Array.isArray(tournament?.standings) ? tournament.standings : [];
  const rounds = Array.isArray(tournament?.roundsData) ? tournament.roundsData : [];
  const activeRound = rounds.find((round: any) => round.status !== "completed");
  const completedGames = (state.games || []).filter((game: any) => game.status === "completed");
  const totalGames = (state.games || []).length;
  const currentSeat = state.currentSeat || null;
  const standingsRows = standings.map((entry: any, index: number) => [
    index + 1,
    entry.displayName,
    entry.points,
    entry.wins,
    entry.draws,
    entry.losses,
    entry.buchholz,
    entry.gamesPlayed,
  ]);
  const gamesRows = (state.games || []).map((game: any) => [
    game.roundNumber || (tournament.type === "arena" ? "Arena" : "-"),
    game.tableNumber || "-",
    game.whiteName,
    game.blackName || "Bye",
    resultLabel(game),
    game.termination || "",
    game.moveHistorySAN?.length || 0,
  ]);
  const activeBoards = (state.games || []).filter((game: any) => game.status === "active").length;
  const registrationLocked = tournament.status === "live" || tournament.status === "completed";

  return (
    <div className="space-y-3 sm:space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr] xl:gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusChip(tournament.status)}`}>{tournament.status}</span>
                <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">{tournament.type === "arena" ? "Arena" : "Swiss"}</span>
                {tournament.currentRound ? (
                  <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                    {tournament.type === "swiss" ? `Round ${tournament.currentRound}` : "Arena Running"}
                  </span>
                ) : null}
              </div>
              <h2 className="text-lg font-semibold text-slate-950 sm:text-xl">Tournament control room</h2>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">Start the event, create rounds, and send players into live games.</p>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {state.canManage && standings.length ? (
                <button
                  type="button"
                  onClick={() => exportCsv(
                    `${String(tournament.name || "tournament").replace(/\s+/g, "-").toLowerCase()}-standings.csv`,
                    ["Rank", "Player", "Points", "Wins", "Draws", "Losses", "Buchholz", "Games Played"],
                    standingsRows
                  )}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Download size={15} /> Export Standings
                </button>
              ) : null}
              {state.canManage && state.games?.length ? (
                <button
                  type="button"
                  onClick={() => exportCsv(
                    `${String(tournament.name || "tournament").replace(/\s+/g, "-").toLowerCase()}-games.csv`,
                    ["Round", "Board", "White", "Black", "Result", "Termination", "Moves"],
                    gamesRows
                  )}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Download size={15} /> Export Games
                </button>
              ) : null}
              {state.canManage && tournament.status !== "live" && tournament.status !== "completed" ? (
                <button
                  disabled={pending}
                  onClick={() => runAction(`/api/tournaments/${tournamentId}/start`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-purple-700 px-3 text-xs font-semibold text-white shadow-sm sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Play size={15} /> Start Tournament
                </button>
              ) : null}
              {state.canManage && tournament.type === "swiss" && tournament.status === "live" ? (
                <button
                  disabled={pending}
                  onClick={() => runAction(`/api/tournaments/${tournamentId}/next-round`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm"
                >
                  <RefreshCcw size={15} /> Next Round
                </button>
              ) : null}
              {state.canManage && tournament.status === "live" ? (
                <button
                  disabled={pending}
                  onClick={() => runAction(`/api/tournaments/${tournamentId}/end`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Shield size={15} /> End Tournament
                </button>
              ) : null}
              {(role === "student" || role === "admin") && (state.activeGame || tournament.status === "live") ? (
                <Link
                  href={`/tournaments/${tournamentId}/play`}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-slate-950 px-3 text-xs font-semibold text-white sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Swords size={15} /> {state.activeGame ? "Resume Game" : "Enter Play Room"}
                </Link>
              ) : null}
            </div>
          </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 xl:grid-cols-4">
            <StatCard icon={<Trophy size={16} />} label="Participants" value={String((tournament.participants?.length || 0) + (tournament.externalParticipants?.length || 0))} />
            <StatCard icon={<Clock3 size={16} />} label="Time Control" value={`${tournament.timeControlMinutes}+${tournament.incrementSeconds}`} />
            <StatCard icon={<Crown size={16} />} label="Live Games" value={String((state.games || []).filter((game: any) => game.status === "active").length)} />
            <StatCard icon={<RefreshCcw size={16} />} label={tournament.type === "swiss" ? "Rounds" : "Arena Ends"} value={tournament.type === "swiss" ? `${tournament.currentRound || 0}/${tournament.rounds || 0}` : tournament.arenaEndsAt ? new Date(tournament.arenaEndsAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "-"} />
            <StatCard icon={<Trophy size={16} />} label="Completed Games" value={String(completedGames.length)} />
            <StatCard icon={<Clock3 size={16} />} label="Recorded Games" value={String(totalGames)} />
            <StatCard icon={<Shield size={16} />} label="Registration" value={registrationLocked ? "Locked" : "Open"} />
            <StatCard icon={<Play size={16} />} label="Boards Ready" value={String(activeBoards)} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <h3 className="text-base font-semibold text-slate-950">My tournament seat</h3>
            <div className="mt-3 space-y-3">
            {!state.joined && role === "student" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm font-semibold text-amber-900">Join this tournament to receive your board assignment.</div>
                <div className="mt-1 text-sm text-amber-800">Once you join, your opponent, color, board number, and round status will appear here automatically.</div>
              </div>
            ) : state.activeGame ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-sm font-semibold text-emerald-800">You have a live board ready.</div>
                <div className="mt-1 text-sm text-emerald-700">
                  {state.activeGame.whiteName} vs {state.activeGame.blackName}
                </div>
                <Link href={`/tournaments/${tournamentId}/play`} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white">
                  <Play size={15} /> Open Game Room
                </Link>
              </div>
            ) : currentSeat ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">My current assignment</div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {seatStatusLabel(currentSeat, tournament.status)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <SeatTile label="Round" value={currentSeat.roundNumber || "-"} />
                  <SeatTile label="Board" value={currentSeat.boardNumber || "-"} />
                  <SeatTile label="Color" value={currentSeat.color ? `${String(currentSeat.color).charAt(0).toUpperCase()}${String(currentSeat.color).slice(1)}` : "-"} />
                  <SeatTile label="Opponent" value={currentSeat.opponentName || "-"} />
                </div>
                <div className="mt-3 text-sm text-slate-600">
                  {currentSeat.status === "completed"
                    ? "Your current round is already finished. Stand by for the next pairing or review your game history below."
                    : currentSeat.status === "waiting"
                      ? "You are in the tournament and waiting for your next opponent assignment."
                      : currentSeat.status === "joined"
                        ? "You are registered and ready. Your board will appear here when the tournament starts."
                        : "Your seat is ready. Open the play room once the board goes live."}
                </div>
                {state.canPlay && tournament.status === "live" ? (
                  <Link
                    href={`/tournaments/${tournamentId}/play`}
                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white"
                  >
                    <Play size={15} /> {state.activeGame ? "Resume board" : currentSeat.status === "assigned" ? "Open play room" : "Check pairing room"}
                  </Link>
                ) : null}
              </div>
            ) : tournament.status === "live" ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No active board is assigned right now. If this is an arena event, the next pairing appears here automatically.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                The tournament is not live yet. Once it starts, your pairing and game room will appear here.
              </div>
            )}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 text-sm font-semibold text-slate-900">Recent games</div>
              <div className="space-y-2">
                {(state.myGames || []).slice(0, 4).map((game: any) => (
                  <div key={String(game._id)} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span>{game.whiteName} vs {game.blackName}</span>
                    <span className="font-semibold text-slate-700">{resultLabel(game)}</span>
                  </div>
                ))}
                {!state.myGames?.length ? <div className="text-sm text-slate-500">No game history yet.</div> : null}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr] xl:gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-950">Standings</h3>
            <span className="text-xs text-slate-500">Updates automatically as games finish</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-3">#</th>
                  <th className="px-2 py-3">Player</th>
                  <th className="px-2 py-3">Pts</th>
                  <th className="px-2 py-3">W</th>
                  <th className="px-2 py-3">D</th>
                  <th className="px-2 py-3">L</th>
                  <th className="px-2 py-3">BH</th>
                  <th className="px-2 py-3">Games</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((entry: any, index: number) => (
                  <tr key={entry.playerKey} className="border-b last:border-0">
                    <td className="px-2 py-3 font-semibold text-purple-700">#{index + 1}</td>
                    <td className="px-2 py-3 font-medium text-slate-900">{entry.displayName}</td>
                    <td className="px-2 py-3">{entry.points}</td>
                    <td className="px-2 py-3">{entry.wins}</td>
                    <td className="px-2 py-3">{entry.draws}</td>
                    <td className="px-2 py-3">{entry.losses}</td>
                    <td className="px-2 py-3">{entry.buchholz}</td>
                    <td className="px-2 py-3">{entry.gamesPlayed}</td>
                  </tr>
                ))}
                {!standings.length ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-8 text-center text-sm text-slate-500">Standings appear once the field is ready.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-950">{tournament.type === "swiss" ? "Round overview" : "Active pairings"}</h3>
            {activeRound ? <span className="text-xs text-slate-500">Round {activeRound.roundNumber}</span> : null}
          </div>
          <div className="space-y-3">
            {(tournament.type === "swiss" ? rounds.slice().reverse() : state.games.filter((game: any) => game.status === "active")).slice(0, 6).map((item: any) =>
              tournament.type === "swiss" ? (
                <div key={`round-${item.roundNumber}`} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-900">Round {item.roundNumber}</div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusChip(item.status === "live" ? "live" : item.status === "completed" ? "completed" : "upcoming")}`}>{item.status}</span>
                  </div>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    {(item.pairings || []).slice(0, 6).map((pairing: any) => (
                      <div key={String(pairing.gameId || `${pairing.whiteKey}-${pairing.blackKey}`)} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                        <span>{pairing.whiteName} vs {pairing.blackName || "Bye"}</span>
                        <span className="font-semibold text-slate-700">{pairing.result === "*" ? "Live" : pairing.result}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={String(item._id)} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm">
                  <span className="font-medium text-slate-900">{item.whiteName} vs {item.blackName}</span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Board live</span>
                </div>
              )
            )}
            {!(tournament.type === "swiss" ? rounds.length : state.games.filter((game: any) => game.status === "active").length) ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                Pairings will appear here once the tournament starts.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 sm:p-4">
      <div className="flex items-center gap-1.5 text-slate-500 sm:gap-2">{icon}<span className="text-[10px] font-semibold uppercase tracking-wide sm:text-xs">{label}</span></div>
      <div className="mt-1 truncate text-base font-semibold text-slate-950 sm:mt-2 sm:text-xl">{value}</div>
    </div>
  );
}

function SeatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 sm:px-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-[11px] sm:tracking-[0.14em]">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-950 sm:mt-1">{value}</div>
    </div>
  );
}
