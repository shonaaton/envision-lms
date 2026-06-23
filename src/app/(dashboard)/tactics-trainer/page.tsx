"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { CheckCircle2, Coins, Crosshair, Lightbulb, Loader2, RotateCcw, Sparkles, Target, Trophy, Zap } from "lucide-react";
import { toast } from "sonner";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

type Puzzle = {
  id: string;
  externalId?: string;
  source?: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  gameUrl?: string;
  openingTags?: string[];
};

type Result = { solved: boolean; xp: number; coins: number; badge?: string; demo?: { isDemo: boolean; remaining: number; limit: number; used: number } };

function uciToMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || "q" };
}

function moveToUci(move: { from: string; to: string; promotion?: string }) {
  return `${move.from}${move.to}${move.promotion && move.promotion !== "q" ? move.promotion : ""}`.toLowerCase();
}

function makeGame(fen: string) {
  try {
    return new Chess(fen);
  } catch {
    return new Chess();
  }
}

function applyMove(game: Chess, uci: string) {
  try {
    return game.move(uciToMove(uci));
  } catch {
    return null;
  }
}

function initialPuzzleGame(puzzle: Puzzle) {
  const game = makeGame(puzzle.fen);
  if (puzzle.moves[0]) applyMove(game, puzzle.moves[0]);
  return game;
}

function legalDestinations(game: Chess, square: string) {
  try {
    return game.moves({ square, verbose: true } as any).map((move: any) => move.to);
  } catch {
    return [];
  }
}

