"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Chess } from "chess.js";
import { ArrowLeft, Flag, Handshake, RefreshCcw, Trophy } from "lucide-react";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

type PlayState = {
  tournament: any;
  activeGame: any;
  games: any[];
  myGames: any[];
  canManage: boolean;
  canPlay: boolean;
};

function formatClock(ms: number) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function TournamentPlayClient({ tournamentId }: { tournamentId: string }) {
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(520);
  const [state, setState] = useState<PlayState | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [, forceClockTick] = useState(0);

  async function refresh() {
    const response = await fetch(`/api/tournaments/${tournamentId}/state`, { cache: "no-store" });
    if (!response.ok) return;
    setState(await response.json());
  }

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 2500);
    const clock = window.setInterval(() => forceClockTick((value) => value + 1), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [tournamentId]);

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;
    const resize = () => {
      const width = element.clientWidth;
      const heightLimit = window.innerHeight - 280;
      setBoardWidth(Math.max(280, Math.min(620, width, heightLimit)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  const activeGame = state?.activeGame || null;
  const chess = useMemo(() => {
    try {
      return new Chess(activeGame?.fen && activeGame.fen !== "start" ? activeGame.fen : undefined);
    } catch {
      return new Chess();
    }
  }, [activeGame?.fen]);

  const estimatedClocks = useMemo(() => {
    if (!activeGame) return { white: 0, black: 0 };
    if (activeGame.status !== "active") return { white: activeGame.whiteClockMs, black: activeGame.blackClockMs };
    const elapsed = Math.max(0, Date.now() - new Date(activeGame.lastMoveAt || activeGame.startedAt || Date.now()).getTime());
    if (activeGame.turn === "w") return { white: Math.max(0, activeGame.whiteClockMs - elapsed), black: activeGame.blackClockMs };
    return { white: activeGame.whiteClockMs, black: Math.max(0, activeGame.blackClockMs - elapsed) };
  }, [activeGame, activeGame?.lastMoveAt, activeGame?.turn]);

  async function postMove(from: string, to: string) {
    if (!activeGame) return false;
    setError("");
    const response = await fetch(`/api/tournaments/games/${activeGame._id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, promotion: "q" }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Could not register move.");
      return false;
    }
    await refresh();
    return true;
  }

  function onDrop(source: string, target: string) {
    if (!activeGame || pending || activeGame.status !== "active") return false;
    startTransition(async () => {
      await postMove(source, target);
    });
    return true;
  }

  async function submitResult(action: "resign" | "draw") {
    if (!activeGame) return;
    setError("");
    const response = await fetch(`/api/tournaments/games/${activeGame._id}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Could not update game result.");
      return;
    }
    await refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-purple-700">
            <Trophy size={14} /> Tournament Game Room
          </div>
          <h1 className="text-2xl font-semibold text-slate-950">{state?.tournament?.name || "Tournament"}</h1>
          <p className="mt-1 text-sm text-slate-500">Play your assigned board, watch the standings move, and stay ready for the next pairing.</p>
        </div>
        <Link href={`/tournaments/${tournamentId}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm">
          <ArrowLeft size={15} /> Back to overview
        </Link>
      </div>

      {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!activeGame ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
              <div className="text-lg font-semibold text-slate-900">No live board assigned yet</div>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                If the tournament is running, your next pairing will appear automatically here. For Swiss events, the next round opens when the admin pairs it.
              </p>
              <button onClick={refresh} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-purple-700 px-4 text-sm font-semibold text-white">
                <RefreshCcw size={15} /> Refresh seat
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 grid gap-3 md:grid-cols-2">
                <PlayerCard name={activeGame.blackName} side="Black" clock={formatClock(estimatedClocks.black)} active={activeGame.turn === "b" && activeGame.status === "active"} />
                <PlayerCard name={activeGame.whiteName} side="White" clock={formatClock(estimatedClocks.white)} active={activeGame.turn === "w" && activeGame.status === "active"} />
              </div>
              <div ref={boardWrapRef} className="flex justify-center">
                <Chessboard
                  id={`tournament-board-${activeGame._id}`}
                  position={activeGame.fen === "start" ? new Chess().fen() : activeGame.fen}
                  boardWidth={boardWidth}
                  onPieceDrop={onDrop}
                  arePiecesDraggable={activeGame.status === "active"}
                  customDarkSquareStyle={{ backgroundColor: "#b58863" }}
                  customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => submitResult("resign")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700">
                  <Flag size={15} /> Resign
                </button>
                <button onClick={() => submitResult("draw")} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">
                  <Handshake size={15} /> Agree Draw
                </button>
                <div className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-600">
                  {activeGame.status === "completed" ? `Game finished: ${activeGame.result}` : chess.turn() === "w" ? "White to move" : "Black to move"}
                </div>
              </div>
            </>
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-950">Standings</h2>
            <div className="space-y-2">
              {(state?.tournament?.standings || []).slice(0, 10).map((entry: any, index: number) => (
                <div key={entry.playerKey} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <div>
                    <span className="mr-2 font-semibold text-purple-700">#{index + 1}</span>
                    <span className="font-medium text-slate-900">{entry.displayName}</span>
                  </div>
                  <span className="font-semibold text-slate-700">{entry.points} pts</span>
                </div>
              ))}
              {!state?.tournament?.standings?.length ? <div className="text-sm text-slate-500">Standings will appear once games start finishing.</div> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-slate-950">My game history</h2>
            <div className="space-y-2">
              {(state?.myGames || []).map((game: any) => (
                <div key={String(game._id)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">{game.whiteName} vs {game.blackName || "Bye"}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{game.result === "*" ? "Live" : game.result}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{game.moveHistorySAN?.join(" ") || "No moves yet"}</div>
                </div>
              ))}
              {!state?.myGames?.length ? <div className="text-sm text-slate-500">No games recorded yet.</div> : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function PlayerCard({
  name,
  side,
  clock,
  active,
}: {
  name: string;
  side: string;
  clock: string;
  active: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${active ? "border-purple-200 bg-purple-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{side}</div>
      <div className="mt-1 text-base font-semibold text-slate-950">{name}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{clock}</div>
    </div>
  );
}
