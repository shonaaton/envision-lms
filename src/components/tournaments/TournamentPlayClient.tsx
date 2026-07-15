"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Chess } from "chess.js";
import { buildMoveHintStyles, legalTargetsFromGame } from "@/lib/chessboardUi";
import { isPromotionMove, promotionFromBoardPiece, type PendingPromotion, type PromotionPiece } from "@/lib/chessPromotion";
import { ArrowLeft, Crown, Flag, Handshake, Pause, Play, RefreshCcw, Trophy, X, Zap } from "lucide-react";
import { useTournamentSocket } from "@/lib/useTournamentSocket";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

type PlayState = {
  tournament: any;
  activeGame: any;
  games: any[];
  myGames: any[];
  joined: boolean;
  currentSeat: any;
  participantState?: any;
  canManage: boolean;
  canPlay: boolean;
  guestUsername?: string;
};

function formatClock(ms: number) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resultLabel(game: any) {
  if (!game) return "-";
  if (game.status === "active") return "In progress";
  if (game.termination === "bye") return "Bye";
  if (game.termination === "resign") return "Resigned";
  if (game.result === "1/2-1/2") return "Draw";
  return game.result || "-";
}

function seatSummary(seat: any, tournamentStatus: string) {
  if (!seat) return "Waiting for pairing";
  if (seat.status === "not_joined") return "Join the tournament first";
  if (seat.status === "active") return `Round ${seat.roundNumber || "-"} - Board ${seat.boardNumber || "-"}`;
  if (seat.status === "assigned") return `Assigned to round ${seat.roundNumber || "-"} - board ${seat.boardNumber || "-"}`;
  if (seat.status === "completed") return ["completed", "finished"].includes(tournamentStatus) ? "Tournament finished" : "Current round completed";
  if (seat.status === "joined") return "Registered and ready";
  if (seat.status === "waiting") return "Waiting for an opponent";
  return "Waiting for next board";
}