function themeLabel(theme: string) {
  return theme.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

export default function TacticsTrainerPage() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [fen, setFen] = useState("start");
  const [ply, setPly] = useState(1);
  const [selected, setSelected] = useState("");
  const [possibleSquares, setPossibleSquares] = useState<string[]>([]);
  const [submittedMoves, setSubmittedMoves] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("Load a puzzle and find the best move.");
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState(560);

  const game = useMemo(() => makeGame(fen), [fen]);
  const sideToMove = game.turn() === "w" ? "White" : "Black";
  const progress = puzzle ? Math.max(0, Math.floor((ply - 1) / 2)) : 0;
  const totalPlayerMoves = puzzle ? Math.floor(puzzle.moves.length / 2) : 0;

  const loadPuzzle = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setSelected("");
    setPossibleSquares([]);
    setSubmittedMoves([]);
    setMistakes(0);
    setHintsUsed(0);
    setSeconds(0);
    setStartedAt(Date.now());
    try {
      const response = await fetch("/api/tactics-trainer?max=1200");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not load puzzle");
      const nextPuzzle: Puzzle = payload.puzzle;
      const nextGame = initialPuzzleGame(nextPuzzle);
      setPuzzle(nextPuzzle);
      setFen(nextGame.fen());
      setPly(1);
      setMessage("Find the best move.");
    } catch (error: any) {
      toast.error(error?.message || "Could not load puzzle");
      setMessage("Could not load a puzzle.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPuzzle();
  }, [loadPuzzle]);

  useEffect(() => {
    if (!puzzle || result) return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [puzzle, result, startedAt]);

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;
    const resize = () => {
      const availableHeight = window.innerHeight - 240;
      setBoardSize(Math.max(310, Math.min(620, element.clientWidth, availableHeight)));
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

  async function saveResult(solvedMoves: string[]) {
    if (!puzzle || saving || result) return;
    setSaving(true);
    try {
      const response = await fetch("/api/tactics-trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puzzleId: puzzle.id,
          submittedMoves: solvedMoves,
          mistakes,
          hintsUsed,
          timeSeconds: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not save puzzle result");
      setResult(payload);
      setMessage(payload.solved ? "Solved. XP added to leaderboard." : "Attempt saved.");
    } catch (error: any) {
      toast.error(error?.message || "Could not save result");
      setMessage(error?.message || "Could not save result.");
    } finally {
      setSaving(false);
    }
  }

  function attemptMove(sourceSquare: string, targetSquare: string, promotion = "q") {
    if (!puzzle || result || loading) return false;
    const expected = puzzle.moves[ply];
    const played = moveToUci({ from: sourceSquare, to: targetSquare, promotion });
    const currentGame = makeGame(fen);

    if (played !== expected) {
      setMistakes((value) => value + 1);
      setMessage("Not quite. Try another candidate move.");
      setSelected("");
      setPossibleSquares([]);
      return false;
    }

    const move = currentGame.move({ from: sourceSquare, to: targetSquare, promotion });
    if (!move) {
      setMessage("That move cannot be played from this position.");
      return false;
    }

    const nextSubmitted = [...submittedMoves, played];
    let nextPly = ply + 1;
    const reply = puzzle.moves[nextPly];
    if (reply) {
      window.setTimeout(() => {
        const replyGame = makeGame(currentGame.fen());
        applyMove(replyGame, reply);
        setFen(replyGame.fen());
        setPly(nextPly + 1);
        setMessage("Good. Continue the tactic.");
      }, 260);
      setFen(currentGame.fen());
      setPly(nextPly);
    } else {
      setFen(currentGame.fen());
      setPly(nextPly);
      saveResult(nextSubmitted);
    }

    setSubmittedMoves(nextSubmitted);
    setSelected("");
    setPossibleSquares([]);
    return true;
  }

  function onSquareClick(square: string) {
    if (!puzzle || result) return;
    if (selected && possibleSquares.includes(square)) {
      attemptMove(selected, square);
      return;
    }
    const piece = game.get(square as any);
    if (!piece || piece.color !== game.turn()) {
      setSelected("");
      setPossibleSquares([]);
      return;
    }
    setSelected(square);
    setPossibleSquares(legalDestinations(game, square));
  }

  function showHint() {
    if (!puzzle || result) return;
    const expected = puzzle.moves[ply];
    if (!expected) return;
    setHintsUsed((value) => value + 1);
    setSelected(expected.slice(0, 2));
    setPossibleSquares([expected.slice(2, 4)]);
    setMessage(`Hint: look at ${expected.slice(0, 2).toUpperCase()}.`);
  }

  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (selected) styles[selected] = { background: "rgba(90,19,114,0.28)" };
    possibleSquares.forEach((square) => {
      styles[square] = {
        ...(styles[square] || {}),
        background: `radial-gradient(circle, rgba(33,110,57,0.55) 0%, rgba(33,110,57,0.55) 18%, transparent 20%)`,
      };
    });
    return styles;
  }, [selected, possibleSquares]);

  return (
    <div className="flex h-[calc(100vh-92px)] min-h-[640px] flex-col overflow-hidden bg-[linear-gradient(180deg,#fffdf6_0%,#fff_45%,#faf8fc_100%)] p-4 text-slate-950">
      <header className="mb-3 flex flex-none flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
            <Crosshair size={14} /> Tactics Trainer
          </div>
          <h1 className="mt-2 text-2xl font-black text-brand">Solve Chess Tactics</h1>
          <p className="mt-1 text-sm text-slate-600">Imported Lichess-style puzzles, automatic replies, XP, coins, and leaderboard points.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MiniHeader label="Puzzle" value={puzzle ? `${progress}/${totalPlayerMoves}` : "-"} icon={<Target size={14} />} />
          <MiniHeader label="Time" value={`${seconds}s`} icon={<Sparkles size={14} />} />
          <MiniHeader label="Mistakes" value={mistakes} icon={<Trophy size={14} />} />
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_330px]">
        <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-brand/5">
          <div className="rounded-2xl bg-brand p-4 text-white">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-accent">Current Task</div>
            <div className="mt-2 text-2xl font-black">{sideToMove} to move</div>
            <p className="mt-2 text-sm text-white/80">{message}</p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <InfoTile label="Rating" value={puzzle?.rating || "-"} />
            <InfoTile label="Hints" value={hintsUsed} />
            <InfoTile label="Moves" value={`${progress}/${totalPlayerMoves}`} />
            <InfoTile label="Source" value={puzzle?.source === "lichess" ? "Lichess" : "Starter"} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={loadPuzzle} className="btn-primary" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} New Puzzle
            </button>
            <button onClick={showHint} className="btn-outline" disabled={!puzzle || !!result}>
              <Lightbulb size={16} /> Hint
            </button>
          </div>

          {result ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <div className="flex items-center gap-2 font-black"><CheckCircle2 size={18} /> {result.solved ? "Puzzle Solved" : "Attempt Saved"}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-white p-3"><Zap size={15} className="text-brand" /> <b>{result.xp}</b> XP</div>
                <div className="rounded-xl bg-white p-3"><Coins size={15} className="text-amber-600" /> <b>{result.coins}</b> coins</div>
              </div>
              {result.demo?.isDemo ? <p className="mt-3 text-xs">Demo tactics remaining: {result.demo.remaining}/{result.demo.limit}</p> : null}
            </div>
          ) : null}
        </aside>

        <section ref={boardWrapRef} className="flex min-h-0 items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-brand/5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="animate-spin" size={18} /> Loading puzzle...</div>
          ) : (
            <div style={{ width: boardSize, height: boardSize }} className="rounded-xl border-[6px] border-[#8a4f25] shadow-xl shadow-black/15">
              <Chessboard
                position={fen}
                boardWidth={boardSize}
                arePiecesDraggable={!result}
                onPieceDrop={(source, target, piece) => attemptMove(source, target, piece?.[1]?.toLowerCase() === "p" ? "q" : "q")}
                onSquareClick={onSquareClick}
                customSquareStyles={customSquareStyles}
                customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
                customDarkSquareStyle={{ backgroundColor: "#b58863" }}
              />
            </div>
          )}
        </section>

        <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-brand/5">
          <h2 className="text-lg font-black text-slate-950">Puzzle Details</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Lichess puzzles store the position before the opponent move. The trainer plays that first move, then you solve the forced continuation.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(puzzle?.themes || []).slice(0, 8).map((theme) => (
              <span key={theme} className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-brand">{themeLabel(theme)}</span>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <div className="font-black text-slate-950">Leaderboard scoring</div>
            <p className="mt-2 leading-6">Solved puzzles give XP and coins. Higher rating and faster solving give better rewards; mistakes and hints reduce the final XP.</p>
          </div>
          <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-black">Full puzzle library</div>
            <p className="mt-2 leading-6">The page is ready for imported Lichess puzzle CSV data. Until then, starter puzzles keep the trainer available.</p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function MiniHeader({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="min-w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center shadow-lg shadow-brand/5">
      <div className="flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{icon}{label}</div>
      <div className="mt-1 text-lg font-black text-brand">{value}</div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-black text-slate-950">{value}</div>
    </div>
  );
}
