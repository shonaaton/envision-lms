"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { isPromotionMove, promotionFromBoardPiece, type PendingPromotion, type PromotionPiece } from "@/lib/chessPromotion";
import { ArrowLeft, Flag, Handshake, Pause, Play, RefreshCcw, Trophy, X, Zap } from "lucide-react";
import { useTournamentSocket } from "@/lib/useTournamentSocket";
import { clockBaselineFromGame, deriveClocks, useNow, type ClockBaseline } from "@/lib/useLiveClock";
import { applyLeaderboardRows, findMyPairing, mergeLiveGames, rankOf } from "@/lib/tournament/leaderboard";
import { BOARD_DARK_SQUARE, BOARD_LIGHT_SQUARE, buildBoardSquareStyles, findKingSquare } from "@/lib/tournament/boardTheme";
import { legalTargetsFromGame } from "@/lib/chessboardUi";
import { GameDialog } from "./game/GameDialog";
import { GameStatus, type GameStatusKind } from "./game/GameStatus";
import { PlayerBar } from "./game/PlayerBar";
import { SidePanel } from "./game/SidePanel";
import { useBoardSizing } from "./game/useBoardSizing";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

type PlayState = {
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
  berserkAvailable?: boolean;
  tieBreak?: { key: string; label: string } | null;
  maxRounds?: number | null;
  serverNow?: number;
  myPlayerKey?: string;
  canManage: boolean;
  canPlay: boolean;
  guestUsername?: string;
};

type Premove = { from: string; to: string; promotion?: PromotionPiece };

/** How long a socket must stay down before the player is told about it. */
const RECONNECT_NOTICE_MS = 8000;

function terminationLabel(game: any) {
  if (!game) return "";
  if (game.status === "aborted") return "Nobody moved in time, so the board was abandoned and no result was recorded";
  const reasons: Record<string, string> = {
    checkmate: "Checkmate",
    resign: "Resignation",
    timeout: "Time out",
    draw_agreement: "Draw by agreement",
    stalemate: "Stalemate",
    repetition: "Draw by repetition",
    fifty_moves: "Draw by the fifty-move rule",
    insufficient_material: "Draw by insufficient material",
    bye: "Bye",
    manual: "Result set by an arbiter",
  };
  return reasons[String(game.termination)] || "Game finished";
}

function resultHeadline(game: any, myColour: "white" | "black") {
  if (!game) return "Game over";
  if (game.status === "aborted") return "Game aborted";
  if (game.result === "1/2-1/2") return "Draw";
  const won = (game.result === "1-0" && myColour === "white") || (game.result === "0-1" && myColour === "black");
  return won ? "You won" : "You lost";
}

