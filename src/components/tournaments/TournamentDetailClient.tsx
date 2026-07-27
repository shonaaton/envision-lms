"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Clock3, Crown, Download, MessageSquare, Play, RefreshCcw, Search, Share2, Shield, Swords, Trophy, X } from "lucide-react";
import { useTournamentSocket } from "@/lib/useTournamentSocket";

type DetailState = {
  tournament: any;
  activeGame: any;
  games: any[];
  myGames: any[];
  featuredGame?: any;
  topGames?: any[];
  joined: boolean;
  currentSeat: any;
  participantState?: any;
  health?: any;
  canManage: boolean;
  canPlay: boolean;
};

function statusChip(status: string) {
  if (["live", "playing"].includes(status)) return "bg-emerald-50 text-emerald-700";
  if (["completed", "finished"].includes(status)) return "bg-slate-100 text-slate-700";
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

function pointsEarnedFor(game: any, playerKey: string, tournament: any) {
  if (!game || game.status !== "completed") return 0;
  const isWhite = game.whiteKey === playerKey;
  const won = (isWhite && game.result === "1-0") || (!isWhite && game.result === "0-1");
  const drew = game.result === "1/2-1/2";
  if (game.source === "arena") {
    if (won) return 2 + ((isWhite && game.berserkWhite) || (!isWhite && game.berserkBlack) ? 1 : 0);
    if (drew) {
      const earlyLimit = Number(tournament.earlyDrawMoveLimit ?? 10);
      return earlyLimit > 0 && Number(game.moveHistorySAN?.length || 0) < earlyLimit ? 0 : 1;
    }
    return 0;
  }
  if (won) return 1;
  return drew ? 0.5 : 0;
}

function averageOpponentRating(games: any[], playerKey: string) {
  const ratings = games
    .map((game) => game.whiteKey === playerKey ? Number(game.blackRating || 0) : Number(game.whiteRating || 0))
    .filter((rating) => rating > 0);
  if (!ratings.length) return "-";
  return String(Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length));
}

function performanceLabel(entry: any, tournament: any) {
  const games = Number(entry?.gamesPlayed || 0);
  if (!games) return "-";
  const max = tournament.type === "arena" ? games * 2 : games;
  if (!max) return "-";
  return `${Math.round((Number(entry.points || 0) / max) * 100)}%`;
}

