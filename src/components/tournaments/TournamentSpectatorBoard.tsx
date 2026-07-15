"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { ArrowLeft, Eye, RefreshCcw } from "lucide-react";
import { buildMoveHintStyles } from "@/lib/chessboardUi";
import { useTournamentSocket } from "@/lib/useTournamentSocket";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

function formatClock(ms: number) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resultLabel(game: any) {
  if (!game) return "-";
  if (game.status === "active") return "In progress";
  if (game.result === "1/2-1/2") return "Draw";
  return game.result || "-";
}

export function TournamentSpectatorBoard({
  tournamentId,
  gameId,
  initialGame,
  initialTournament,
}: {
  tournamentId: string;
  gameId: string;
  initialGame: any;
  initialTournament: any;
}) {
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [game, setGame] = useState(initialGame);
  const [tournament, setTournament] = useState(initialTournament);
  const [boardWidth, setBoardWidth] = useState(560);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/tournaments/games/${gameId}`, { cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Could not refresh spectator board.");
      return;
    }
    const payload = await response.json();
    setGame(payload.game);
    setTournament(payload.tournament);
    setError("");
  }, [gameId]);

  const { connected } = useTournamentSocket({ tournamentId, onUpdate: refresh });

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;
    const resize = () => setBoardWidth(Math.max(280, Math.min(620, element.clientWidth, window.innerHeight - 260)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  const chess = useMemo(() => {
    try {
      return new Chess(game?.fen && game.fen !== "start" ? game.fen : undefined);
    } catch {
      return new Chess();
    }
  }, [game?.fen]);
  const lastMove = game?.moveHistoryUCI?.length ? String(game.moveHistoryUCI[game.moveHistoryUCI.length - 1]) : "";
  const styles = useMemo(() => {
    const base: Record<string, React.CSSProperties> = {};
    if (lastMove.length >= 4) Object.assign(base, buildMoveHintStyles([lastMove.slice(2, 4)], lastMove.slice(0, 2)));
    return base;
  }, [lastMove]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-purple-700">
            <Eye size={16} /> Spectator Board
            <span className={`rounded-full px-2 py-0.5 text-[10px] tracking-normal ${connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{connected ? "Live socket" : "Connecting"}</span>
          </div>
          <h1 className="text-2xl font-semibold">{tournament?.name || "Tournament"}</h1>
          <p className="mt-1 text-sm text-slate-500">Board {game?.tableNumber || "-"}: {game?.whiteName} vs {game?.blackName || "Bye"}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">
            <RefreshCcw size={15} /> Refresh
          </button>
          <Link href={`/tournaments/${tournamentId}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white">
            <ArrowLeft size={15} /> Tournament
          </Link>
        </div>
      </div>
      {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
          <div ref={boardWrapRef} className="flex justify-center">
            <Chessboard
              id={`spectator-${gameId}`}
              position={game?.fen === "start" ? new Chess().fen() : game?.fen}
              boardWidth={boardWidth}
              arePiecesDraggable={false}
              boardOrientation="white"
              customSquareStyles={styles as any}
              customDarkSquareStyle={{ backgroundColor: "#b58863" }}
              customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
            />
          </div>
        </section>
        <aside className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-2">
              <Info label="White" value={game?.whiteName || "-"} />
              <Info label="Black" value={game?.blackName || "-"} />
              <Info label="White Clock" value={formatClock(game?.whiteClockMs || 0)} />
              <Info label="Black Clock" value={formatClock(game?.blackClockMs || 0)} />
              <Info label="Result" value={resultLabel(game)} />
              <Info label="Moves" value={String(game?.moveHistorySAN?.length || 0)} />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-slate-900">Move list</div>
            <div className="max-h-72 overflow-auto rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              {game?.moveHistorySAN?.length ? game.moveHistorySAN.join(" ") : "No moves yet."}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-950">{value}</div>
    </div>
  );
}
