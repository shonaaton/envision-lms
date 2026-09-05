"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Clock3,
  Crown,
  Eye,
  Info,
  Send,
  Share2,
  Swords,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { useTournamentSocket } from "@/lib/useTournamentSocket";
import { applyLeaderboardRows, rankOf } from "@/lib/tournament/leaderboard";
import { describeTournament, relativeTime, resolvePlayerAction } from "@/lib/tournament/playerAction";
import { useNow } from "@/lib/useLiveClock";
import { TournamentAdminPanel } from "./TournamentAdminPanel";

type DetailState = {
  tournament: any;
  activeGame: any;
  games: any[];
  myGames: any[];
  liveGames?: any[];
  joined: boolean;
  currentSeat: any;
  participantState?: any;
  roundProgress?: any;
  nextRoundAt?: number | null;
  arenaEndsAt?: string | null;
  tieBreak?: { key: string; label: string } | null;
  maxRounds?: number | null;
  health?: any;
  myPlayerKey?: string;
  canManage: boolean;
  canPlay: boolean;
};

function countdown(ms: number) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resultLabel(game: any) {
  if (!game) return "-";
  if (game.status === "active") return "Playing";
  if (game.status === "aborted") return "Aborted";
  if (game.termination === "bye") return "Bye";
  if (game.result === "1/2-1/2") return "Draw";
  if (game.result === "1-0") return "1-0";
  if (game.result === "0-1") return "0-1";
  return "-";
}