export function TournamentPlayClient({
  tournamentId,
  backHref,
  backLabel,
  guestLabel,
  publicRoom = false,
}: {
  tournamentId: string;
  backHref?: string;
  backLabel?: string;
  guestLabel?: string;
  publicRoom?: boolean;
}) {
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(520);
  const [state, setState] = useState<PlayState | null>(null);
  const [error, setError] = useState("");
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [premove, setPremove] = useState<{ from: string; to: string; promotion?: PromotionPiece } | null>(null);
  const [premoveNotice, setPremoveNotice] = useState("");
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [confirmAction, setConfirmAction] = useState<"resign" | "draw" | null>(null);
  const [pending, startTransition] = useTransition();
  const [, forceClockTick] = useState(0);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${tournamentId}/state`, { cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Could not load the tournament room.");
      return;
    }
    setError("");
    setState(await response.json());
  }, [tournamentId]);

  useEffect(() => {
    refresh();
    const clock = window.setInterval(() => forceClockTick((value) => value + 1), 1000);
    return () => {
      window.clearInterval(clock);
    };
  }, [refresh]);

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;
    const resize = () => {
      const isMobile = window.innerWidth < 768;
      const width = element.clientWidth;
      const heightLimit = window.innerHeight - (isMobile ? 310 : 280);
      setBoardWidth(Math.max(isMobile ? 245 : 280, Math.min(isMobile ? window.innerWidth - 38 : 620, width, heightLimit)));
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
  const tournamentStatus = String(state?.tournament?.status || "");
  const tournamentPlaying = ["live", "playing"].includes(tournamentStatus);
  const tournamentFinished = ["completed", "finished"].includes(tournamentStatus);
  const currentSeat = state?.currentSeat || null;
  const participantState = state?.participantState || null;
  const myColor = currentSeat?.color === "black" ? "black" : "white";
  const myPlayerKey = activeGame ? (myColor === "white" ? activeGame.whiteKey : activeGame.blackKey) : "";
  const myTurn = activeGame?.status === "active" && ((activeGame.turn === "w" && myColor === "white") || (activeGame.turn === "b" && myColor === "black"));
  const { connected, broadcastTournamentUpdate, emitPresence } = useTournamentSocket({
    tournamentId,
    playerKey: myPlayerKey,
    onUpdate: refresh,
  });
  const myStanding = useMemo(() => {
    if (!state?.tournament?.standings || !state?.myGames?.length) return null;
    const myNames = new Set(
      (state.myGames || []).flatMap((game: any) => [game.whiteName, game.blackName]).filter(Boolean)
    );
    return (state.tournament.standings || []).find((entry: any) => myNames.has(entry.displayName)) || null;
  }, [state?.myGames, state?.tournament?.standings]);
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
  }, [activeGame]);
  const firstMoveCountdown = useMemo(() => {
    if (!activeGame?.firstMoveDeadlineAt || activeGame?.moveHistorySAN?.length) return 0;
    return Math.max(0, Math.ceil((new Date(activeGame.firstMoveDeadlineAt).getTime() - Date.now()) / 1000));
  }, [activeGame]);

  useEffect(() => {
    if (!activeGame?._id) return;
    const ping = () => {
      void fetch(`/api/tournaments/games/${activeGame._id}/presence`, { method: "POST" }).catch(() => null);
    };
    const beacon = () => {
      navigator.sendBeacon?.(`/api/tournaments/games/${activeGame._id}/presence`);
    };
    ping();
    const timer = window.setInterval(ping, 10_000);
    window.addEventListener("pagehide", beacon);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", beacon);
    };
  }, [activeGame?._id]);

  const postMove = useCallback(async (from: string, to: string, promotion: PromotionPiece = "q", options?: { quiet?: boolean }) => {
    if (!activeGame) return false;
    setError("");
    setPremoveNotice("");
    const response = await fetch(`/api/tournaments/games/${activeGame._id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, promotion }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      if (options?.quiet) setPremoveNotice("Premove cancelled because the position changed.");
      else setError(payload?.error || "Could not register move.");
      return false;
    }
    await refresh();
    broadcastTournamentUpdate("move");
    emitPresence();
    setSelectedSquare(null);
    setPremove(null);
    return true;
  }, [activeGame, broadcastTournamentUpdate, emitPresence, refresh]);

  useEffect(() => {
    if (!myTurn || !premove || !activeGame?._id) return;
    const move = premove;
    setPremove(null);
    startTransition(async () => {
      const legal = chess.moves({ square: move.from as any, verbose: true }).some((candidate: any) =>
        candidate.to === move.to && (!candidate.promotion || candidate.promotion === (move.promotion || "q"))
      );
      if (!legal) {
        setPremoveNotice("Premove cancelled because the position changed.");
        return;
      }
      await postMove(move.from, move.to, move.promotion || "q", { quiet: true });
    });
  }, [activeGame?._id, chess, myTurn, postMove, premove]);

  function onDrop(source: string, target: string) {
    if (!activeGame || pending || activeGame.status !== "active") return false;
    if (!myTurn) {
      const piece = chess.get(source as any);
      const ownColor = myColor === "white" ? "w" : "b";
      if (piece?.color !== ownColor) return false;
      setPremove({ from: source, to: target });
      setPremoveNotice("");
      setSelectedSquare(null);
      return false;
    }
    startTransition(async () => {
      await postMove(source, target);
    });
    return true;
  }

  function onPromotionPieceSelect(piece?: string, from?: string, to?: string) {
    const promotion = promotionFromBoardPiece(piece);
    const move = from && to ? { from, to } : pendingPromotion;
    setPendingPromotion(null);
    if (!promotion || !move) return false;
    startTransition(async () => {
      await postMove(move.from, move.to, promotion);
    });
    return true;
  }

  const moveTargets = useMemo(() => {
    if (!selectedSquare || !activeGame || pending || activeGame.status !== "active") return [];
    return legalTargetsFromGame(chess, selectedSquare);
  }, [selectedSquare, activeGame, pending, chess]);
  const boardSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = { ...buildMoveHintStyles(moveTargets, selectedSquare) };
    const lastMove = activeGame?.moveHistoryUCI?.length ? String(activeGame.moveHistoryUCI[activeGame.moveHistoryUCI.length - 1]) : "";
    if (lastMove.length >= 4) {
      styles[lastMove.slice(0, 2)] = { ...(styles[lastMove.slice(0, 2)] || {}), boxShadow: "inset 0 0 0 4px rgba(250, 204, 21, 0.55)" };
      styles[lastMove.slice(2, 4)] = { ...(styles[lastMove.slice(2, 4)] || {}), boxShadow: "inset 0 0 0 4px rgba(250, 204, 21, 0.7)" };
    }
    if (chess.isCheck()) {
      const kingSquare = findKingSquare(chess, chess.turn());
      if (kingSquare) styles[kingSquare] = { ...(styles[kingSquare] || {}), boxShadow: "inset 0 0 0 5px rgba(220, 38, 38, 0.75)" };
    }
    if (premove) {
      styles[premove.from] = { ...(styles[premove.from] || {}), boxShadow: "inset 0 0 0 4px rgba(14, 165, 233, 0.65)" };
      styles[premove.to] = { ...(styles[premove.to] || {}), boxShadow: "inset 0 0 0 4px rgba(14, 165, 233, 0.85)" };
    }
    return styles;
  }, [moveTargets, selectedSquare, activeGame?.moveHistoryUCI, chess, premove]);

  function onSquareClick(square: string) {
    if (!activeGame || pending || activeGame.status !== "active") return;
    const clickedPiece = chess.get(square as any);
    if (!myTurn) {
      const ownColor = myColor === "white" ? "w" : "b";
      if (!selectedSquare && clickedPiece?.color === ownColor) {
        setSelectedSquare(square);
        return;
      }
      if (selectedSquare && selectedSquare !== square) {
        setPremove({ from: selectedSquare, to: square });
        setPremoveNotice("");
        setSelectedSquare(null);
        return;
      }
      setSelectedSquare(null);
      setPremove(null);
      setPremoveNotice("");
      return;
    }
    if (selectedSquare && selectedSquare !== square) {
      if (isPromotionMove(chess, selectedSquare, square)) {
        setPendingPromotion({ from: selectedSquare, to: square });
        return;
      }
      void postMove(selectedSquare, square);
      return;
    }
    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }
    if (clickedPiece && clickedPiece.color === chess.turn()) {
      setSelectedSquare(square);
      return;
    }
    setSelectedSquare(null);
  }

  async function submitResult(action: "resign" | "draw" | "decline_draw" | "berserk") {
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
    const payload = await response.json().catch(() => null);
    if (payload?.drawOffered) {
      setError("Draw offer sent. The opponent can accept or decline by continuing play.");
    } else if (payload?.drawDeclined) {
      setError("Draw offer declined.");
    } else if (payload?.berserked) {
      setError("Berserk activated.");
    }
    await refresh();
    broadcastTournamentUpdate(action);
    emitPresence();
  }

  async function runTournamentAction(action: "join" | "pause") {
    setError("");
    const response = await fetch(`/api/tournaments/${tournamentId}/${action}`, { method: "POST" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Could not update your Arena status.");
      return;
    }
    await refresh();
    broadcastTournamentUpdate(action);
    emitPresence();
  }

  return (
    <div className="min-h-screen bg-slate-50 px-2 py-3 text-slate-950 sm:px-6 sm:py-5 lg:px-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-5 sm:gap-3">
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-purple-700 sm:mb-2 sm:text-sm sm:tracking-[0.2em]">
            <Trophy size={14} /> Tournament Game Room
            <span className={`rounded-full px-2 py-0.5 text-[10px] tracking-normal ${connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{connected ? "Live socket" : "Connecting"}</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-950 sm:text-2xl">{state?.tournament?.name || "Tournament"}</h1>
          <p className="mt-0.5 text-xs text-slate-500 sm:mt-1 sm:text-sm">Play your assigned board, watch the standings move, and stay ready for the next pairing.</p>
          {currentSeat ? (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold sm:mt-3 sm:gap-2 sm:text-xs">
              <span className="rounded-full bg-purple-50 px-3 py-1 text-purple-700">{seatSummary(currentSeat, tournamentStatus)}</span>
              {currentSeat.color ? <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">You are {currentSeat.color}</span> : null}
              {currentSeat.opponentName ? <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Opponent: {currentSeat.opponentName}</span> : null}
              {guestLabel || state?.guestUsername ? <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Guest: {guestLabel || state?.guestUsername}</span> : null}
            </div>
          ) : null}
        </div>
        <Link href={backHref || `/tournaments/${tournamentId}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm sm:h-10 sm:px-4 sm:text-sm">
          <ArrowLeft size={15} /> {backLabel || "Back to overview"}
        </Link>
      </div>

      {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)] xl:gap-4">
        <section className="order-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-5 xl:order-1">
          {!activeGame ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center sm:min-h-[520px] sm:px-6">
                <div className="text-base font-semibold text-slate-900 sm:text-lg">
                  {!state?.joined ? "Join this tournament first" : tournamentFinished ? "Tournament finished" : "No live board assigned yet"}
                </div>
                <p className="mt-2 max-w-md text-xs text-slate-500 sm:text-sm">
                  {!state?.joined
                  ? publicRoom
                    ? "Finish the guest join step first. Once you are registered on this device, your pairing will appear here automatically."
                    : "You can view the event, but you will only receive opponent assignments after joining the tournament from the overview page."
                  : tournamentFinished
                  ? "This event has already ended. You can still review the standings and your game history here."
                  : currentSeat?.status === "completed"
                    ? "Your current board is finished. If this is a Swiss event, wait for the next round. If this is an arena, your next game will appear automatically."
                    : currentSeat?.status === "assigned"
                      ? "Your opponent has been assigned. As soon as the board is live, it will open here automatically."
                      : currentSeat?.status === "waiting" && state?.tournament?.type === "arena"
                        ? "You are in the arena queue. Because there is an odd number of players or all opponents are already playing, please wait here. Your board will open automatically when an opponent is available."
                      : tournamentPlaying
                        ? "If the tournament is running, your next pairing will appear automatically here. For Swiss events, the next round opens when the admin pairs it."
                    : "The event has not started yet. Once the admin starts the tournament, your pairing and board will appear here."}
              </p>
              <button onClick={refresh} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-purple-700 px-4 text-sm font-semibold text-white">
                <RefreshCcw size={15} /> Refresh seat
              </button>
              {currentSeat ? (
                <div className="mt-4 grid w-full max-w-xl grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                  <SnapshotCard label="Round" value={currentSeat.roundNumber || "-"} />
                  <SnapshotCard label="Board" value={currentSeat.boardNumber || "-"} />
                  <SnapshotCard label="Color" value={currentSeat.color ? `${String(currentSeat.color).charAt(0).toUpperCase()}${String(currentSeat.color).slice(1)}` : "-"} />
                  <SnapshotCard label="Opponent" value={currentSeat.opponentName || "-"} />
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2 sm:mb-4 sm:gap-3">
                <SnapshotCard label="Round" value={activeGame.roundNumber || "-"} />
                <SnapshotCard label="Board" value={activeGame.tableNumber || "-"} />
                <SnapshotCard
                  label="My Color"
                  value={currentSeat?.color ? `${String(currentSeat.color).charAt(0).toUpperCase()}${String(currentSeat.color).slice(1)}` : "-"}
                />
              </div>
              {firstMoveCountdown > 0 ? (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  First move countdown: {firstMoveCountdown}s
                </div>
              ) : null}
              <div className="mb-3 grid grid-cols-2 gap-2 sm:mb-4 sm:gap-3">
                <PlayerCard name={activeGame.blackName} side="Black" clock={formatClock(estimatedClocks.black)} active={activeGame.turn === "b" && activeGame.status === "active"} rank={rankFor(state, activeGame.blackKey)} score={scoreFor(state, activeGame.blackKey)} onlineAt={activeGame.blackOnlineAt} berserk={activeGame.berserkBlack} />
                <PlayerCard name={activeGame.whiteName} side="White" clock={formatClock(estimatedClocks.white)} active={activeGame.turn === "w" && activeGame.status === "active"} rank={rankFor(state, activeGame.whiteKey)} score={scoreFor(state, activeGame.whiteKey)} onlineAt={activeGame.whiteOnlineAt} berserk={activeGame.berserkWhite} />
              </div>
              <div ref={boardWrapRef} className="flex min-h-[250px] justify-center sm:min-h-0">
                <Chessboard
                  id={`tournament-board-${activeGame._id}`}
                  position={activeGame.fen === "start" ? new Chess().fen() : activeGame.fen}
                  boardWidth={boardWidth}
                  onPieceDrop={onDrop}
                  onSquareClick={onSquareClick as any}
                  onPromotionPieceSelect={onPromotionPieceSelect as any}
                  showPromotionDialog={!!pendingPromotion}
                  promotionToSquare={pendingPromotion?.to as any}
                  promotionDialogVariant="modal"
                  arePiecesDraggable={activeGame.status === "active"}
                  boardOrientation={myColor}
                  customSquareStyles={boardSquareStyles as any}
                  customDarkSquareStyle={{ backgroundColor: "#b58863" }}
                  customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
                />
              </div>
              {premove ? (
                <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800">
                  Premove set: {premove.from}-{premove.to}. It will play automatically when your turn arrives.
                  <button onClick={() => setPremove(null)} className="ml-3 rounded-lg bg-white px-2 py-1 text-xs text-sky-700">Cancel</button>
                </div>
              ) : null}
              {premoveNotice ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                  {premoveNotice}
                </div>
              ) : null}
              {activeGame.drawOfferBy && activeGame.drawOfferBy !== myPlayerKey ? (
                <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800">
                  Draw offered. Accept with the Draw button or decline by making a move.
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4">
                <button onClick={() => setConfirmAction("resign")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 sm:h-10 sm:px-4 sm:text-sm">
                  <Flag size={15} /> Resign
                </button>
                <button onClick={() => setConfirmAction("draw")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm">
                  <Handshake size={15} /> {activeGame.drawOfferBy && activeGame.drawOfferBy !== myPlayerKey ? "Accept Draw" : "Offer Draw"}
                </button>
                {activeGame.drawOfferBy && activeGame.drawOfferBy !== myPlayerKey ? (
                  <button onClick={() => submitResult("decline_draw")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm">
                    <X size={15} /> Decline Draw
                  </button>
                ) : null}
                {state?.tournament?.allowBerserk && activeGame.status === "active" && (activeGame.moveHistorySAN?.length || 0) <= 1 && !((myColor === "white" && activeGame.berserkWhite) || (myColor === "black" && activeGame.berserkBlack)) ? (
                  <button onClick={() => submitResult("berserk")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 text-xs font-semibold text-purple-700 sm:h-10 sm:px-4 sm:text-sm">
                    <Zap size={15} /> Berserk
                  </button>
                ) : null}
                <Link href={backHref || `/tournaments/${tournamentId}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 sm:h-10 sm:px-4 sm:text-sm">
                  <ArrowLeft size={15} /> Back to Tournament
                </Link>
                {activeGame.status === "completed" ? (
                  <Link href="/analysis" className="inline-flex h-9 items-center gap-2 rounded-xl bg-purple-700 px-3 text-xs font-semibold text-white sm:h-10 sm:px-4 sm:text-sm">
                    <Trophy size={15} /> Analysis
                  </Link>
                ) : null}
                {state?.tournament?.type === "arena" && tournamentPlaying ? (
                  participantState?.status === "paused" ? (
                    <button onClick={() => runTournamentAction("join")} className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white sm:h-10 sm:px-4 sm:text-sm">
                      <Play size={15} /> Resume
                    </button>
                  ) : (
                    <button onClick={() => runTournamentAction("pause")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 sm:h-10 sm:px-4 sm:text-sm">
                      <Pause size={15} /> Pause
                    </button>
                  )
                ) : null}
                <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600 sm:px-4 sm:text-sm">
                  {activeGame.status === "completed" ? `Game finished: ${resultLabel(activeGame)}` : chess.turn() === "w" ? "White to move" : "Black to move"}
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:mt-4 sm:p-4">
                <div className="mb-2 text-sm font-semibold text-slate-900">Move list</div>
                <div className="max-h-28 overflow-auto rounded-xl bg-white p-3 text-xs text-slate-700 sm:max-h-40 sm:text-sm">
                  {activeGame.moveHistorySAN?.length ? activeGame.moveHistorySAN.join(" ") : "No moves yet."}
                </div>
              </div>
            </>
          )}
        </section>

        <section className="order-2 space-y-3 xl:order-2 xl:space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-950">My tournament snapshot</h2>
            {myStanding ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <SnapshotCard label="Rank" value={`#${(state?.tournament?.standings || []).findIndex((entry: any) => entry.playerKey === myStanding.playerKey) + 1}`} />
                <SnapshotCard label="Points" value={myStanding.points} />
                <SnapshotCard label="Wins" value={myStanding.wins} />
                <SnapshotCard label="Games" value={myStanding.gamesPlayed} />
              </div>
            ) : (
              <div className="text-sm text-slate-500">Your standings row will appear once your first pairing is recorded.</div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-950">Standings</h2>
            <div className="space-y-2">
              {(state?.tournament?.standings || []).slice(0, 10).map((entry: any, index: number) => (
                <div key={entry.playerKey} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <div>
                    <span className="mr-2 font-semibold text-purple-700">{index === 0 ? <Crown size={14} className="inline" /> : `#${index + 1}`}</span>
                    <span className="font-medium text-slate-900">{entry.displayName}</span>
                  </div>
                  <span className="font-semibold text-slate-700">{entry.points} pts - {entry.gamesPlayed} g</span>
                </div>
              ))}
              {!state?.tournament?.standings?.length ? <div className="text-sm text-slate-500">Standings will appear once games start finishing.</div> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-950">My game history</h2>
            <div className="space-y-2">
              {(state?.myGames || []).map((game: any) => (
                <div key={String(game._id)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">{game.whiteName} vs {game.blackName || "Bye"}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{resultLabel(game)}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{game.moveHistorySAN?.join(" ") || "No moves yet"}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">{game.termination || "ongoing"}</div>
                </div>
              ))}
              {!state?.myGames?.length ? <div className="text-sm text-slate-500">No games recorded yet.</div> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-950">Recent tournament boards</h2>
            <div className="space-y-2">
              {(state?.games || []).slice(0, 8).map((game: any) => (
                <div key={String(game._id)} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-slate-900">{game.whiteName} vs {game.blackName || "Bye"}</div>
                    <div className="text-xs text-slate-500">{game.moveHistorySAN?.length || 0} moves</div>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">{resultLabel(game)}</span>
                </div>
              ))}
              {!state?.games?.length ? <div className="text-sm text-slate-500">No tournament boards yet.</div> : null}
            </div>
          </div>
        </section>
      </div>
      {confirmAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-950">{confirmAction === "resign" ? "Confirm Resign" : activeGame?.drawOfferBy && activeGame.drawOfferBy !== myPlayerKey ? "Accept Draw" : "Offer Draw"}</h2>
              <button onClick={() => setConfirmAction(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500">
                <X size={15} />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              {confirmAction === "resign"
                ? "This will immediately end the game and award the result to your opponent."
                : activeGame?.drawOfferBy && activeGame.drawOfferBy !== myPlayerKey
                  ? "This will finish the game as a draw."
                  : "Your opponent can accept the offer or decline by continuing to play."}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmAction(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cancel</button>
              <button
                onClick={() => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  void submitResult(action);
                }}
                className={`h-10 rounded-xl px-4 text-sm font-semibold text-white ${confirmAction === "resign" ? "bg-red-600" : "bg-purple-700"}`}
              >
                {confirmAction === "resign" ? "Confirm Resign" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlayerCard({
  name,
  side,
  clock,
  active,
  rank,
  score,
  onlineAt,
  berserk,
}: {
  name: string;
  side: string;
  clock: string;
  active: boolean;
  rank: string;
  score: string;
  onlineAt?: string | Date;
  berserk?: boolean;
}) {
  const online = onlineAt ? Date.now() - new Date(onlineAt).getTime() < 15000 : false;
  return (
    <div className={`rounded-2xl border p-2.5 shadow-sm sm:p-4 ${active ? "border-purple-200 bg-purple-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">{side}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-950 sm:mt-1 sm:text-base">{name}</div>
      <div className="mt-1 text-xl font-black tabular-nums text-slate-900 sm:mt-2 sm:text-2xl">{clock}</div>
      <div className="mt-1 text-[11px] font-semibold text-slate-500">{rank} - {score}</div>
      <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-semibold">
        <span className={online ? "text-emerald-700" : "text-amber-700"}>{online ? "Online" : "Disconnected"}</span>
        {berserk ? <span className="text-purple-700">Berserk</span> : null}
      </div>
    </div>
  );
}

function SnapshotCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 sm:px-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-[11px] sm:tracking-[0.14em]">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-950 sm:mt-1 sm:text-base">{value}</div>
    </div>
  );
}

function rankFor(state: PlayState | null, playerKey: string) {
  const standings = state?.tournament?.standings || [];
  const index = standings.findIndex((entry: any) => entry.playerKey === playerKey);
  return index >= 0 ? `Rank #${index + 1}` : "Rank -";
}

function scoreFor(state: PlayState | null, playerKey: string) {
  const entry = (state?.tournament?.standings || []).find((item: any) => item.playerKey === playerKey);
  return `${entry?.points ?? 0} pts`;
}

function findKingSquare(chess: Chess, color: "w" | "b") {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  for (const file of files) {
    for (let rank = 1; rank <= 8; rank += 1) {
      const square = `${file}${rank}`;
      const piece = chess.get(square as any);
      if (piece?.type === "k" && piece.color === color) return square;
    }
  }
  return "";
}
