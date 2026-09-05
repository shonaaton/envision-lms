"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { ArrowLeft, Eye, RefreshCcw, Repeat } from "lucide-react";
import { useTournamentSocket } from "@/lib/useTournamentSocket";
import { clockBaselineFromGame, deriveClocks, useNow, type ClockBaseline } from "@/lib/useLiveClock";
import { BOARD_DARK_SQUARE, BOARD_LIGHT_SQUARE, buildBoardSquareStyles, findKingSquare } from "@/lib/tournament/boardTheme";
import { MoveList } from "./game/MoveList";
import { PlayerBar } from "./game/PlayerBar";
import { useBoardSizing } from "./game/useBoardSizing";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

function resultLabel(game: any) {
  if (!game) return "-";
  if (game.status === "active") return "In progress";
  if (game.status === "aborted") return "Aborted";
  if (game.result === "1/2-1/2") return "Draw";
  if (game.result === "1-0") return "White won";
  if (game.result === "0-1") return "Black won";
  return game.result || "-";
}

/**
 * Watching someone else's board.
 *
 * Read-only by construction: there is no move path in this component at all,
 * so spectating cannot become playing however the state is manipulated. It
 * shares the board, clock and move list with the playing screen so a game
 * looks the same whoever is looking at it.
 */
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
  const [game, setGame] = useState(initialGame);
  const [tournament, setTournament] = useState(initialTournament);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [clockBaseline, setClockBaseline] = useState<ClockBaseline | null>(() => clockBaselineFromGame(initialGame));
  const [error, setError] = useState("");

  const { columnRef, areaRef, size: boardWidth } = useBoardSizing();
  const gameIsActive = game?.status === "active";
  const now = useNow(250, gameIsActive);
  const clocks = useMemo(() => deriveClocks(clockBaseline, now), [clockBaseline, now]);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/tournaments/games/${gameId}`, { cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error || "Could not refresh this board.");
      return;
    }
    const payload = await response.json();
    setGame(payload.game);
    setTournament(payload.tournament);
    setClockBaseline(clockBaselineFromGame({ ...payload.game, serverNow: payload.serverNow }));
    setError("");
  }, [gameId]);

  const handlers = useMemo(
    () => ({
      onGameMove: (payload: any) => {
        if (String(payload.gameId) !== String(gameId)) return;
        setGame((current: any) => {
          if (current && Number(payload.ply) <= Number(current.ply || 0)) return current;
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
            moveHistorySAN: [...(current?.moveHistorySAN || []), payload.san],
            moveHistoryUCI: [...(current?.moveHistoryUCI || []), payload.uci],
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
      onGameEnded: () => void refresh(),
      onResync: () => void refresh(),
    }),
    [gameId, refresh]
  );

  const { connected } = useTournamentSocket({ tournamentId, gameId, handlers });

  const chess = useMemo(() => {
    try {
      return new Chess(game?.fen && game.fen !== "start" ? game.fen : undefined);
    } catch {
      return new Chess();
    }
  }, [game?.fen]);

  const squareStyles = useMemo(() => {
    const history = game?.moveHistoryUCI || [];
    return buildBoardSquareStyles({
      lastMoveUci: history.length ? String(history[history.length - 1]) : null,
      checkSquare: chess.isCheck() ? findKingSquare(chess.board() as any, chess.turn()) : null,
    });
  }, [game?.moveHistoryUCI, chess]);

  const topIsWhite = orientation === "black";

  return (
    <div className="min-h-screen pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-[1400px] px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
        <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="chip shrink-0">
                <Eye size={12} aria-hidden /> Watching
              </span>
              <h1 className="truncate text-base font-semibold text-slate-950 sm:text-lg">{tournament?.name || "Tournament"}</h1>
              <span
                className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold ${connected ? "text-emerald-600" : "text-amber-600"}`}
              >
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} />
                <span className="hidden sm:inline">{connected ? "Live" : "Reconnecting"}</span>
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Board {game?.tableNumber || "-"}
              {game?.roundNumber ? ` - Round ${game.roundNumber}` : ""} - {resultLabel(game)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOrientation((value) => (value === "white" ? "black" : "white"))}
              className="btn-ghost min-h-11"
              aria-label="Flip the board"
            >
              <Repeat size={15} aria-hidden /> Flip
            </button>
            <Link href={`/tournaments/${tournamentId}`} className="btn-outline min-h-11">
              <ArrowLeft size={15} aria-hidden /> Tournament
            </Link>
          </div>
        </header>

        {error ? (
          <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section ref={columnRef} className="flex min-w-0 flex-col gap-2">
            <PlayerBar
              name={topIsWhite ? game?.whiteName : game?.blackName || "Black"}
              rating={topIsWhite ? game?.whiteRating : game?.blackRating}
              clockMs={topIsWhite ? clocks.whiteClockMs : clocks.blackClockMs}
              active={gameIsActive && game?.turn === (topIsWhite ? "w" : "b")}
              running={gameIsActive}
              berserk={topIsWhite ? game?.berserkWhite : game?.berserkBlack}
            />

            <div ref={areaRef} className="relative mx-auto aspect-square w-full">
              <div className="absolute inset-0 flex items-center justify-center">
                <Chessboard
                  id={`spectator-${gameId}`}
                  position={game?.fen === "start" ? new Chess().fen() : game?.fen}
                  boardWidth={boardWidth}
                  arePiecesDraggable={false}
                  boardOrientation={orientation}
                  customSquareStyles={squareStyles as any}
                  customDarkSquareStyle={{ backgroundColor: BOARD_DARK_SQUARE }}
                  customLightSquareStyle={{ backgroundColor: BOARD_LIGHT_SQUARE }}
                  customBoardStyle={{ borderRadius: "0.5rem", boxShadow: "0 10px 34px rgba(42, 9, 54, 0.16)" }}
                />
              </div>
            </div>

            <PlayerBar
              name={topIsWhite ? game?.blackName : game?.whiteName || "White"}
              rating={topIsWhite ? game?.blackRating : game?.whiteRating}
              clockMs={topIsWhite ? clocks.blackClockMs : clocks.whiteClockMs}
              active={gameIsActive && game?.turn === (topIsWhite ? "b" : "w")}
              running={gameIsActive}
              berserk={topIsWhite ? game?.berserkBlack : game?.berserkWhite}
            />

            {!gameIsActive ? (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                {resultLabel(game)}
                <span className="ml-2 font-normal text-slate-500">{game?.termination || ""}</span>
              </div>
            ) : null}
          </section>

          <aside className="space-y-4">
            <section>
              <h2 className="mb-1.5 px-0.5 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Moves</h2>
              <div className="max-h-[28rem] overflow-y-auto overscroll-contain rounded-lg border border-slate-200/80 bg-white">
                <MoveList moves={game?.moveHistorySAN || []} />
              </div>
            </section>
            <button type="button" onClick={refresh} className="btn-outline min-h-11 w-full">
              <RefreshCcw size={15} aria-hidden /> Refresh
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
