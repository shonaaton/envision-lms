"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { CheckCircle2, ChevronDown, Coins, Crosshair, Lightbulb, Loader2, RotateCcw, Sparkles, Tags, Target, Trophy, Zap } from "lucide-react";
import { toast } from "sonner";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false });

type Puzzle = {
  id: string;
  externalId?: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  gameUrl?: string;
  openingTags?: string[];
};

type Result = { solved: boolean; xp: number; coins: number; badge?: string; demo?: { isDemo: boolean; remaining: number; limit: number; used: number } };
type LeaderboardRow = { rank: number; studentId: string; name: string; xp: number; coins: number };

const difficultyLevels = {
  absolute_beginner: { label: "Absolute Beginner", rangeLabel: "Puzzle rating 1-300", min: 1, max: 300 },
  beginner: { label: "Beginner", rangeLabel: "Puzzle rating 300-500", min: 300, max: 500 },
  intermediate: { label: "Intermediate", rangeLabel: "Puzzle rating 500-800", min: 500, max: 800 },
  advanced: { label: "Advanced", rangeLabel: "Puzzle rating 800-1000", min: 800, max: 1000 },
  professional: { label: "Professional", rangeLabel: "Puzzle rating 1000+", min: 1000, max: 4000 },
} as const;

type DifficultyKey = keyof typeof difficultyLevels;

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

type TrainerMode = "tactics" | "king_hunt";

type PuzzleTrainerProps = {
  mode?: TrainerMode;
};

const mateOptions = [1, 2, 3, 4, 5] as const;