function seatStatusLabel(seat: any, tournamentStatus: string) {
  if (!seat) return "Waiting";
  if (seat.status === "not_joined") return "Join required";
  if (seat.status === "active") return "Board live";
  if (seat.status === "assigned") return "Assigned";
  if (seat.status === "completed") return ["completed", "finished"].includes(tournamentStatus) ? "Tournament finished" : "Round finished";
  if (seat.status === "paused") return "Paused";
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
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayerKey, setSelectedPlayerKey] = useState("");
  const [visibleStandings, setVisibleStandings] = useState(50);
  const [mobileTab, setMobileTab] = useState("info");
  const [editOpen, setEditOpen] = useState(false);
  const [externalOpen, setExternalOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<any>({});
  const [externalDraft, setExternalDraft] = useState<any>({});
  const [announcementDraft, setAnnouncementDraft] = useState({ title: "Tournament announcement", message: "" });
  const [correctionDraft, setCorrectionDraft] = useState<{ gameId: string; label: string; current: string; result: "1-0" | "0-1" | "1/2-1/2"; reason: string } | null>(null);
  const [selectedPlayerDetail, setSelectedPlayerDetail] = useState<any>(null);
  const [selectedPlayerLoading, setSelectedPlayerLoading] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const autoOpenedGameRef = useRef("");

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${tournamentId}/state`, { cache: "no-store" });
    if (!response.ok) return;
    setState(await response.json());
  }, [tournamentId]);
  const { connected, broadcastTournamentUpdate } = useTournamentSocket({
    tournamentId,
    onUpdate: refresh,
  });

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const activeGameId = state.activeGame?._id ? String(state.activeGame._id) : "";
    if (role !== "student" || !activeGameId || autoOpenedGameRef.current === activeGameId) return;
    autoOpenedGameRef.current = activeGameId;
    router.push(`/tournaments/${tournamentId}/play`);
  }, [role, router, state.activeGame?._id, tournamentId]);

  useEffect(() => {
    if (!selectedPlayerKey) {
      setSelectedPlayerDetail(null);
      return;
    }
    let cancelled = false;
    setSelectedPlayerLoading(true);
    setSelectedPlayerDetail(null);
    fetch(`/api/tournaments/${tournamentId}/players/${encodeURIComponent(selectedPlayerKey)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!cancelled) setSelectedPlayerDetail(payload);
      })
      .catch(() => {
        if (!cancelled) setSelectedPlayerDetail(null);
      })
      .finally(() => {
        if (!cancelled) setSelectedPlayerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPlayerKey, tournamentId]);

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
      broadcastTournamentUpdate(path.split("/").pop() || "action");
      router.refresh();
    });
  }

  async function patchTournament(body: any) {
    setError("");
    const response = await fetch(`/api/tournaments/${tournamentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Could not update tournament.");
      return false;
    }
    await refresh();
    broadcastTournamentUpdate("edited");
    return true;
  }

  async function cloneTournament() {
    setError("");
    const response = await fetch(`/api/tournaments/${tournamentId}/clone`, { method: "POST" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Could not clone tournament.");
      return;
    }
    const payload = await response.json();
    if (payload?.tournamentId) window.location.href = `/tournaments/${payload.tournamentId}`;
  }

  async function removeParticipant(playerKey: string) {
    if (!window.confirm("Remove this participant from the tournament?")) return;
    const response = await fetch(`/api/tournaments/${tournamentId}/participants`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerKey }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Could not remove participant.");
      return;
    }
    await refresh();
    broadcastTournamentUpdate("participant_removed");
  }

  async function correctResult() {
    if (!correctionDraft) return;
    const response = await fetch(`/api/tournaments/games/${correctionDraft.gameId}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: correctionDraft.result, reason: correctionDraft.reason || `Corrected from ${correctionDraft.current} to ${correctionDraft.result}.` }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Could not correct result.");
      return;
    }
    setCorrectionDraft(null);
    await refresh();
    broadcastTournamentUpdate("result_corrected");
  }

  async function sendAnnouncement() {
    const response = await fetch(`/api/tournaments/${tournamentId}/announce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(announcementDraft),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Could not send announcement.");
      return;
    }
    setAnnouncementOpen(false);
    setAnnouncementDraft({ title: "Tournament announcement", message: "" });
    await refresh();
    broadcastTournamentUpdate("announcement");
  }

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
      setError(payload?.error || "Could not send chat message.");
      return;
    }
    setChatMessage("");
    await refresh();
    broadcastTournamentUpdate("chat");
  }

  async function shareTournament() {
    const title = tournament?.name || "Tournament";
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => null);
      return;
    }
    await navigator.clipboard?.writeText(url);
  }

  async function analyseMyGames() {
    const response = await fetch(`/api/tournaments/${tournamentId}/my-games/pgn`, { cache: "no-store" });
    if (!response.ok) {
      setError("Could not prepare your games for analysis.");
      return;
    }
    const pgn = await response.text();
    window.sessionStorage.setItem("tournament-analysis-pgn", pgn);
    window.location.href = "/analysis?source=tournament";
  }

  const tournament = state?.tournament || {};
  const standings = Array.isArray(tournament?.standings) ? tournament.standings : [];
  const rounds = Array.isArray(tournament?.roundsData) ? tournament.roundsData : [];
  const activeRound = rounds.find((round: any) => round.status !== "completed");
  const completedGames = (state.games || []).filter((game: any) => game.status === "completed");
  const totalGames = (state.games || []).length;
  const currentSeat = state.currentSeat || null;
  const participantState = state.participantState || null;
  const finalSnapshot = tournament.finalSnapshot || null;
  const podium = finalSnapshot?.podium?.length ? finalSnapshot.podium : standings.slice(0, 3);
  const selectedPlayer = standings.find((entry: any) => entry.playerKey === selectedPlayerKey) || null;
  const selectedPlayerGames = selectedPlayerDetail?.games || (selectedPlayer ? (state.games || []).filter((game: any) => [game.whiteKey, game.blackKey].includes(selectedPlayer.playerKey)) : []);
  const selectedPlayerStats = selectedPlayerDetail?.stats || null;
  const filteredStandings = standings.filter((entry: any) => String(entry.displayName || "").toLowerCase().includes(playerSearch.toLowerCase()));
  const visibleStandingsRows = filteredStandings.slice(0, visibleStandings);
  const isPlaying = ["live", "playing"].includes(String(tournament.status || ""));
  const isFinished = ["completed", "finished"].includes(String(tournament.status || ""));
  const countdownLabel = tournament.arenaEndsAt && isPlaying ? formatCountdown(new Date(tournament.arenaEndsAt).getTime() - Date.now()) : "-";
  const standingsRows = standings.map((entry: any, index: number) => [
    index + 1,
    entry.displayName,
    entry.rating || "",
    entry.points,
    entry.wins,
    entry.draws,
    entry.losses,
    entry.buchholz,
    entry.gamesPlayed,
  ]);
  const activeBoards = Number(state.health?.activeGames ?? (state.games || []).filter((game: any) => game.status === "active").length);
  const queuedPlayers = Number(state.health?.queuedPlayers ?? (tournament.participantStates || []).filter((entry: any) => ["joined", "queued"].includes(entry.status)).length);
  const staleConnections = Number(state.health?.staleConnections ?? (state.games || []).filter((game: any) => game.status === "active" && [game.whiteOnlineAt, game.blackOnlineAt].some((value: any) => value && Date.now() - new Date(value).getTime() > 30_000)).length);
  const latestAudit = (tournament.adminActions || []).slice(-1)[0];
  const registrationLocked = isPlaying || isFinished;
  const isArenaLive = tournament.type === "arena" && isPlaying;
  const canJoinNow = (role === "student" || role === "admin") && !state.joined && !["completed", "finished", "cancelled"].includes(String(tournament.status || "")) && (!registrationLocked || isArenaLive);
  const canWithdrawNow = (role === "student" || role === "admin") && state.joined && !registrationLocked;
  const canPauseNow = (role === "student" || role === "admin") && state.joined && isArenaLive && participantState?.status !== "paused";
  const canResumeNow = (role === "student" || role === "admin") && state.joined && isArenaLive && participantState?.status === "paused";
  const mobileClass = (key: string) => mobileTab === key ? "" : "max-sm:hidden";

  return (
    <div className="space-y-3 sm:space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 text-xs font-semibold sm:hidden">
        {[
          ["info", "Info"],
          ["standings", "Standings"],
          ["games", "Games"],
          ["mine", "My Games"],
          ["chat", "Chat"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setMobileTab(key)} className={`whitespace-nowrap rounded-xl px-3 py-2 ${mobileTab === key ? "bg-purple-700 text-white" : "bg-slate-100 text-slate-700"}`}>{label}</button>
        ))}
      </div>

      <div id="info" className={`${mobileClass("info")} grid gap-3 xl:grid-cols-[1.2fr_0.8fr] xl:gap-4`}>
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusChip(tournament.status)}`}>{tournament.status}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{connected ? "Live socket" : "Connecting"}</span>
                <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">{tournament.type === "arena" ? "Arena" : "Swiss"}</span>
                {tournament.currentRound ? (
                  <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                    {tournament.type === "swiss" ? `Round ${tournament.currentRound}` : "Arena Running"}
                  </span>
                ) : null}
              </div>
              <h2 className="text-lg font-semibold text-slate-950 sm:text-xl">Tournament control room</h2>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">Server automation starts events, advances rounds, pairs players, and finalizes results.</p>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {state.canManage && standings.length ? (
                <button
                  type="button"
                  onClick={() => exportCsv(
                    `${String(tournament.name || "tournament").replace(/\s+/g, "-").toLowerCase()}-standings.csv`,
                    ["Rank", "Player", "Rating", "Points", "Wins", "Draws", "Losses", "Buchholz", "Games Played"],
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
                  onClick={() => { window.location.href = `/api/tournaments/${tournamentId}/games/export`; }}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Download size={15} /> Export Games
                </button>
              ) : null}
              {state.canManage ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditDraft({
                      name: tournament.name || "",
                      description: tournament.description || "",
                      entryRestrictions: tournament.entryRestrictions || "",
                      timeControlMinutes: tournament.timeControlMinutes || 0,
                      incrementSeconds: tournament.incrementSeconds || 0,
                      arenaDurationMinutes: tournament.arenaDurationMinutes || 0,
                      rounds: tournament.rounds || 0,
                      lateJoiningAllowed: tournament.lateJoiningAllowed !== false,
                      chatEnabled: Boolean(tournament.chatEnabled),
                    });
                    setEditOpen(true);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm"
                >
                  Edit
                </button>
              ) : null}
              {state.canManage ? (
                <button
                  type="button"
                  onClick={() => {
                    setExternalDraft({
                      enabled: Boolean(tournament.externalInvite?.enabled),
                      accessMode: tournament.externalInvite?.accessMode || "private",
                      password: tournament.externalInvite?.password || "",
                      entryCode: tournament.externalInvite?.entryCode || "",
                      expiresAt: tournament.externalInvite?.expiresAt ? new Date(tournament.externalInvite.expiresAt).toISOString().slice(0, 16) : "",
                    });
                    setExternalOpen(true);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm"
                >
                  External Access
                </button>
              ) : null}
              {state.canManage ? (
                <button type="button" onClick={() => setAnnouncementOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm">
                  Announce
                </button>
              ) : null}
              {state.canManage ? (
                <button type="button" onClick={cloneTournament} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm">
                  Clone
                </button>
              ) : null}
              {state.canManage && standings.length ? (
                <button
                  type="button"
                  onClick={() => { window.location.href = `/api/tournaments/${tournamentId}/participation-report`; }}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm"
                >
                  <BarChart3 size={15} /> Participation
                </button>
              ) : null}
              {state.canManage && state.games?.length ? (
                <button
                  type="button"
                  onClick={() => { window.location.href = `/api/tournaments/${tournamentId}/fair-play-report`; }}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Shield size={15} /> Fair Play
                </button>
              ) : null}
              {state.canManage ? (
                <span className="inline-flex h-9 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 sm:h-10 sm:px-4 sm:text-sm">
                  Server auto lifecycle
                </span>
              ) : null}
              {state.canManage && isPlaying ? (
                <button
                  disabled={pending}
                  onClick={() => runAction(`/api/tournaments/${tournamentId}/${tournament.pausedByAdmin ? "resume" : "admin-pause"}`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Shield size={15} /> {tournament.pausedByAdmin ? "Resume Pairing" : "Pause Pairing"}
                </button>
              ) : null}
              {state.canManage && !["completed", "finished", "cancelled"].includes(String(tournament.status)) ? (
                <button
                  disabled={pending}
                  onClick={() => runAction(`/api/tournaments/${tournamentId}/cancel`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Shield size={15} /> Cancel
                </button>
              ) : null}
              {(role === "student" || role === "admin") && (state.activeGame || isPlaying) ? (
                <Link
                  href={`/tournaments/${tournamentId}/play`}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-slate-950 px-3 text-xs font-semibold text-white sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Swords size={15} /> {state.activeGame ? "Resume Game" : "Enter Play Room"}
                </Link>
              ) : null}
              {canJoinNow ? (
                <button
                  disabled={pending}
                  onClick={() => runAction(`/api/tournaments/${tournamentId}/join`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Play size={15} /> {isArenaLive ? "Join Queue" : "Join Tournament"}
                </button>
              ) : null}
              {canResumeNow ? (
                <button
                  disabled={pending}
                  onClick={() => runAction(`/api/tournaments/${tournamentId}/join`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Play size={15} /> Resume Arena
                </button>
              ) : null}
              {canPauseNow ? (
                <button
                  disabled={pending}
                  onClick={() => runAction(`/api/tournaments/${tournamentId}/pause`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Shield size={15} /> Pause
                </button>
              ) : null}
              {canWithdrawNow ? (
                <button
                  disabled={pending}
                  onClick={() => runAction(`/api/tournaments/${tournamentId}/withdraw`)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm"
                >
                  <Shield size={15} /> Withdraw
                </button>
              ) : null}
            </div>
          </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 xl:grid-cols-4">
            <StatCard icon={<Trophy size={16} />} label="Participants" value={String((tournament.participants?.length || 0) + (tournament.externalParticipants?.length || 0))} />
            <StatCard icon={<Clock3 size={16} />} label="Time Control" value={`${tournament.timeControlMinutes}+${tournament.incrementSeconds}`} />
            <StatCard icon={<Crown size={16} />} label="Live Games" value={String((state.games || []).filter((game: any) => game.status === "active").length)} />
            <StatCard icon={<RefreshCcw size={16} />} label={tournament.type === "swiss" ? "Rounds" : "Arena Ends"} value={tournament.type === "swiss" ? `${tournament.currentRound || 0}/${tournament.rounds || 0}` : tournament.arenaEndsAt ? new Date(tournament.arenaEndsAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "-"} />
            {tournament.type === "arena" ? <StatCard icon={<Clock3 size={16} />} label="Countdown" value={countdownLabel} /> : null}
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
                    : currentSeat.status === "paused"
                      ? "You are paused. Your completed games and points are preserved, and you can resume when ready."
                    : currentSeat.status === "waiting"
                      ? "You are in the tournament and waiting for your next opponent assignment."
                      : currentSeat.status === "joined"
                        ? "You are registered and ready. Your board will appear here when the tournament starts."
                        : "Your seat is ready. Open the play room once the board goes live."}
                </div>
                {state.canPlay && isPlaying && currentSeat.status !== "paused" ? (
                  <Link
                    href={`/tournaments/${tournamentId}/play`}
                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white"
                  >
                    <Play size={15} /> {state.activeGame ? "Resume board" : currentSeat.status === "assigned" ? "Open play room" : "Check pairing room"}
                  </Link>
                ) : null}
              </div>
            ) : isPlaying ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No active board is assigned right now. If this is an arena event, the next pairing appears here automatically.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                The tournament is not live yet. Once it starts, your pairing and game room will appear here.
              </div>
            )}
            <div id="my-games" className="rounded-xl border border-slate-200 p-4">
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

      <section className={`${mobileClass("mine")} rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:hidden`}>
        <h3 className="mb-3 text-base font-semibold text-slate-950">My games</h3>
        <div className="space-y-2">
          {(state.myGames || []).map((game: any) => (
            <div key={String(game._id)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-900">{game.whiteName} vs {game.blackName || "Bye"}</span>
                <span className="font-semibold text-slate-700">{resultLabel(game)}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{game.moveHistorySAN?.length || 0} moves</div>
            </div>
          ))}
          {!state.myGames?.length ? <div className="text-sm text-slate-500">No games recorded yet.</div> : null}
        </div>
      </section>

      {podium.length && ["completed", "finished", "cancelled"].includes(String(tournament.status)) ? (
        <section id="standings" className={`${mobileClass("standings")} rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-950">Final results</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { window.location.href = `/api/tournaments/${tournamentId}/my-games/pgn`; }}
                className="inline-flex h-8 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700"
              >
                <Download size={14} /> Download PGN
              </button>
              <button
                onClick={() => navigator.clipboard?.writeText(window.location.href)}
                className="inline-flex h-8 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700"
              >
                Copy Link
              </button>
              <button onClick={shareTournament} className="inline-flex h-8 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700">
                <Share2 size={14} /> Share
              </button>
              <button onClick={analyseMyGames} className="inline-flex h-8 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700">
                Analyse My Games
              </button>
              <Link href="/tournaments" className="inline-flex h-8 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white">Directory</Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {podium.map((entry: any, index: number) => (
              <div key={entry.playerKey || index} className="rounded-xl border border-purple-100 bg-purple-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-purple-700">{index === 0 ? "First Place" : index === 1 ? "Second Place" : "Third Place"}</div>
                <div className="mt-2 text-lg font-semibold text-slate-950">{entry.displayName}</div>
                <div className="mt-1 text-sm text-slate-600">{entry.points} pts - {entry.gamesPlayed} games - {performanceLabel(entry, tournament)} performance</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className={`${mobileClass("games")} grid gap-3 xl:grid-cols-[0.9fr_1.1fr] xl:gap-4`}>
        <section id="games" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Crown size={16} className="text-purple-700" />
            <h3 className="text-base font-semibold text-slate-950">Featured game</h3>
          </div>
          {state.featuredGame ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="font-semibold text-slate-950">{state.featuredGame.whiteName} vs {state.featuredGame.blackName}</div>
              <div className="mt-1 text-sm text-slate-500">Board {state.featuredGame.tableNumber || "-"} - {state.featuredGame.moveHistorySAN?.length || 0} moves</div>
              <Link href={`/tournaments/${tournamentId}/games/${state.featuredGame._id}`} className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white">
                <Swords size={14} /> Watch board
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No featured live board yet.</div>
          )}
        </section>
        <section id="chat" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <h3 className="mb-3 text-base font-semibold text-slate-950">Top ongoing games</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {(state.topGames || []).slice(0, 6).map((game: any) => (
              <div key={String(game._id)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <div className="font-medium text-slate-900">{game.whiteName} vs {game.blackName}</div>
                <div className="text-xs text-slate-500">Board {game.tableNumber || "-"} - {game.moveHistorySAN?.length || 0} moves</div>
                <Link href={`/tournaments/${tournamentId}/games/${game._id}`} className="mt-2 inline-flex h-8 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700">Watch</Link>
              </div>
            ))}
            {!(state.topGames || []).length ? <div className="text-sm text-slate-500">No live games right now.</div> : null}
          </div>
        </section>
      </div>

      <div className={`${mobileClass("standings")} grid gap-3 xl:grid-cols-[1.1fr_0.9fr] xl:gap-4`}>
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-950">Standings</h3>
            <label className="relative">
              <Search size={14} className="absolute left-2 top-2.5 text-slate-400" />
              <input value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} className="h-9 rounded-xl border border-slate-200 pl-8 pr-3 text-xs" placeholder="Search player" />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-3">#</th>
                  <th className="px-2 py-3">Player</th>
                  <th className="px-2 py-3">Rating</th>
                  <th className="px-2 py-3">Pts</th>
                  <th className="px-2 py-3">W</th>
                  <th className="px-2 py-3">D</th>
                  <th className="px-2 py-3">L</th>
                  <th className="px-2 py-3">BH</th>
                  <th className="px-2 py-3">Games</th>
                  <th className="px-2 py-3">State</th>
                </tr>
              </thead>
              <tbody>
                {visibleStandingsRows.map((entry: any) => {
                  const index = standings.findIndex((item: any) => item.playerKey === entry.playerKey);
                  const playerState = (tournament.participantStates || []).find((item: any) => item.playerKey === entry.playerKey);
                  const active = (state.games || []).some((game: any) => game.status === "active" && [game.whiteKey, game.blackKey].includes(entry.playerKey));
                  return (
                  <tr key={entry.playerKey} className="cursor-pointer border-b last:border-0 hover:bg-slate-50" onClick={() => setSelectedPlayerKey(entry.playerKey)}>
                    <td className="px-2 py-3 font-semibold text-purple-700">#{index + 1}</td>
                    <td className="px-2 py-3 font-medium text-slate-900">
                      {entry.displayName}
                      <div className="text-xs text-slate-400">{entry.recentResults?.join(" ") || "No recent results"}</div>
                    </td>
                    <td className="px-2 py-3">{entry.rating || "-"}</td>
                    <td className="px-2 py-3">{entry.points}</td>
                    <td className="px-2 py-3">{entry.wins}</td>
                    <td className="px-2 py-3">{entry.draws}</td>
                    <td className="px-2 py-3">{entry.losses}</td>
                    <td className="px-2 py-3">{entry.buchholz}</td>
                    <td className="px-2 py-3">{entry.gamesPlayed}</td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-700" : playerState?.status === "paused" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                          {active ? "Playing" : playerState?.status === "paused" ? "Paused" : entry.streak > 1 ? `Streak ${entry.streak}` : "Ready"}
                        </span>
                        {state.canManage ? (
                          <button onClick={(event) => { event.stopPropagation(); void removeParticipant(entry.playerKey); }} className="rounded-full border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700">
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {!standings.length ? (
                  <tr>
                    <td colSpan={10} className="px-2 py-8 text-center text-sm text-slate-500">Standings appear once the field is ready.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {filteredStandings.length > visibleStandings ? (
            <button onClick={() => setVisibleStandings((value) => value + 50)} className="mt-3 h-9 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">
              Load more players
            </button>
          ) : null}
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
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <span className="font-semibold text-slate-700">{pairing.result === "*" ? "Live" : pairing.result}</span>
                          {state.canManage && pairing.gameId ? (
                            <button
                              onClick={() => setCorrectionDraft({
                                gameId: String(pairing.gameId),
                                label: `${pairing.whiteName} vs ${pairing.blackName || "Bye"}`,
                                current: pairing.result || "*",
                                result: ["1-0", "0-1", "1/2-1/2"].includes(pairing.result) ? pairing.result : "1-0",
                                reason: "",
                              })}
                              className="rounded bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                            >
                              Correct
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={String(item._id)} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm">
                  <span className="font-medium text-slate-900">{item.whiteName} vs {item.blackName}</span>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Board live</span>
                    {state.canManage ? (
                      <button
                        onClick={() => setCorrectionDraft({
                          gameId: String(item._id),
                          label: `${item.whiteName} vs ${item.blackName || "Bye"}`,
                          current: item.result || "*",
                          result: "1-0",
                          reason: "",
                        })}
                        className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        Correct
                      </button>
                    ) : null}
                  </div>
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
      {tournament.chatEnabled ? (
        <section className={`${mobileClass("chat")} rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5`}>
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare size={16} className="text-purple-700" />
            <h3 className="text-base font-semibold text-slate-950">Tournament chat</h3>
          </div>
          <div className="max-h-56 space-y-2 overflow-auto rounded-xl bg-slate-50 p-3">
            {(tournament.chatMessages || []).filter((item: any) => !item.hidden).slice(-30).map((item: any, index: number) => (
              <div key={`${item.createdAt}-${index}`} className="rounded-lg bg-white px-3 py-2 text-sm">
                <span className="font-semibold text-slate-900">{item.senderName}: </span>
                <span className="text-slate-600">{item.message}</span>
              </div>
            ))}
            {!tournament.chatMessages?.length ? <div className="text-sm text-slate-500">No messages yet.</div> : null}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Write a message" />
            <button onClick={submitChat} className="h-10 rounded-xl bg-purple-700 px-4 text-sm font-semibold text-white">Send</button>
          </div>
        </section>
      ) : null}
      {state.canManage ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <h3 className="mb-3 text-base font-semibold text-slate-950">Tournament health</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <SeatTile label="Active Games" value={activeBoards} />
            <SeatTile label="Queued" value={queuedPlayers} />
            <SeatTile label="Stale" value={staleConnections} />
            <SeatTile label="Pairing Lock" value={tournament.pairingLock?.expiresAt && new Date(tournament.pairingLock.expiresAt).getTime() > Date.now() ? "Active" : "Clear"} />
            <SeatTile label="Last Event" value={latestAudit?.action || "-"} />
          </div>
        </section>
      ) : null}

      {state.canManage ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <h3 className="mb-3 text-base font-semibold text-slate-950">Tournament audit</h3>
          <div className="max-h-72 space-y-2 overflow-auto rounded-xl bg-slate-50 p-3">
            {(tournament.adminActions || []).slice().reverse().map((action: any, index: number) => (
              <div key={`${action.action}-${action.createdAt}-${index}`} className="rounded-lg bg-white px-3 py-2 text-sm">
                <div className="font-semibold text-slate-900">{action.action}</div>
                <div className="text-slate-600">{action.note || "Action recorded."}</div>
                <div className="mt-1 text-xs text-slate-400">{action.createdAt ? new Date(action.createdAt).toLocaleString("en-IN") : ""}</div>
              </div>
            ))}
            {!tournament.adminActions?.length ? <div className="text-sm text-slate-500">No audit records yet.</div> : null}
          </div>
        </section>
      ) : null}

      {editOpen ? (
        <AdminModal title="Edit Tournament" onClose={() => setEditOpen(false)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <EditField label="Name" value={editDraft.name} onChange={(value) => setEditDraft((current: any) => ({ ...current, name: value }))} />
            <EditField label="Entry Restrictions" value={editDraft.entryRestrictions} onChange={(value) => setEditDraft((current: any) => ({ ...current, entryRestrictions: value }))} />
            <EditField label="Time Control Minutes" type="number" value={editDraft.timeControlMinutes} onChange={(value) => setEditDraft((current: any) => ({ ...current, timeControlMinutes: Number(value) }))} />
            <EditField label="Increment Seconds" type="number" value={editDraft.incrementSeconds} onChange={(value) => setEditDraft((current: any) => ({ ...current, incrementSeconds: Number(value) }))} />
            {tournament.type === "arena" ? <EditField label="Arena Duration" type="number" value={editDraft.arenaDurationMinutes} onChange={(value) => setEditDraft((current: any) => ({ ...current, arenaDurationMinutes: Number(value) }))} /> : null}
            {tournament.type === "swiss" ? <EditField label="Rounds" type="number" value={editDraft.rounds} onChange={(value) => setEditDraft((current: any) => ({ ...current, rounds: Number(value) }))} /> : null}
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <input type="checkbox" checked={Boolean(editDraft.lateJoiningAllowed)} onChange={(event) => setEditDraft((current: any) => ({ ...current, lateJoiningAllowed: event.target.checked }))} />
              Late joining allowed
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <input type="checkbox" checked={Boolean(editDraft.chatEnabled)} onChange={(event) => setEditDraft((current: any) => ({ ...current, chatEnabled: event.target.checked }))} />
              Tournament chat
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-sm font-semibold text-slate-800">Description</span>
              <textarea value={editDraft.description || ""} onChange={(event) => setEditDraft((current: any) => ({ ...current, description: event.target.value }))} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
          </div>
          <ModalActions onCancel={() => setEditOpen(false)} onSave={async () => { if (await patchTournament(editDraft)) setEditOpen(false); }} />
        </AdminModal>
      ) : null}

      {externalOpen ? (
        <AdminModal title="Manage External Access" onClose={() => setExternalOpen(false)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <input type="checkbox" checked={Boolean(externalDraft.enabled)} onChange={(event) => setExternalDraft((current: any) => ({ ...current, enabled: event.target.checked }))} />
              External access enabled
            </label>
            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-800">Mode</span>
              <select value={externalDraft.accessMode || "private"} onChange={(event) => setExternalDraft((current: any) => ({ ...current, accessMode: event.target.value }))} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm">
                <option value="public">Public Link</option>
                <option value="private">Private Link</option>
                <option value="password">Password</option>
                <option value="entry_code">Entry Code</option>
              </select>
            </label>
            <EditField label="Password" value={externalDraft.password || ""} onChange={(value) => setExternalDraft((current: any) => ({ ...current, password: value }))} />
            <EditField label="Entry Code" value={externalDraft.entryCode || ""} onChange={(value) => setExternalDraft((current: any) => ({ ...current, entryCode: value }))} />
            <EditField label="Expires At" type="datetime-local" value={externalDraft.expiresAt || ""} onChange={(value) => setExternalDraft((current: any) => ({ ...current, expiresAt: value }))} />
          </div>
          <ModalActions onCancel={() => setExternalOpen(false)} onSave={async () => { if (await patchTournament({ externalInvite: externalDraft })) setExternalOpen(false); }} />
        </AdminModal>
      ) : null}

      {announcementOpen ? (
        <AdminModal title="Organizer Announcement" onClose={() => setAnnouncementOpen(false)}>
          <div className="space-y-3">
            <EditField label="Title" value={announcementDraft.title} onChange={(value) => setAnnouncementDraft((current) => ({ ...current, title: value }))} />
            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-800">Message</span>
              <textarea value={announcementDraft.message} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, message: event.target.value }))} className="min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
          </div>
          <ModalActions onCancel={() => setAnnouncementOpen(false)} onSave={sendAnnouncement} saveLabel="Send" />
        </AdminModal>
      ) : null}

      {correctionDraft ? (
        <AdminModal title="Correct Result" onClose={() => setCorrectionDraft(null)}>
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <div className="font-semibold text-slate-900">{correctionDraft.label}</div>
              <div className="mt-1 text-slate-600">Current result: {correctionDraft.current || "*"}</div>
            </div>
            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-800">New Result</span>
              <select
                value={correctionDraft.result}
                onChange={(event) => setCorrectionDraft((current) => current ? ({ ...current, result: event.target.value as "1-0" | "0-1" | "1/2-1/2" }) : current)}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
              >
                <option value="1-0">1-0 White wins</option>
                <option value="1/2-1/2">1/2-1/2 Draw</option>
                <option value="0-1">0-1 Black wins</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-sm font-semibold text-slate-800">Reason</span>
              <textarea
                value={correctionDraft.reason}
                onChange={(event) => setCorrectionDraft((current) => current ? ({ ...current, reason: event.target.value }) : current)}
                className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Explain why this result is being corrected"
              />
            </label>
          </div>
          <ModalActions onCancel={() => setCorrectionDraft(null)} onSave={correctResult} saveLabel="Confirm Correction" />
        </AdminModal>
      ) : null}

      {selectedPlayer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="max-h-[86vh] w-full max-w-xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{selectedPlayer.displayName}</h3>
                <p className="text-sm text-slate-500">Rank #{standings.findIndex((entry: any) => entry.playerKey === selectedPlayer.playerKey) + 1}</p>
              </div>
              <button onClick={() => setSelectedPlayerKey("")} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500">
                <X size={15} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SeatTile label="Points" value={selectedPlayer.points} />
              <SeatTile label="Rating" value={selectedPlayer.rating || "-"} />
              <SeatTile label="Games" value={selectedPlayer.gamesPlayed} />
              <SeatTile label="Wins" value={selectedPlayer.wins} />
              <SeatTile label="Win %" value={selectedPlayerStats ? `${selectedPlayerStats.winPercentage}%` : selectedPlayer.gamesPlayed ? `${Math.round((selectedPlayer.wins / selectedPlayer.gamesPlayed) * 100)}%` : "0%"} />
              <SeatTile label="Avg Opp" value={selectedPlayerStats?.averageOpponentRating || averageOpponentRating(selectedPlayerGames, selectedPlayer.playerKey)} />
              <SeatTile label="Performance" value={performanceLabel(selectedPlayer, tournament)} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">Game history</div>
              {selectedPlayerLoading ? <div className="text-xs font-semibold text-slate-500">Loading full history...</div> : null}
            </div>
            <div className="mt-2 space-y-2">
              {selectedPlayerGames.map((game: any) => {
                const isWhite = game.whiteKey === selectedPlayer.playerKey;
                return (
                  <div key={String(game._id)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <span>{isWhite ? game.blackName : game.whiteName}</span>
                      <span className="font-semibold">{resultLabel(game)}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {game.color || (isWhite ? "White" : "Black")} - {game.status} - {game.moveHistorySAN?.length || 0} moves - {game.pointsEarned ?? pointsEarnedFor(game, selectedPlayer.playerKey, tournament)} pts earned
                    </div>
                  </div>
                );
              })}
              {!selectedPlayerGames.length ? <div className="text-sm text-slate-500">No games recorded for this player yet.</div> : null}
            </div>
          </div>
        </div>
      ) : null}
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

function formatCountdown(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function SeatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 sm:px-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-[11px] sm:tracking-[0.14em]">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-950 sm:mt-1">{value}</div>
    </div>
  );
}

function AdminModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          <button onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditField({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (value: string) => void; type?: string }) {
  return (
    <label>
      <span className="mb-1 block text-sm font-semibold text-slate-800">{label}</span>
      <input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" />
    </label>
  );
}

function ModalActions({ onCancel, onSave, saveLabel = "Save" }: { onCancel: () => void; onSave: () => void | Promise<void>; saveLabel?: string }) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button onClick={onCancel} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cancel</button>
      <button onClick={() => void onSave()} className="h-10 rounded-xl bg-purple-700 px-4 text-sm font-semibold text-white">{saveLabel}</button>
    </div>
  );
}