function countdown(ms: number) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
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
  const tabIdRef = useRef("");
  const myPlayerKeyRef = useRef("");
  const [state, setState] = useState<PlayState | null>(null);
  const [game, setGame] = useState<any>(null);
  const [clockBaseline, setClockBaseline] = useState<ClockBaseline | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [premove, setPremove] = useState<Premove | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [premoveForPromotion, setPremoveForPromotion] = useState<PendingPromotion | null>(null);
  const [confirmAction, setConfirmAction] = useState<"resign" | "draw" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasBoardControl, setHasBoardControl] = useState(true);
  const [dismissedResultFor, setDismissedResultFor] = useState("");
  const [offlineSince, setOfflineSince] = useState<number | null>(null);

  const { columnRef, areaRef, size: boardWidth } = useBoardSizing();

  if (!tabIdRef.current && typeof window !== "undefined") {
    tabIdRef.current = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const gameId = game?._id ? String(game._id) : "";
  const gameIsActive = game?.status === "active";
  /* Derived from a value that changes every tick, so the clock actually counts
     down instead of freezing until the next server response. */
  const now = useNow(200, gameIsActive);
  const clocks = useMemo(() => deriveClocks(clockBaseline, now), [clockBaseline, now]);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${tournamentId}/state`, { cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Could not load the tournament room.");
      return;
    }
    setError("");
    const payload: PlayState = await response.json();
    setState(payload);
    setGame(payload.activeGame || null);
    setClockBaseline(clockBaselineFromGame(payload.activeGame));
  }, [tournamentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /* A premove belongs to one position on one board, so anything that changes
     which board we are looking at discards it. */
  useEffect(() => {
    setPremove(null);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setPremoveForPromotion(null);
    setDismissedResultFor("");
  }, [gameId]);

  useEffect(() => {
    if (!gameIsActive) setPremove(null);
  }, [gameIsActive]);

  const handlers = useMemo(
    () => ({
      onGameMove: (payload: any) => {
        setGame((current: any) => {
          if (!current || String(current._id) !== String(payload.gameId)) return current;
          // Ignore an event describing a position we have already passed.
          if (Number(payload.ply) <= Number(current.ply || 0)) return current;
          return {
            ...current,
            ply: payload.ply,
            fen: payload.fen,
            turn: payload.turn,
            status: payload.status,
            result: payload.result,
            whiteClockMs: payload.whiteClockMs,
            blackClockMs: payload.blackClockMs,
            lastMoveAt: payload.lastMoveAt,
            drawOfferBy: "",
            moveHistorySAN: [...(current.moveHistorySAN || []), payload.san],
            moveHistoryUCI: [...(current.moveHistoryUCI || []), payload.uci],
          };
        });
        setClockBaseline({
          whiteClockMs: Number(payload.whiteClockMs || 0),
          blackClockMs: Number(payload.blackClockMs || 0),
          turn: payload.turn === "b" ? "b" : "w",
          since: Date.now(),
          running: payload.status === "active",
        });
      },
      onGameFlags: (payload: any) => {
        setGame((current: any) => {
          if (!current || String(current._id) !== String(payload.gameId)) return current;
          const next = { ...current };
          if (payload.drawOfferBy !== undefined) next.drawOfferBy = payload.drawOfferBy;
          if (payload.berserkWhite !== undefined) next.berserkWhite = payload.berserkWhite;
          if (payload.berserkBlack !== undefined) next.berserkBlack = payload.berserkBlack;
          if (payload.whiteClockMs !== undefined) next.whiteClockMs = payload.whiteClockMs;
          if (payload.blackClockMs !== undefined) next.blackClockMs = payload.blackClockMs;
          return next;
        });
        if (payload.whiteClockMs !== undefined || payload.blackClockMs !== undefined) {
          setClockBaseline((current) =>
            current
              ? {
                  ...current,
                  whiteClockMs: payload.whiteClockMs ?? current.whiteClockMs,
                  blackClockMs: payload.blackClockMs ?? current.blackClockMs,
                  since: Date.now(),
                }
              : current
          );
        }
      },
      onClockSync: (payload: any) => {
        setClockBaseline({
          whiteClockMs: Number(payload.whiteClockMs || 0),
          blackClockMs: Number(payload.blackClockMs || 0),
          turn: payload.turn === "b" ? "b" : "w",
          since: Date.now(),
          running: true,
        });
      },
      onGameEnded: () => {
        setPremove(null);
        void refresh();
      },
      /* A pairing pass in a large arena opens dozens of boards at once. Only
         the board that is mine is worth a refetch; the rest top up the live
         list in place. */
      onPairingCreated: (payload: any) => {
        const pairings = payload?.pairings || [];
        if (findMyPairing(pairings, myPlayerKeyRef.current)) {
          void refresh();
          return;
        }
        setState((current) => (current ? { ...current, liveGames: mergeLiveGames(current.liveGames || [], pairings) } : current));
      },
      onRoundStarted: () => void refresh(),
      onRoundCompleted: () => void refresh(),
      onTournamentStatus: () => void refresh(),
      onTournamentEnded: () => void refresh(),
      onStandings: (payload: any) => {
        setState((current) =>
          current
            ? {
                ...current,
                tournament: { ...current.tournament, standings: applyLeaderboardRows(current.tournament?.standings || [], payload.rows || []) },
              }
            : current
        );
      },
      onResync: () => void refresh(),
    }),
    [refresh]
  );

  const { connected } = useTournamentSocket({ tournamentId, gameId, handlers });

  /* Only tell the player about a disconnection once it has lasted long enough
     to matter. A dialog on every momentary blip would be worse than useless. */
  useEffect(() => {
    if (connected) {
      setOfflineSince(null);
      return;
    }
    setOfflineSince((current) => current ?? Date.now());
  }, [connected]);
  const showReconnectDialog = !connected && offlineSince !== null && now - offlineSince > RECONNECT_NOTICE_MS;

  const tournamentStatus = String(state?.tournament?.status || "");
  const tournamentPlaying = ["live", "playing"].includes(tournamentStatus);
  const tournamentFinished = ["completed", "finished"].includes(tournamentStatus);
  const currentSeat = state?.currentSeat || null;
  const participantState = state?.participantState || null;
  const myColor: "white" | "black" = currentSeat?.color === "black" ? "black" : "white";
  const myPlayerKey = state?.myPlayerKey || "";
  myPlayerKeyRef.current = myPlayerKey;
  const myTurn = gameIsActive && ((game.turn === "w" && myColor === "white") || (game.turn === "b" && myColor === "black"));
  const canInteract = gameIsActive && hasBoardControl && !submitting;
  const isArena = state?.tournament?.type === "arena";
  const tieBreak = state?.tieBreak || null;
  // Memoised: a fresh `|| []` on every render would defeat the memos below it,
  // recomputing the rank and standings lookups on every clock tick.
  const standings = useMemo(() => state?.tournament?.standings || [], [state?.tournament?.standings]);

  const myStanding = useMemo(
    () => (myPlayerKey ? standings.find((entry: any) => entry.playerKey === myPlayerKey) || null : null),
    [standings, myPlayerKey]
  );
  const myRank = useMemo(() => rankOf(standings, myPlayerKey), [standings, myPlayerKey]);
  const lastRoundNumber = useMemo(
    () =>
      (state?.tournament?.roundsData || [])
        .filter((round: any) => round.status === "completed")
        .reduce((highest: number, round: any) => Math.max(highest, Number(round.roundNumber || 0)), 0),
    [state?.tournament?.roundsData]
  );

  const chess = useMemo(() => {
    try {
      return new Chess(game?.fen && game.fen !== "start" ? game.fen : undefined);
    } catch {
      return new Chess();
    }
  }, [game?.fen]);

  const firstMoveSecondsLeft = useMemo(() => {
    if (!game?.firstMoveDeadlineAt || (game.moveHistorySAN?.length || 0) > 0 || !gameIsActive) return 0;
    return Math.max(0, Math.ceil((new Date(game.firstMoveDeadlineAt).getTime() - now) / 1000));
  }, [game?.firstMoveDeadlineAt, game?.moveHistorySAN?.length, gameIsActive, now]);

  const arenaMsLeft = useMemo(
    () => (state?.arenaEndsAt ? Math.max(0, new Date(state.arenaEndsAt).getTime() - now) : 0),
    [state?.arenaEndsAt, now]
  );
  const nextRoundIn = useMemo(
    () => (state?.nextRoundAt ? Math.max(0, Number(state.nextRoundAt) - now) : 0),
    [state?.nextRoundAt, now]
  );

  /* Presence: connectivity and tab ownership only. It no longer decides games. */
  useEffect(() => {
    if (!gameId) return;
    const send = (visible = document.visibilityState === "visible", claim = false) =>
      fetch(`/api/tournaments/games/${gameId}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabId: tabIdRef.current, visible, claim }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (payload) setHasBoardControl(payload.activeTab !== false);
        })
        .catch(() => null);

    void send();
    const timer = window.setInterval(() => void send(), 10_000);
    const onVisibility = () => void send(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [gameId]);

  const claimBoard = useCallback(async () => {
    if (!gameId) return;
    const response = await fetch(`/api/tournaments/games/${gameId}/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabId: tabIdRef.current, visible: true, claim: true }),
    }).catch(() => null);
    const payload = response && response.ok ? await response.json().catch(() => null) : null;
    setHasBoardControl(payload?.activeTab !== false);
  }, [gameId]);

  const postMove = useCallback(
    async (from: string, to: string, promotion: PromotionPiece = "q", options?: { quiet?: boolean }) => {
      if (!game || submitting) return false;
      setSubmitting(true);
      setError("");
      try {
        const response = await fetch(`/api/tournaments/games/${game._id}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The ply we believe we are moving from. The server rejects the move
          // if the position has already advanced rather than applying it twice.
          body: JSON.stringify({ from, to, promotion, tabId: tabIdRef.current, expectedPly: Number(game.ply || 0) }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          if (payload?.code === "move_conflict") {
            setNotice("Your board was out of date and has been resynchronised.");
            await refresh();
          } else if (response.status === 409) {
            setHasBoardControl(false);
            setError(payload?.error || "This board is open in another tab.");
          } else if (options?.quiet) {
            setNotice("Premove cancelled because the position changed.");
          } else {
            setError(payload?.error || "Could not register move.");
          }
          return false;
        }
        const payload = await response.json().catch(() => null);
        if (payload?.game) {
          setGame(payload.game);
          setClockBaseline(clockBaselineFromGame({ ...payload.game, serverNow: Date.now() }));
        }
        setSelectedSquare(null);
        setNotice("");
        return true;
      } finally {
        setSubmitting(false);
      }
    },
    [game, refresh, submitting]
  );

  /* Run a queued premove the moment the turn arrives, if it is still legal in
     the position the opponent actually created. */
  useEffect(() => {
    if (!myTurn || !premove || !gameIsActive || submitting || !hasBoardControl) return;
    const queued = premove;
    setPremove(null);
    const legal = chess
      .moves({ square: queued.from as any, verbose: true })
      .some((candidate: any) => candidate.to === queued.to && (!candidate.promotion || candidate.promotion === (queued.promotion || "q")));
    if (!legal) {
      setNotice("Premove cancelled: it is no longer legal in this position.");
      return;
    }
    void postMove(queued.from, queued.to, queued.promotion || "q", { quiet: true });
  }, [myTurn, premove, gameIsActive, submitting, hasBoardControl, chess, postMove]);

  const ownColorCode = myColor === "white" ? "w" : "b";

  function premoveNeedsPromotion(from: string, to: string) {
    const piece = chess.get(from as any);
    if (!piece || piece.type !== "p" || piece.color !== ownColorCode) return false;
    return ownColorCode === "w" ? to.endsWith("8") : to.endsWith("1");
  }

  function queuePremove(from: string, to: string) {
    if (premoveNeedsPromotion(from, to)) {
      setPremoveForPromotion({ from, to });
      return;
    }
    setPremove({ from, to });
    setNotice("");
    setSelectedSquare(null);
  }

  function onDrop(source: string, target: string) {
    if (!canInteract) return false;
    if (!myTurn) {
      const piece = chess.get(source as any);
      if (piece?.color !== ownColorCode) return false;
      queuePremove(source, target);
      // The piece snaps back; the premove highlight carries the intent.
      return false;
    }
    if (isPromotionMove(chess, source, target)) {
      setPendingPromotion({ from: source, to: target });
      return false;
    }
    void postMove(source, target);
    return true;
  }

  function onPromotionPieceSelect(piece?: string, from?: string, to?: string) {
    const promotion = promotionFromBoardPiece(piece);
    const target = from && to ? { from, to } : premoveForPromotion || pendingPromotion;
    const wasPremove = Boolean(premoveForPromotion);
    setPendingPromotion(null);
    setPremoveForPromotion(null);
    if (!promotion || !target) return false;
    if (wasPremove || !myTurn) {
      setPremove({ from: target.from, to: target.to, promotion });
      setNotice("");
      setSelectedSquare(null);
      return true;
    }
    void postMove(target.from, target.to, promotion);
    return true;
  }

  const moveTargets = useMemo(
    () => (selectedSquare && canInteract ? legalTargetsFromGame(chess, selectedSquare) : []),
    [selectedSquare, canInteract, chess]
  );

  const boardSquareStyles = useMemo(() => {
    const history = game?.moveHistoryUCI || [];
    const occupied = new Set<string>();
    for (const row of chess.board()) {
      for (const square of row) {
        if (square?.square) occupied.add(square.square);
      }
    }
    return buildBoardSquareStyles({
      targets: moveTargets,
      selectedSquare,
      lastMoveUci: history.length ? String(history[history.length - 1]) : null,
      checkSquare: chess.isCheck() ? findKingSquare(chess.board() as any, chess.turn()) : null,
      premove,
      occupied,
    });
  }, [moveTargets, selectedSquare, game?.moveHistoryUCI, chess, premove]);

  function onSquareClick(square: string) {
    if (!canInteract) return;
    const clickedPiece = chess.get(square as any);

    if (premove && (square === premove.from || square === premove.to)) {
      setPremove(null);
      setSelectedSquare(null);
      return;
    }

    if (!myTurn) {
      if (!selectedSquare && clickedPiece?.color === ownColorCode) {
        setSelectedSquare(square);
        return;
      }
      if (selectedSquare && selectedSquare !== square) {
        queuePremove(selectedSquare, square);
        return;
      }
      setSelectedSquare(null);
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
    if (!game) return;
    setError("");
    const response = await fetch(`/api/tournaments/games/${game._id}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, tabId: tabIdRef.current }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error || "Could not update game result.");
      return;
    }
    if (payload?.drawOffered) setNotice("Draw offer sent.");
    else if (payload?.drawDeclined) setNotice("Draw offer declined.");
    else if (payload?.berserked) setNotice("Berserk activated - half the clock, no increment.");
    if (payload?.game) {
      setGame(payload.game);
      setClockBaseline(clockBaselineFromGame({ ...payload.game, serverNow: Date.now() }));
    } else {
      await refresh();
    }
  }

  async function setQueueStatus(action: "pause" | "resume") {
    setError("");
    const response = await fetch(`/api/tournaments/${tournamentId}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error || "Could not update your Arena status.");
      return;
    }
    setNotice(
      action === "pause"
        ? payload?.finishingGame
          ? "Paused. You will not be paired again after this game finishes."
          : "Paused. You will not be paired until you resume."
        : "Back in the queue. Looking for an opponent."
    );
    await refresh();
  }

  const drawOffered = Boolean(game?.drawOfferBy && game.drawOfferBy !== myPlayerKey);
  const canBerserkNow =
    state?.berserkAvailable &&
    gameIsActive &&
    Number(game?.ply || 0) === (myColor === "white" ? 0 : 1) &&
    !(myColor === "white" ? game?.berserkWhite : game?.berserkBlack);

  const opponentIsWhite = myColor === "black";
  const opponentName = opponentIsWhite ? game?.whiteName : game?.blackName;
  const opponentKey = opponentIsWhite ? game?.whiteKey : game?.blackKey;
  const myName = opponentIsWhite ? game?.blackName : game?.whiteName;
  const standingFor = (key: string) => standings.find((entry: any) => entry.playerKey === key);

  const statusKind: GameStatusKind = !gameIsActive
    ? "over"
    : !connected
      ? "reconnecting"
      : !hasBoardControl
        ? "read-only"
        : drawOffered
          ? "draw-offered"
          : premove
            ? "premove"
            : myTurn
              ? "your-move"
              : "their-move";

  const statusDetail =
    statusKind === "premove"
      ? `${premove?.from}-${premove?.to}${premove?.promotion ? `=${premove.promotion.toUpperCase()}` : ""} plays as soon as it is your turn`
      : statusKind === "read-only"
        ? "This board is open in another tab or device."
        : statusKind === "draw-offered"
          ? "Accept below, or play on to decline."
          : statusKind === "over"
            ? terminationLabel(game)
            : firstMoveSecondsLeft > 0
              ? `Make your first move within ${firstMoveSecondsLeft}s, or the board is abandoned`
              : undefined;

  const showResultDialog = Boolean(game) && !gameIsActive && dismissedResultFor !== gameId;

  const sidePanelProps = {
    moves: game?.moveHistorySAN || [],
    standings,
    myPlayerKey,
    tieBreak,
    liveGames: state?.liveGames || [],
    tournamentId,
  };

  return (
    <div className="min-h-screen pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-[1400px] px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
        {/* Compact header: the board is the point of this screen, not the title. */}
        <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-slate-950 sm:text-lg">{state?.tournament?.name || "Tournament"}</h1>
              <span className="chip shrink-0">{isArena ? "Arena" : "Swiss"}</span>
              <span
                title={connected ? "Live connection" : "Reconnecting"}
                className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold ${connected ? "text-emerald-600" : "text-amber-600"}`}
              >
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span className="hidden sm:inline">{connected ? "Live" : "Reconnecting"}</span>
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
              {game ? (
                <span>
                  Board {game.tableNumber || "-"}
                  {game.roundNumber ? ` - Round ${game.roundNumber}` : ""}
                </span>
              ) : null}
              {isArena && arenaMsLeft > 0 ? <span className="tabular-nums">Arena ends in {countdown(arenaMsLeft)}</span> : null}
              {myStanding ? (
                <span className="tabular-nums">
                  #{myRank} - {myStanding.points} pts
                </span>
              ) : null}
              {guestLabel || state?.guestUsername ? <span>Guest: {guestLabel || state?.guestUsername}</span> : null}
            </div>
          </div>
          <Link href={backHref || `/tournaments/${tournamentId}`} className="btn-outline min-h-11">
            <ArrowLeft size={15} aria-hidden /> {backLabel || (isArena ? "Arena" : "Tournament")}
          </Link>
        </header>

        {error ? (
          <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <span className="flex-1">{notice}</span>
            <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message" className="text-slate-400 hover:text-slate-600">
              <X size={14} aria-hidden />
            </button>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          {game ? (
            <section ref={columnRef} className="flex min-w-0 flex-col gap-2">
              <PlayerBar
                name={opponentName || "Opponent"}
                rating={opponentIsWhite ? game.whiteRating : game.blackRating}
                clockMs={opponentIsWhite ? clocks.whiteClockMs : clocks.blackClockMs}
                active={gameIsActive && game.turn === (opponentIsWhite ? "w" : "b")}
                running={gameIsActive}
                rank={rankOf(standings, opponentKey) || undefined}
                points={standingFor(opponentKey)?.points}
                onStreak={standingFor(opponentKey)?.onStreak}
                berserk={opponentIsWhite ? game.berserkWhite : game.berserkBlack}
              />

              {/* Square, absolutely-filled area: measuring it can never feed back
                  into the size of the board it contains. */}
              <div ref={areaRef} className="relative mx-auto aspect-square w-full">
                <div className="absolute inset-0 flex items-center justify-center" style={{ touchAction: "none" }}>
                  <Chessboard
                    id={`tournament-board-${game._id}`}
                    position={game.fen === "start" ? new Chess().fen() : game.fen}
                    boardWidth={boardWidth}
                    onPieceDrop={onDrop}
                    onSquareClick={onSquareClick as any}
                    onPromotionPieceSelect={onPromotionPieceSelect as any}
                    showPromotionDialog={Boolean(pendingPromotion || premoveForPromotion)}
                    promotionToSquare={(pendingPromotion?.to || premoveForPromotion?.to) as any}
                    promotionDialogVariant="modal"
                    arePiecesDraggable={canInteract}
                    boardOrientation={myColor}
                    customSquareStyles={boardSquareStyles as any}
                    customDarkSquareStyle={{ backgroundColor: BOARD_DARK_SQUARE }}
                    customLightSquareStyle={{ backgroundColor: BOARD_LIGHT_SQUARE }}
                    customBoardStyle={{ borderRadius: "0.5rem", boxShadow: "0 10px 34px rgba(42, 9, 54, 0.16)" }}
                  />
                </div>
              </div>

              <PlayerBar
                name={myName || "You"}
                rating={opponentIsWhite ? game.blackRating : game.whiteRating}
                clockMs={opponentIsWhite ? clocks.blackClockMs : clocks.whiteClockMs}
                active={gameIsActive && game.turn === (opponentIsWhite ? "b" : "w")}
                running={gameIsActive}
                rank={myRank || undefined}
                points={myStanding?.points}
                onStreak={myStanding?.onStreak}
                berserk={opponentIsWhite ? game.berserkBlack : game.berserkWhite}
                isYou
              />

              <GameStatus
                kind={statusKind}
                detail={statusDetail}
                action={
                  statusKind === "read-only" ? (
                    <button type="button" onClick={claimBoard} className="rounded-md bg-amber-700 px-2.5 py-1 text-xs font-semibold text-white">
                      Play here
                    </button>
                  ) : statusKind === "premove" ? (
                    <button type="button" onClick={() => setPremove(null)} className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-teal-800">
                      Cancel
                    </button>
                  ) : null
                }
              />

              {/* Controls sit below the board and never over it. */}
              <div className="flex flex-wrap items-center gap-2">
                {gameIsActive ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmAction("resign")}
                      disabled={!hasBoardControl}
                      className="btn min-h-11 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      <Flag size={15} aria-hidden /> Resign
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmAction("draw")}
                      disabled={!hasBoardControl}
                      className="btn-outline min-h-11 disabled:opacity-50"
                    >
                      <Handshake size={15} aria-hidden /> {drawOffered ? "Accept draw" : "Offer draw"}
                    </button>
                    {drawOffered ? (
                      <button type="button" onClick={() => submitResult("decline_draw")} className="btn-ghost min-h-11">
                        <X size={15} aria-hidden /> Decline
                      </button>
                    ) : null}
                    {canBerserkNow ? (
                      <button type="button" onClick={() => submitResult("berserk")} className="btn-accent min-h-11">
                        <Zap size={15} aria-hidden /> Berserk
                      </button>
                    ) : null}
                  </>
                ) : null}
                {isArena && tournamentPlaying ? (
                  participantState?.status === "paused" ? (
                    <button type="button" onClick={() => setQueueStatus("resume")} className="btn min-h-11 bg-emerald-600 text-white hover:bg-emerald-700">
                      <Play size={15} aria-hidden /> Resume queue
                    </button>
                  ) : (
                    <button type="button" onClick={() => setQueueStatus("pause")} className="btn-ghost min-h-11">
                      <Pause size={15} aria-hidden /> Pause after this game
                    </button>
                  )
                ) : null}
              </div>

              {/* Below the board where the panel column has collapsed under it. */}
              <div className="mt-2 lg:hidden">
                <SidePanel {...sidePanelProps} stacked={false} />
              </div>
            </section>
          ) : (
            <section ref={columnRef} className="min-w-0">
              <WaitingPanel
                state={state}
                publicRoom={publicRoom}
                tournamentFinished={tournamentFinished}
                tournamentPlaying={tournamentPlaying}
                isArena={isArena}
                currentSeat={currentSeat}
                roundProgress={state?.roundProgress || null}
                nextRoundIn={nextRoundIn}
                tournamentId={tournamentId}
                isPaused={participantState?.status === "paused"}
                myStanding={myStanding}
                myRank={myRank}
                lastRoundNumber={lastRoundNumber}
                onQueue={setQueueStatus}
                onRefresh={refresh}
              />
            </section>
          )}

          <aside className="hidden lg:block">
            <SidePanel {...sidePanelProps} stacked />
          </aside>
        </div>
      </div>

      <GameDialog
        open={confirmAction !== null}
        title={confirmAction === "resign" ? "Resign this game?" : drawOffered ? "Accept the draw?" : "Offer a draw?"}
        description={
          confirmAction === "resign"
            ? "The game ends immediately and the point goes to your opponent."
            : drawOffered
              ? "The game ends now as a draw and you each take half a point."
              : "Your opponent can accept, or decline simply by playing on."
        }
        tone={confirmAction === "resign" ? "danger" : "default"}
        onClose={() => setConfirmAction(null)}
      >
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmAction(null)} className="btn-ghost min-h-11">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const action = confirmAction;
              setConfirmAction(null);
              if (action) void submitResult(action);
            }}
            className={confirmAction === "resign" ? "btn min-h-11 bg-red-600 text-white hover:bg-red-700" : "btn-primary min-h-11"}
          >
            {confirmAction === "resign" ? "Resign" : drawOffered ? "Accept draw" : "Offer draw"}
          </button>
        </div>
      </GameDialog>

      <GameDialog
        open={showResultDialog}
        title={resultHeadline(game, myColor)}
        description={`${terminationLabel(game)}${opponentName ? ` against ${opponentName}` : ""}.`}
        tone={resultHeadline(game, myColor) === "You won" ? "success" : "default"}
        onClose={() => setDismissedResultFor(gameId)}
      >
        {myStanding ? (
          <dl className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Your rank</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-950">#{myRank}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Your score</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-950">{myStanding.points} pts</dd>
            </div>
          </dl>
        ) : null}
        {myStanding?.onStreak ? (
          <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700">
            You are on a streak - your next game scores double.
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Link href={backHref || `/tournaments/${tournamentId}`} className="btn-ghost min-h-11 justify-center">
            <ArrowLeft size={15} aria-hidden /> {isArena ? "Back to Arena" : "Back to Tournament"}
          </Link>
          <button
            type="button"
            onClick={() => {
              setDismissedResultFor(gameId);
              void refresh();
            }}
            className="btn-primary min-h-11 justify-center"
          >
            {isArena ? "Find next opponent" : "Continue"}
          </button>
        </div>
      </GameDialog>

      <GameDialog
        open={showReconnectDialog}
        title="Reconnecting"
        description="You have lost your connection to the tournament. Your game is safe on the server and your clock is still running - this clears as soon as you are back."
        dismissible={false}
        onClose={() => undefined}
      >
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => void refresh()} className="btn-primary min-h-11">
            <RefreshCcw size={15} aria-hidden /> Try now
          </button>
        </div>
      </GameDialog>
    </div>
  );
}

/**
 * What a player sees when they have no board.
 *
 * A student who finished early used to get an empty dashed panel and a refresh
 * button. They now get their result, their standing, how far the round has got,
 * the boards still playing, and what happens next.
 */
function WaitingPanel({
  state,
  publicRoom,
  tournamentFinished,
  tournamentPlaying,
  isArena,
  currentSeat,
  roundProgress,
  nextRoundIn,
  tournamentId,
  isPaused,
  myStanding,
  myRank,
  lastRoundNumber,
  onQueue,
  onRefresh,
}: {
  state: PlayState | null;
  publicRoom: boolean;
  tournamentFinished: boolean;
  tournamentPlaying: boolean;
  isArena: boolean;
  currentSeat: any;
  roundProgress: any;
  nextRoundIn: number;
  tournamentId: string;
  isPaused: boolean;
  myStanding: any;
  myRank: number;
  lastRoundNumber: number;
  onQueue: (action: "pause" | "resume") => void;
  onRefresh: () => void;
}) {
  const liveGames = state?.liveGames || [];
  const waitingForOpponent = Boolean(tournamentPlaying && isArena && state?.joined && !isPaused);
  const roundDone = Boolean(roundProgress && roundProgress.total > 0 && roundProgress.completed >= roundProgress.total);

  /* A Swiss player who finishes early moves through a definite sequence, and
     each step says what is happening and what happens next. */
  const swissStage =
    !isArena && tournamentPlaying && state?.joined
      ? roundProgress && !roundDone
        ? "playing-round"
        : nextRoundIn > 0
          ? "counting-down"
          : roundDone || lastRoundNumber > 0
            ? "pairing"
            : null
      : null;

  const headline = !state?.joined
    ? "Join this tournament first"
    : tournamentFinished
      ? "Tournament finished"
      : isPaused && isArena
        ? "You are paused"
        : waitingForOpponent
          ? "Finding your next opponent"
          : swissStage === "playing-round"
            ? `Waiting for round ${roundProgress.roundNumber} to finish`
            : swissStage === "counting-down"
              ? `Round ${lastRoundNumber} complete`
              : swissStage === "pairing"
                ? "Pairings are being generated"
                : tournamentPlaying
                  ? "Waiting for your next pairing"
                  : "The tournament has not started yet";

  const detail =
    isPaused && isArena
      ? "You will not be paired again until you rejoin the queue."
      : !state?.joined
        ? publicRoom
          ? "Finish the guest join step first. Once you are registered on this device your pairing appears here automatically."
          : "You can watch the event, but you will only be paired after joining from the tournament page."
        : tournamentFinished
          ? "Final standings are on the tournament page."
          : waitingForOpponent
            ? "Your board opens here the moment an opponent is free. You do not need to refresh."
            : swissStage === "playing-round"
              ? `${roundProgress.completed} of ${roundProgress.total} games complete. Your next board opens when the round ends.`
              : swissStage === "counting-down"
                ? `Round ${lastRoundNumber + 1} starts in ${countdown(nextRoundIn)}.`
                : swissStage === "pairing"
                  ? "Your next opponent appears here in a moment. You do not need to refresh."
                  : tournamentPlaying
                    ? "Your board appears automatically."
                    : "When the scheduled start time arrives the tournament opens and boards are assigned automatically.";

  const busy = waitingForOpponent || swissStage === "playing-round" || swissStage === "pairing";

  return (
    <div className="card">
      <div className="py-4 text-center sm:py-8">
        {busy ? (
          <span className="mx-auto mb-3 flex h-1.5 w-24 overflow-hidden rounded-full bg-slate-200" aria-hidden>
            <span className="h-full w-1/3 animate-pulse rounded-full bg-brand motion-reduce:animate-none" />
          </span>
        ) : null}
        <h2 className="text-lg font-semibold text-slate-950">{headline}</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">{detail}</p>
      </div>

      {(currentSeat?.status === "completed" && currentSeat.opponentName) || myStanding ? (
        <div className="mx-auto grid w-full max-w-md gap-2 sm:grid-cols-2">
          {currentSeat?.status === "completed" && currentSeat.opponentName ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Your last result</div>
              <div className="mt-0.5 font-semibold text-slate-900">{currentSeat.result === "*" ? "No result" : currentSeat.result}</div>
              <div className="text-xs text-slate-500">vs {currentSeat.opponentName}</div>
            </div>
          ) : null}
          {myStanding ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Your standing</div>
              <div className="mt-0.5 font-semibold tabular-nums text-slate-900">
                #{myRank} - {myStanding.points} pts
              </div>
              <div className="text-xs text-slate-500">
                {myStanding.gamesPlayed} game{myStanding.gamesPlayed === 1 ? "" : "s"} played
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {roundProgress && roundProgress.total > 0 ? (
        <div className="mx-auto mt-4 w-full max-w-md">
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Round {roundProgress.roundNumber}</span>
            <span className="tabular-nums">
              {roundProgress.completed} / {roundProgress.total}
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={roundProgress.total}
            aria-valuenow={roundProgress.completed}
            aria-label={`Round ${roundProgress.roundNumber} progress`}
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${Math.round((roundProgress.completed / Math.max(1, roundProgress.total)) * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {liveGames.length ? (
        <div className="mx-auto mt-5 w-full max-w-xl">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Games still being played</h3>
          <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200/80">
            {liveGames.slice(0, 6).map((liveGame: any) => (
              <li key={String(liveGame._id)} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="w-6 shrink-0 text-right text-xs font-bold tabular-nums text-slate-400">{liveGame.tableNumber || "-"}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {liveGame.whiteName} <span className="text-slate-400">vs</span> {liveGame.blackName || "Bye"}
                </span>
                <Link
                  href={`/tournaments/${tournamentId}/games/${liveGame._id}`}
                  className="inline-flex h-9 shrink-0 items-center rounded-lg px-2.5 text-xs font-semibold text-brand hover:bg-brand-50"
                >
                  Watch
                </Link>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href={`/tournaments/${tournamentId}`} className="btn-primary min-h-11">
          <Trophy size={15} aria-hidden /> Tournament centre
        </Link>
        {isArena && tournamentPlaying && state?.joined ? (
          isPaused ? (
            <button type="button" onClick={() => onQueue("resume")} className="btn min-h-11 bg-emerald-600 text-white hover:bg-emerald-700">
              <Play size={15} aria-hidden /> Rejoin the queue
            </button>
          ) : (
            <button type="button" onClick={() => onQueue("pause")} className="btn-ghost min-h-11">
              <Pause size={15} aria-hidden /> Stop pairing me
            </button>
          )
        ) : null}
        <button type="button" onClick={onRefresh} className="btn-outline min-h-11">
          <RefreshCcw size={15} aria-hidden /> Refresh
        </button>
      </div>
    </div>
  );
}