export default function PuzzleTrainer({ mode = "tactics" }: PuzzleTrainerProps) {
  const isKingHunt = mode === "king_hunt";
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
  const [replying, setReplying] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [showTopics, setShowTopics] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ top: LeaderboardRow[]; current: LeaderboardRow | null }>({ top: [], current: null });
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [difficulty, setDifficulty] = useState<DifficultyKey | null>(null);
  const [mateIn, setMateIn] = useState<number | null>(null);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [message, setMessage] = useState("Load a puzzle and find the best move.");
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [boardSize, setBoardSize] = useState(560);

  const game = useMemo(() => makeGame(fen), [fen]);
  const sideToMove = boardOrientation === "white" ? "White" : "Black";
  const files = boardOrientation === "white" ? ["a", "b", "c", "d", "e", "f", "g", "h"] : ["h", "g", "f", "e", "d", "c", "b", "a"];
  const ranks = boardOrientation === "white" ? ["8", "7", "6", "5", "4", "3", "2", "1"] : ["1", "2", "3", "4", "5", "6", "7", "8"];
  const progress = puzzle ? Math.max(0, Math.floor((ply - 1) / 2)) : 0;
  const totalPlayerMoves = puzzle ? Math.floor(puzzle.moves.length / 2) : 0;

  const loadLeaderboard = useCallback(async () => {
    try {
      const response = await fetch("/api/tactics-trainer?view=leaderboard", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not load leaderboard");
      setLeaderboard({ top: payload.top || [], current: payload.current || null });
    } catch {
      // The trainer remains usable if the motivational leaderboard is temporarily unavailable.
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const loadPuzzle = useCallback(async (requestedDifficulty?: DifficultyKey, requestedMateIn?: number) => {
    const levelKey = requestedDifficulty || difficulty;
    const mateChoice = requestedMateIn || mateIn;
    if (!levelKey || (isKingHunt && !mateChoice)) return;
    const level = difficultyLevels[levelKey];
    setLoading(true);
    setResult(null);
    setReplying(false);
    setSelected("");
    setPossibleSquares([]);
    setSubmittedMoves([]);
    setMistakes(0);
    setHintsUsed(0);
    setSeconds(0);
    setStartedAt(Date.now());
    try {
      const query = new URLSearchParams({
        min: String(level.min),
        max: String(level.max),
        trainer: mode,
      });
      if (isKingHunt && mateChoice) query.set("mate", String(mateChoice));
      const response = await fetch(`/api/tactics-trainer?${query.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not load puzzle");
      const nextPuzzle: Puzzle = payload.puzzle;
      const nextGame = initialPuzzleGame(nextPuzzle);
      setDifficulty(levelKey);
      if (isKingHunt) setMateIn(mateChoice || null);
      setPuzzle(nextPuzzle);
      setFen(nextGame.fen());
      setBoardOrientation(nextGame.turn() === "w" ? "white" : "black");
      setPly(1);
      setMessage("Find the best move.");
    } catch (error: any) {
      toast.error(error?.message || "Could not load puzzle");
      setMessage("Could not load a puzzle.");
    } finally {
      setLoading(false);
    }
  }, [difficulty, isKingHunt, mateIn, mode]);

  useEffect(() => {
    if (!puzzle || result) return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [puzzle, result, startedAt]);

  useEffect(() => {
    loadLeaderboard();
    const timer = window.setInterval(loadLeaderboard, 20_000);
    return () => window.clearInterval(timer);
  }, [loadLeaderboard]);

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
          trainer: mode,
          mateIn: isKingHunt ? mateIn : undefined,
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
      loadLeaderboard();
    } catch (error: any) {
      toast.error(error?.message || "Could not save result");
      setMessage(error?.message || "Could not save result.");
    } finally {
      setSaving(false);
    }
  }

  function attemptMove(sourceSquare: string, targetSquare: string, promotion = "q") {
    if (!puzzle || result || loading || replying) return false;
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
      setReplying(true);
      window.setTimeout(() => {
        const replyGame = makeGame(currentGame.fen());
        applyMove(replyGame, reply);
        setFen(replyGame.fen());
        setPly(nextPly + 1);
        setReplying(false);
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
    if (!puzzle || result || loading || replying) return;
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
    if (!puzzle || result || replying) return;
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

  if (!difficulty || (isKingHunt && !mateIn)) {
    return (
      <div className="flex min-h-[calc(100vh-92px)] items-center justify-center bg-[linear-gradient(180deg,#fffdf6_0%,#fff_45%,#faf8fc_100%)] p-5 text-slate-950">
        <section className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-brand/10">
          <div className="mx-auto max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
              {isKingHunt ? <Target size={14} /> : <Crosshair size={14} />} {isKingHunt ? "King Hunt" : "Tactics Trainer"}
            </div>
            <h1 className="mt-4 text-3xl font-black text-brand">
              {isKingHunt ? "Practice Checkmates in 1-5 Moves" : "Choose Your Puzzle Level"}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {isKingHunt
                ? "Choose the checkmate length and a comfortable puzzle difficulty."
                : "Pick a comfortable starting point. You can change the level whenever you request a new puzzle."}
            </p>
          </div>
          {isKingHunt ? (
            <div className="mx-auto mt-7 max-w-3xl">
              <div className="mb-3 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500">Choose Checkmate Length</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {mateOptions.map((moves) => (
                  <button
                    key={moves}
                    type="button"
                    onClick={() => setMateIn(moves)}
                    className={`rounded-xl border px-3 py-3 text-sm font-black transition ${
                      mateIn === moves
                        ? "border-brand bg-brand text-white shadow-lg shadow-brand/20"
                        : "border-purple-100 bg-purple-50 text-brand hover:border-brand hover:bg-white"
                    }`}
                  >
                    Mate in {moves}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-7 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500">Choose Difficulty</div>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(Object.entries(difficultyLevels) as [DifficultyKey, (typeof difficultyLevels)[DifficultyKey]][]).map(([key, level], index) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (isKingHunt && !mateIn) {
                    toast.error("Please choose Mate in 1, 2, 3, 4, or 5 first.");
                    return;
                  }
                  loadPuzzle(key, mateIn || undefined);
                }}
                className="group min-h-36 rounded-2xl border border-purple-100 bg-purple-50 p-4 text-left transition hover:-translate-y-1 hover:border-brand hover:bg-white hover:shadow-lg"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-black text-white">{index + 1}</span>
                <span className="mt-4 block text-base font-black text-slate-950">{level.label}</span>
                <span className="mt-1 block text-xs font-semibold text-slate-500">{level.rangeLabel}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-92px)] min-h-[640px] flex-col overflow-hidden bg-[linear-gradient(180deg,#fffdf6_0%,#fff_45%,#faf8fc_100%)] p-4 text-slate-950">
      <header className="mb-3 flex flex-none flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
            {isKingHunt ? <Target size={14} /> : <Crosshair size={14} />} {isKingHunt ? "King Hunt" : "Tactics Trainer"}
          </div>
          <h1 className="mt-2 text-2xl font-black text-brand">{isKingHunt ? `Checkmate in ${mateIn}` : "Solve Chess Tactics"}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isKingHunt
              ? "Practice checkmates in 1-5 moves, earn XP, collect coins, and climb the leaderboard."
              : "Solve sharp chess positions, earn XP, collect coins, and climb the leaderboard."}
          </p>
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
            <InfoTile label="Difficulty" value={difficultyLevels[difficulty].label} />
            {isKingHunt ? <InfoTile label="Challenge" value={`Mate in ${mateIn}`} /> : null}
            <InfoTile label="Hints" value={hintsUsed} />
            <InfoTile label="Moves" value={`${progress}/${totalPlayerMoves}`} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => loadPuzzle()} className="btn-primary" disabled={loading || saving}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} New Puzzle
            </button>
            <button
              type="button"
              onClick={() => {
                setPuzzle(null);
                setResult(null);
                setDifficulty(null);
                if (isKingHunt) setMateIn(null);
              }}
              className="btn-outline"
              disabled={loading || saving}
            >
              Change Level
            </button>
            <button onClick={showHint} className="btn-outline" disabled={!puzzle || !!result}>
              <Lightbulb size={16} /> Hint
            </button>
          </div>

          {result ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <div className="flex items-center gap-2 font-black"><CheckCircle2 size={18} /> {result.solved ? (isKingHunt ? "King Hunted" : "Puzzle Solved") : "Attempt Saved"}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-white p-3"><Zap size={15} className="text-brand" /> <b>{result.xp}</b> XP</div>
                <div className="rounded-xl bg-white p-3"><Coins size={15} className="text-amber-600" /> <b>{result.coins}</b> coins</div>
              </div>
              {result.demo?.isDemo ? <p className="mt-3 text-xs">Demo {isKingHunt ? "King Hunt" : "tactics"} remaining: {result.demo.remaining}/{result.demo.limit}</p> : null}
            </div>
          ) : null}
        </aside>

        <section ref={boardWrapRef} className="flex min-h-0 items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-brand/5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="animate-spin" size={18} /> Loading puzzle...</div>
          ) : (
            <div className="grid gap-1" style={{ gridTemplateColumns: "22px auto 22px" }}>
              <div className="grid py-[6px]" style={{ height: boardSize + 12, gridTemplateRows: "repeat(8, 1fr)" }}>
                {ranks.map((rank) => (
                  <div key={`left-${rank}`} className="flex items-center justify-end pr-1 text-xs font-black text-slate-500">{rank}</div>
                ))}
              </div>
              <div>
                <div
                  style={{ width: boardSize, height: boardSize, boxSizing: "content-box" }}
                  className="overflow-hidden rounded-lg border-[6px] border-[#8a4f25] bg-[#8a4f25] shadow-xl shadow-black/15"
                >
                  <Chessboard
                    key={`${puzzle?.id || "puzzle"}-${startedAt}`}
                    position={fen}
                    boardWidth={boardSize}
                    boardOrientation={boardOrientation}
                    showBoardNotation={false}
                    arePiecesDraggable={!result && !loading && !replying}
                    onPieceDrop={(source, target, piece) => attemptMove(source, target, piece?.[1]?.toLowerCase() === "p" ? "q" : "q")}
                    onSquareClick={onSquareClick}
                    customSquareStyles={customSquareStyles}
                    customLightSquareStyle={{ backgroundColor: "#f0d9b5" }}
                    customDarkSquareStyle={{ backgroundColor: "#b58863" }}
                  />
                </div>
                <div className="grid px-[6px]" style={{ width: boardSize + 12, gridTemplateColumns: "repeat(8, 1fr)" }}>
                  {files.map((file) => (
                    <div key={`bottom-${file}`} className="pt-1 text-center text-xs font-black text-slate-500">{file}</div>
                  ))}
                </div>
              </div>
              <div className="grid py-[6px]" style={{ height: boardSize + 12, gridTemplateRows: "repeat(8, 1fr)" }}>
                {ranks.map((rank) => (
                  <div key={`right-${rank}`} className="flex items-center justify-start pl-1 text-xs font-black text-slate-500">{rank}</div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-brand/5">
          <button
            type="button"
            onClick={() => setShowTopics((value) => !value)}
            className="flex w-full items-center justify-between rounded-2xl border border-purple-100 bg-purple-50 px-4 py-3 text-left text-sm font-black text-brand transition hover:bg-purple-100"
          >
            <span className="inline-flex items-center gap-2"><Tags size={16} /> Topics</span>
            <ChevronDown size={18} className={showTopics ? "rotate-180 transition" : "transition"} />
          </button>
          {showTopics ? (
            <div className="mt-3 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3">
              {(puzzle?.themes?.length ? puzzle.themes : ["Tactics"]).slice(0, 10).map((theme) => (
                <span key={theme} className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-brand">{themeLabel(theme)}</span>
              ))}
            </div>
          ) : null}

          <div className="mt-4 min-h-0 rounded-2xl border border-purple-100 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 text-sm font-black text-slate-950">
                <Trophy size={16} className="text-amber-500" /> Live XP Leaderboard
              </div>
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Top 5</span>
            </div>
            <div className="mt-3 space-y-1.5">
              {leaderboardLoading ? (
                <div className="flex items-center justify-center gap-2 py-5 text-xs font-bold text-slate-400">
                  <Loader2 size={14} className="animate-spin" /> Updating ranks
                </div>
              ) : leaderboard.top.length ? (
                leaderboard.top.map((row) => (
                  <LeaderboardItem key={row.studentId} row={row} current={leaderboard.current?.studentId === row.studentId} />
                ))
              ) : (
                <div className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">Solve a puzzle to open the leaderboard.</div>
              )}
            </div>
            {leaderboard.current && !leaderboard.top.some((row) => row.studentId === leaderboard.current?.studentId) ? (
              <div className="mt-2 border-t border-dashed border-purple-100 pt-2">
                <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-brand">Your position</div>
                <LeaderboardItem row={leaderboard.current} current />
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <div className="font-black text-slate-950">Leaderboard scoring</div>
            <p className="mt-2 leading-6">Solved puzzles give XP and coins. Higher difficulty and faster solving give better rewards; mistakes and hints reduce the final XP.</p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function LeaderboardItem({ row, current }: { row: LeaderboardRow; current?: boolean }) {
  return (
    <div className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2.5 py-2 text-xs ${
      current ? "bg-brand text-white shadow-md shadow-brand/15" : "bg-slate-50 text-slate-700"
    }`}>
      <span className={`font-black ${current ? "text-accent" : row.rank <= 3 ? "text-amber-600" : "text-slate-400"}`}>#{row.rank}</span>
      <span className="truncate font-bold">{current ? `${row.name} (You)` : row.name}</span>
      <span className={`font-black ${current ? "text-white" : "text-brand"}`}>{row.xp} XP</span>
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
