"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Coins, Crosshair, Play, RotateCcw, Timer, Trophy, XCircle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = [1, 2, 3, 4, 5, 6, 7, 8];
const lightSquare = "#f0d9b5";
const darkSquare = "#b58863";

type TrainerStatus = "idle" | "running" | "finished";
type Orientation = "white" | "black";

function randomSquare(previous?: string) {
  let square = "";
  do {
    square = `${files[Math.floor(Math.random() * files.length)]}${ranks[Math.floor(Math.random() * ranks.length)]}`;
  } while (square === previous);
  return square;
}

export default function SquareTrainerPage() {
  const [status, setStatus] = useState<TrainerStatus>("idle");
  const [orientation, setOrientation] = useState<Orientation>("white");
  const [duration, setDuration] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [target, setTarget] = useState(() => randomSquare());
  const [correct, setCorrect] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState<{ type: "correct" | "wrong" | "info"; text: string }>({
    type: "info",
    text: "Start a round and click the target square.",
  });
  const [reward, setReward] = useState<{ xp: number; coins: number } | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{ square: string; type: "correct" | "wrong" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [boardSize, setBoardSize] = useState(540);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const savedRef = useRef(false);

  const accuracy = correct + mistakes ? Math.round((correct / (correct + mistakes)) * 100) : 0;
  const displayFiles = orientation === "white" ? files : [...files].reverse();
  const displayRanks = orientation === "white" ? [...ranks].reverse() : ranks;

  const boardSquares = useMemo(
    () =>
      displayRanks.flatMap((rank, rowIndex) =>
        displayFiles.map((file, colIndex) => ({
          square: `${file}${rank}`,
          rank,
          file,
          isDark: (rowIndex + colIndex) % 2 === 1,
          rowIndex,
          colIndex,
        }))
      ),
    [displayFiles, displayRanks]
  );

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;
    const resize = () => {
      const width = element.clientWidth;
      const heightLimit = window.innerHeight - 250;
      setBoardSize(Math.max(280, Math.min(620, width, heightLimit)));
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

  function startSession() {
    const nextTarget = randomSquare();
    savedRef.current = false;
    setStatus("running");
    setRemaining(duration);
    setTarget(nextTarget);
    setCorrect(0);
    setMistakes(0);
    setStreak(0);
    setBestStreak(0);
    setReward(null);
    setLastAttempt(null);
    setFeedback({ type: "info", text: `Find ${nextTarget.toUpperCase()} on the board.` });
  }

  async function finishSession() {
    if (savedRef.current) return;
    savedRef.current = true;
    setStatus("finished");
    setSaving(true);
    try {
      const response = await fetch("/api/square-trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correct,
          mistakes,
          durationSeconds: duration,
          bestStreak,
          orientation,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Unable to save result");
      setReward({ xp: result.xp || 0, coins: result.coins || 0 });
      setFeedback({ type: "correct", text: "Round saved. XP has been added to the leaderboard." });
    } catch (error: any) {
      setFeedback({ type: "wrong", text: error?.message || "Round finished, but could not save XP." });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === "running" && remaining === 0) {
      finishSession();
    }
    // finishSession intentionally reads latest score state when the clock ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, status]);

  function handleSquareClick(square: string) {
    if (status !== "running") {
      setFeedback({ type: "info", text: "Start a round first." });
      return;
    }

    if (square === target) {
      const nextStreak = streak + 1;
      const nextTarget = randomSquare(target);
      setLastAttempt({ square, type: "correct" });
      setCorrect((value) => value + 1);
      setStreak(nextStreak);
      setBestStreak((value) => Math.max(value, nextStreak));
      setTarget(nextTarget);
      setFeedback({ type: "correct", text: `Correct. Now find ${nextTarget.toUpperCase()}.` });
      window.setTimeout(() => setLastAttempt(null), 220);
      return;
    }

    setLastAttempt({ square, type: "wrong" });
    setMistakes((value) => value + 1);
    setStreak(0);
    setFeedback({ type: "wrong", text: `${square.toUpperCase()} was clicked. Target is ${target.toUpperCase()}.` });
    window.setTimeout(() => setLastAttempt(null), 260);
  }

  return (
    <div className="flex h-[calc(100vh-92px)] min-h-[620px] flex-col overflow-hidden bg-[linear-gradient(180deg,#fffdf6_0%,#fff 52%,#faf8fc_100%)] p-3 text-slate-950 sm:p-4">
      <div className="mb-3 flex flex-none flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            <Crosshair size={14} />
            Square Trainer
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-950">Board Vision Practice</h1>
          <p className="mt-1 text-sm text-slate-600">Click the named square quickly and keep the board fully in focus.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CompactStat label="Score" value={correct} icon={<Trophy size={14} />} />
          <CompactStat label="Accuracy" value={`${accuracy}%`} icon={<CheckCircle2 size={14} />} />
          <CompactStat label="Streak" value={bestStreak} icon={<Zap size={14} />} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[320px_minmax(0,1fr)_280px]">
        <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg shadow-brand/5">
          <div className="rounded-2xl bg-slate-950 px-4 py-4 text-white">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300">Target Square</div>
            <div className="mt-2 text-5xl font-black tracking-wide">{target.toUpperCase()}</div>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Timer size={16} className="text-brand" />
              Timer
            </div>
            <div className="text-xl font-black text-brand">{remaining}s</div>
          </div>

          <div className={cn("mt-3 rounded-2xl border px-4 py-3 text-sm font-semibold", feedback.type === "correct" && "border-emerald-200 bg-emerald-50 text-emerald-700", feedback.type === "wrong" && "border-rose-200 bg-rose-50 text-rose-700", feedback.type === "info" && "border-slate-200 bg-slate-50 text-slate-600")}>
            {feedback.text}
          </div>

          <div className="mt-4 space-y-4 overflow-auto pr-1">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Round Length</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[30, 60, 120].map((seconds) => (
                  <button key={seconds} type="button" onClick={() => { setDuration(seconds); setRemaining(seconds); }} className={cn("rounded-xl border px-3 py-2 text-sm font-bold transition", duration === seconds ? "border-brand bg-brand text-white" : "border-slate-200 bg-white hover:border-brand/40")}>
                    {seconds}s
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Board Side</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["white", "black"] as Orientation[]).map((side) => (
                  <button key={side} type="button" onClick={() => setOrientation(side)} className={cn("rounded-xl border px-3 py-2 text-sm font-bold capitalize transition", orientation === side ? "border-brand bg-brand text-white" : "border-slate-200 bg-white hover:border-brand/40")}>
                    {side}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Correct" value={correct} />
              <MiniStat label="Mistakes" value={mistakes} />
              <MiniStat label="Live streak" value={streak} />
              <MiniStat label="Best streak" value={bestStreak} />
            </div>

            {status === "finished" && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="font-bold text-slate-950">Round Complete</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2"><Zap size={15} className="text-brand" /> XP: {reward?.xp ?? (saving ? "Saving..." : 0)}</div>
                  <div className="flex items-center gap-2"><Coins size={15} className="text-amber-600" /> Coins: {reward?.coins ?? (saving ? "Saving..." : 0)}</div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 grid flex-none grid-cols-2 gap-2">
            <button type="button" onClick={startSession} className="flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 transition hover:bg-brand/90">
              <Play size={16} />
              {status === "running" ? "Restart" : "Start"}
            </button>
            <button type="button" onClick={startSession} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-brand/40 hover:text-brand">
              <RotateCcw size={16} />
              Reset
            </button>
            {status === "running" && (
              <button type="button" onClick={finishSession} className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-brand/40 hover:text-brand">
                <XCircle size={16} />
                End and Save
              </button>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg shadow-brand/5">
          <div ref={boardWrapRef} className="flex min-h-0 flex-1 items-center justify-center">
            <div className="w-full max-w-[620px]">
              <div
                className="mx-auto grid overflow-hidden rounded-xl border-[6px] border-[#8a4f25] shadow-xl shadow-black/15"
                style={{ width: boardSize, height: boardSize, gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }}
              >
                {boardSquares.map((item) => (
                  <button
                    key={item.square}
                    type="button"
                    onClick={() => handleSquareClick(item.square)}
                    className="relative aspect-square text-left transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-brand/40"
                    style={{
                      backgroundColor: item.isDark ? darkSquare : lightSquare,
                      boxShadow: lastAttempt?.square === item.square
                        ? lastAttempt.type === "correct"
                          ? "inset 0 0 0 999px rgba(16,185,129,.45)"
                          : "inset 0 0 0 999px rgba(244,63,94,.45)"
                        : undefined,
                    }}
                    aria-label={`Square ${item.square}`}
                  >
                    <span className="absolute left-1.5 top-1 text-[11px] font-bold text-black/55">{item.rank}</span>
                    <span className="absolute bottom-1 right-1.5 text-[11px] font-bold text-black/55">{item.file}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg shadow-brand/5">
          <div className="text-lg font-black text-slate-950">How it works</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            A target square appears next to the board. Click that exact square as quickly as you can. Each correct click gives you the next target immediately.
          </p>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <Instruction title="Visible at all times" text="Target, timer, score, and controls stay close to the board." />
            <Instruction title="No hidden corners" text="The board resizes to the screen instead of spilling below the fold." />
            <Instruction title="Clean practice loop" text="Start, click, correct, repeat. Results save when the round ends." />
          </div>
        </aside>
      </div>
    </div>
  );
}

function CompactStat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="min-w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center shadow-lg shadow-brand/5">
      <div className="flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{icon}{label}</div>
      <div className="mt-1 text-lg font-black text-brand">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function Instruction({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="font-bold text-slate-950">{title}</div>
      <div className="mt-1 text-slate-600">{text}</div>
    </div>
  );
}