/**
 * The tournament centre.
 *
 * Ordered the way a player reads it: what is happening, what I should do about
 * it, where I stand, what is being played, and only then the details. The
 * arbiter's controls live in one collapsed panel rather than woven through the
 * page, so a student is not shown a wall of buttons they cannot press.
 */
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
  const [chatMessage, setChatMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const autoOpenedGameRef = useRef("");
  const now = useNow(1000);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${tournamentId}/state`, { cache: "no-store" });
    if (!response.ok) return;
    setState(await response.json());
  }, [tournamentId]);

  /* The lobby cares about pairings, standings, rounds and status - never about
     individual moves - so it subscribes to no game room and a move on any board
     costs it nothing. */
  const handlers = useMemo(
    () => ({
      onStandings: (payload: any) =>
        setState((current: any) =>
          current
            ? { ...current, tournament: { ...current.tournament, standings: applyLeaderboardRows(current.tournament?.standings || [], payload.rows || []) } }
            : current
        ),
      onPairingCreated: () => void refresh(),
      onGameEnded: () => void refresh(),
      onRoundStarted: () => void refresh(),
      onRoundCompleted: () => void refresh(),
      onTournamentStatus: () => void refresh(),
      onTournamentEnded: () => void refresh(),
      onResync: () => void refresh(),
    }),
    [refresh]
  );
  const { connected } = useTournamentSocket({ tournamentId, handlers });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A student with a live board belongs at the board, not on this page.
  useEffect(() => {
    const activeGameId = state.activeGame?._id ? String(state.activeGame._id) : "";
    if (role !== "student" || !activeGameId || autoOpenedGameRef.current === activeGameId) return;
    autoOpenedGameRef.current = activeGameId;
    router.push(`/tournaments/${tournamentId}/play`);
  }, [role, router, state.activeGame?._id, tournamentId]);

  const runAction = useCallback(
    async (path: string, body?: any) => {
      setError("");
      startTransition(async () => {
        const response = await fetch(path, {
          method: "POST",
          ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          setError(payload?.error || "Could not update the tournament.");
          return;
        }
        await refresh();
        router.refresh();
      });
    },
    [refresh, router]
  );

  const patchTournament = useCallback(
    async (body: any) => {
      setError("");
      const response = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error || "Could not update the tournament.");
        return false;
      }
      await refresh();
      return true;
    },
    [refresh, tournamentId]
  );

  async function submitChat() {
    const message = chatMessage.trim();
    if (!message) return;
    setError("");
    const response = await fetch(`/api/tournaments/${tournamentId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Could not send that message.");
      return;
    }
    setChatMessage("");
    await refresh();
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: tournament?.name || "Tournament", url }).catch(() => null);
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => null);
  }

  // Memoised: a fresh `|| {}` every render would defeat the memos beneath it,
  // recomputing the summary and the player's next step on every clock tick.
  const tournament = useMemo(() => state?.tournament || {}, [state?.tournament]);
  const summary = useMemo(() => describeTournament(tournament), [tournament]);
  const standings = useMemo(() => (Array.isArray(tournament?.standings) ? tournament.standings : []), [tournament?.standings]);
  const rounds = Array.isArray(tournament?.roundsData) ? tournament.roundsData : [];
  const activeRound = rounds.find((round: any) => round.status !== "completed") || null;
  const myPlayerKey = state.myPlayerKey || "";
  const myStanding = standings.find((entry: any) => entry.playerKey === myPlayerKey) || null;
  const myRank = rankOf(standings, myPlayerKey);
  const isPlaying = ["live", "playing"].includes(String(tournament.status || ""));
  const isFinished = ["completed", "finished"].includes(String(tournament.status || ""));
  const liveGames = state.liveGames || (state.games || []).filter((game: any) => game.status === "active");
  const tieBreak = state.tieBreak || null;

  const action = useMemo(
    () =>
      resolvePlayerAction({
        tournamentId,
        status: String(tournament.status || ""),
        type: tournament.type === "arena" ? "arena" : "swiss",
        joined: Boolean(state.joined),
        canPlay: Boolean(state.canPlay),
        hasActiveGame: Boolean(state.activeGame),
        participantStatus: state.participantState?.status,
        roundProgress: state.roundProgress,
        nextRoundAt: state.nextRoundAt,
        lateJoiningAllowed: tournament.lateJoiningAllowed,
        now,
      }),
    [tournamentId, tournament.status, tournament.type, tournament.lateJoiningAllowed, state, now]
  );

  const arenaMsLeft = state.arenaEndsAt && isPlaying ? Math.max(0, new Date(state.arenaEndsAt).getTime() - now) : 0;
  const startsIn = !isPlaying && !isFinished && tournament.startAt ? new Date(tournament.startAt).getTime() - now : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6 lg:px-8">
      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* 1. Status. What is this event, and where is it up to. */}
      <header className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-950 sm:text-2xl">{tournament.name || "Tournament"}</h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${
                  summary.tone === "live"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                    : summary.tone === "cancelled"
                      ? "bg-red-50 text-red-600 ring-red-500/20"
                      : "bg-slate-100 text-slate-600 ring-slate-500/15"
                }`}
              >
                {summary.statusLabel}
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${connected ? "text-emerald-600" : "text-amber-600"}`}>
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span className="hidden sm:inline">{connected ? "Live" : "Reconnecting"}</span>
              </span>
            </div>
            {tournament.description ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{tournament.description}</p> : null}
          </div>
          <button type="button" onClick={share} className="btn-ghost min-h-11" aria-label="Share this tournament">
            <Share2 size={15} aria-hidden /> Share
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat icon={<Swords size={14} />} label="Format" value={summary.format} />
          <Stat icon={<Clock3 size={14} />} label="Time control" value={summary.timeControl} />
          <Stat icon={<Users size={14} />} label="Players" value={String(summary.participants)} />
          <Stat
            icon={<Timer size={14} />}
            label={arenaMsLeft ? "Ends in" : startsIn > 0 ? "Starts" : "Started"}
            value={
              arenaMsLeft
                ? countdown(arenaMsLeft)
                : startsIn > 0
                  ? relativeTime(tournament.startAt, now)
                  : tournament.startAt
                    ? new Date(tournament.startAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "-"
            }
          />
        </dl>
      </header>

      {/* 2. My current action. Exactly one, whatever the state. */}
      <section
        className={`card flex flex-wrap items-center gap-3 ${action.emphasis === "primary" ? "border-brand/25 bg-brand-50/40" : ""}`}
        aria-label="Your next step"
      >
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-950">{action.label}</p>
          {action.hint ? <p className="mt-0.5 text-sm text-slate-600">{action.hint}</p> : null}
          {myStanding ? (
            <p className="mt-1 text-xs tabular-nums text-slate-500">
              You are #{myRank} on {myStanding.points} point{myStanding.points === 1 ? "" : "s"} from {myStanding.gamesPlayed} game
              {myStanding.gamesPlayed === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {action.kind === "join" ? (
            <button type="button" disabled={pending} onClick={() => runAction(`/api/tournaments/${tournamentId}/join`)} className="btn-primary min-h-11">
              <Trophy size={15} aria-hidden /> {action.label}
            </button>
          ) : action.href ? (
            <Link href={action.href} className={action.emphasis === "primary" ? "btn-primary min-h-11" : "btn-outline min-h-11"}>
              <Swords size={15} aria-hidden /> {action.kind === "rejoin" ? "Rejoin game" : "Open play room"}
            </Link>
          ) : null}
          {state.joined && !isPlaying && !isFinished ? (
            <button type="button" disabled={pending} onClick={() => runAction(`/api/tournaments/${tournamentId}/withdraw`)} className="btn-ghost min-h-11">
              Withdraw
            </button>
          ) : null}
        </div>
      </section>

      {/* 3. Where everyone stands. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {isFinished && standings.length ? <Podium standings={standings} /> : null}

          <section className="card">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="font-semibold text-slate-950">Standings</h2>
              {tieBreak ? <span className="text-xs text-slate-400">Ties broken on {tieBreak.label}</span> : null}
            </div>
            {standings.length ? (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-slate-400">
                      <th scope="col" className="px-1 py-1.5 font-bold">#</th>
                      <th scope="col" className="px-1 py-1.5 font-bold">Player</th>
                      <th scope="col" className="px-1 py-1.5 text-right font-bold">Pts</th>
                      <th scope="col" className="px-1 py-1.5 text-right font-bold">W/D/L</th>
                      {tieBreak ? (
                        <th scope="col" className="px-1 py-1.5 text-right font-bold" title={tieBreak.label}>
                          TB
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {standings.slice(0, 60).map((entry: any, index: number) => (
                      <tr key={entry.playerKey} className={entry.playerKey === myPlayerKey ? "bg-brand-50/60" : ""}>
                        <td className="px-1 py-2 text-xs font-bold tabular-nums text-slate-400">
                          {index === 0 ? <Crown size={13} className="text-accent-500" aria-label="Leader" /> : index + 1}
                        </td>
                        <td className="max-w-0 truncate px-1 py-2 font-medium text-slate-800">
                          {entry.displayName}
                          {entry.onStreak ? <span className="ml-1.5 text-[11px] font-bold text-orange-600">2x</span> : null}
                        </td>
                        <td className="px-1 py-2 text-right font-semibold tabular-nums text-slate-900">{entry.points}</td>
                        <td className="px-1 py-2 text-right text-xs tabular-nums text-slate-500">
                          {entry.wins}/{entry.draws}/{entry.losses}
                        </td>
                        {tieBreak ? (
                          <td className="px-1 py-2 text-right text-xs tabular-nums text-slate-400">
                            {Number(entry[tieBreak.key] || 0).toFixed(1)}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">Standings appear once the first games finish.</p>
            )}
          </section>

          {/* Swiss pairings for the round in progress. */}
          {activeRound?.pairings?.length ? (
            <section className="card">
              <h2 className="mb-3 font-semibold text-slate-950">Round {activeRound.roundNumber} pairings</h2>
              <ol className="divide-y divide-slate-100">
                {activeRound.pairings.map((pairing: any) => (
                  <li key={`${pairing.tableNumber}-${pairing.whiteKey}`} className="flex items-center gap-2 py-2 text-sm">
                    <span className="w-6 shrink-0 text-right text-xs font-bold tabular-nums text-slate-400">{pairing.tableNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {pairing.whiteName} <span className="text-slate-400">vs</span> {pairing.blackName || "Bye"}
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">{pairing.result}</span>
                    {pairing.gameId && pairing.status !== "completed" ? (
                      <Link
                        href={`/tournaments/${tournamentId}/games/${pairing.gameId}`}
                        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand hover:bg-brand-50"
                      >
                        <Eye size={13} aria-hidden /> Watch
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        {/* 4. What is being played, then 5. the details. */}
        <aside className="space-y-4">
          <section className="card">
            <h2 className="mb-2 font-semibold text-slate-950">Live boards</h2>
            {liveGames.length ? (
              <ol className="divide-y divide-slate-100">
                {liveGames.slice(0, 10).map((game: any) => (
                  <li key={String(game._id)} className="flex items-center gap-2 py-2 text-sm">
                    <span className="w-6 shrink-0 text-right text-xs font-bold tabular-nums text-slate-400">{game.tableNumber || "-"}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {game.whiteName} <span className="text-slate-400">vs</span> {game.blackName || "Bye"}
                    </span>
                    <Link
                      href={`/tournaments/${tournamentId}/games/${game._id}`}
                      className="inline-flex h-9 shrink-0 items-center rounded-lg px-2 text-xs font-semibold text-brand hover:bg-brand-50"
                    >
                      Watch
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-4 text-center text-sm text-slate-400">{isPlaying ? "No boards running right now." : "Boards appear when the tournament starts."}</p>
            )}
          </section>

          {state.myGames?.length ? (
            <section className="card">
              <h2 className="mb-2 font-semibold text-slate-950">Your games</h2>
              <ol className="divide-y divide-slate-100">
                {state.myGames.slice(0, 8).map((game: any) => (
                  <li key={String(game._id)} className="flex items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {game.whiteName} <span className="text-slate-400">vs</span> {game.blackName || "Bye"}
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">{resultLabel(game)}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {tournament.chatEnabled ? (
            <section className="card">
              <h2 className="mb-2 font-semibold text-slate-950">Tournament chat</h2>
              <ol className="mb-2 max-h-48 space-y-1.5 overflow-y-auto overscroll-contain text-sm">
                {(tournament.chatMessages || [])
                  .filter((message: any) => !message.hidden)
                  .slice(-40)
                  .map((message: any, index: number) => (
                    <li key={`${message.createdAt}-${index}`}>
                      <span className="font-semibold text-slate-700">{message.senderName}</span>{" "}
                      <span className="text-slate-600">{message.message}</span>
                    </li>
                  ))}
                {!(tournament.chatMessages || []).length ? <li className="text-slate-400">No messages yet.</li> : null}
              </ol>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitChat();
                }}
              >
                <input
                  className="input"
                  value={chatMessage}
                  onChange={(event) => setChatMessage(event.target.value)}
                  placeholder="Say something"
                  aria-label="Chat message"
                  maxLength={500}
                />
                <button type="submit" disabled={!chatMessage.trim()} className="btn-primary min-h-11 disabled:opacity-50" aria-label="Send message">
                  <Send size={15} aria-hidden />
                </button>
              </form>
            </section>
          ) : null}

          <section className="card">
            <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-slate-950">
              <Info size={15} className="text-slate-400" aria-hidden /> How this event works
            </h2>
            <ul className="space-y-1.5 text-sm text-slate-600">
              <li>
                {tournament.type === "arena"
                  ? "Arena: you are paired again as soon as each game ends, for the whole duration. Win two in a row and the games after that score double."
                  : `Swiss: ${tournament.rounds || 0} rounds, everyone plays once per round, and the next round starts when every board has finished.`}
              </li>
              <li>Win 1, draw &frac12;, loss 0{tournament.type === "arena" ? ", doubled for Arena points." : "."}</li>
              {tieBreak ? <li>Ties are broken on {tieBreak.label}.</li> : null}
              {tournament.allowBerserk && tournament.type === "arena" ? <li>Berserk is on: halve your clock before your first move for an extra point if you win.</li> : null}
              {tournament.lateJoiningAllowed === false ? <li>Late entry is not allowed once the tournament starts.</li> : null}
              {state.maxRounds && tournament.rounds > state.maxRounds ? (
                <li className="text-amber-700">
                  Scheduled for {tournament.rounds} rounds, but {summary.participants} players can only fill {state.maxRounds} without a repeat pairing.
                </li>
              ) : null}
              {tournament.entryRestrictions ? <li>{tournament.entryRestrictions}</li> : null}
            </ul>
          </section>
        </aside>
      </div>

      {/* The arbiter's surface: one panel, only for people who can use it. */}
      {state.canManage ? (
        <TournamentAdminPanel
          tournamentId={tournamentId}
          tournament={tournament}
          games={state.games || []}
          standings={standings}
          pending={pending}
          onAction={runAction}
          onPatch={patchTournament}
          onRefresh={refresh}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
        <span className="text-slate-400" aria-hidden>
          {icon}
        </span>
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-semibold tabular-nums text-slate-950">{value}</dd>
    </div>
  );
}

function Podium({ standings }: { standings: any[] }) {
  const top = standings.slice(0, 3);
  if (!top.length) return null;
  const medals = ["bg-accent-300 text-brand-900", "bg-slate-200 text-slate-700", "bg-orange-200 text-orange-900"];
  return (
    <section className="card">
      <h2 className="mb-3 font-semibold text-slate-950">Final placings</h2>
      <ol className="grid gap-2 sm:grid-cols-3">
        {top.map((entry: any, index: number) => (
          <li key={entry.playerKey} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${medals[index]}`}>{index + 1}</span>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-slate-900">{entry.displayName}</span>
              <span className="text-xs tabular-nums text-slate-500">{entry.points} pts</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
