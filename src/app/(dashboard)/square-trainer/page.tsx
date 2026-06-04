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
    text: "Press start and click the square shown.",
  });
  const [reward, setReward] = useState<{ xp: number; coins: number } | null>(null);
  const [saving, setSaving] = useState(false);
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
    // finishSession intentionally reads the latest score state at the moment the clock ends.
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
      setCorrect((value) => value + 1);
      setStreak(nextStreak);
      setBestStreak((value) => Math.max(value, nextStreak));
      setTarget(nextTarget);
      setFeedback({ type: "correct", text: `Correct. Now find ${nextTarget.toUpperCase()}.` });
      return;
    }

    setMistakes((value) => value + 1);
    setStreak(0);
    setFeedback({ type: "wrong", text: `${square.toUpperCase()} was clicked. Target is ${target.toUpperCase()}.` });
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffdf2_0%,#fff_36%,#f8f4fb_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-brand">
            <Crosshair size={14} />
            Chess Tools
          </div>
          <h1 className="mt-3 text-3xl font-bold text-brand">Square Trainer</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Train board coordinates by clicking the named square quickly and accurately. Finished rounds earn XP for the student leaderboard.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-brand/10 bg-white p-3 shadow-xl shadow-brand/10">
          <Stat label="Score" value={correct} icon={<Trophy size={16} />} />
          <Stat label="Accuracy" value={`${accuracy}%`} icon={<CheckCircle2 size={16} />} />
          <Stat label="Best streak" value={bestStreak} icon={<Zap size={16} />} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-3xl border border-brand/10 bg-white p-4 shadow-2xl shadow-brand/10 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-brand px-5 py-3 text-center text-white shadow-lg shadow-brand/25">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Target</div>
                <div className="text-4xl font-black tracking-wide">{target.toUpperCase()}</div>
              </div>
              <div className={cn("rounded-2xl border px-4 py-3 text-sm font-semibold", feedback.type === "correct" && "border-emerald-200 bg-emerald-50 text-emerald-700", feedback.type === "wrong" && "border-rose-200 bg-rose-50 text-rose-700", feedback.type === "info" && "border-slate-200 bg-slate-50 text-slate-600")}>
                {feedback.text}
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-brand">
              <Timer size={18} />
              {remaining}s
            </div>
          </div>

          <div className="mx-auto grid max-w-[620px] grid-cols-8 overflow-hidden rounded-xl border-[6px] border-[#8a4f25] shadow-2xl shadow-black/20">
            {boardSquares.map((item) => (
              <button
                key={item.square}
                type="button"
                onClick={() => handleSquareClick(item.square)}
                className="relative aspect-square text-left transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-brand/40"
                style={{ backgroundColor: item.isDark ? darkSquare : lightSquare }}
                aria-label={`Square ${item.square}`}
              >
                {item.colIndex === 0 && <span className="absolute left-1 top-1 text-[10px] font-bold text-black/55">{item.rank}</span>}
                {item.rowIndex === 7 && <span className="absolute bottom-1 right-1 text-[10px] font-bold text-black/55">{item.file}</span>}
              </button>
            ))}
          </div>
        </section>

        <aside className="rounded-3xl border border-brand/10 bg-white p-5 shadow-2xl shadow-brand/10">
          <h2 className="text-lg font-bold text-brand">Round Setup</h2>
          <p className="mt-1 text-sm text-slate-500">Short rounds work best for speed and coordinate memory.</p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Duration</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[30, 60, 120].map((seconds) => (
                  <button key={seconds} type="button" onClick={() => { setDuration(seconds); setRemaining(seconds); }} className={cn("rounded-xl border px-3 py-2 text-sm font-bold transition", duration === seconds ? "border-brand bg-brand text-white" : "border-slate-200 bg-white hover:border-brand/40")}>
                    {seconds}s
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Board Orientation</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["white", "black"] as Orientation[]).map((side) => (
                  <button key={side} type="button" onClick={() => setOrientation(side)} className={cn("rounded-xl border px-3 py-2 text-sm font-bold capitalize transition", orientation === side ? "border-brand bg-brand text-white" : "border-slate-200 bg-white hover:border-brand/40")}>
                    {side}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Correct" value={correct} />
              <MiniStat label="Mistakes" value={mistakes} />
              <MiniStat label="Streak" value={streak} />
              <MiniStat label="Accuracy" value={`${accuracy}%`} />
            </div>

            {status === "finished" && (
              <div className="rounded-2xl border border-accent/60 bg-accent/20 p-4">
                <div className="font-bold text-brand">Round Complete</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2"><Zap size={15} className="text-brand" /> XP: {reward?.xp ?? (saving ? "Saving..." : 0)}</div>
                  <div className="flex items-center gap-2"><Coins size={15} className="text-amber-600" /> Coins: {reward?.coins ?? (saving ? "Saving..." : 0)}</div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={startSession} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/25 transition hover:bg-brand/90">
                <Play size={16} />
                {status === "running" ? "Restart" : "Start Round"}
              </button>
              <button type="button" onClick={startSession} className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-brand/40 hover:text-brand" aria-label="Reset round">
                <RotateCcw size={17} />
              </button>
            </div>

            {status === "running" && (
              <button type="button" onClick={finishSession} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-brand/40 hover:text-brand">
                <XCircle size={16} />
                End and Save
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="min-w-24 rounded-xl bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">{icon}{label}</div>
      <div className="mt-1 text-xl font-black text-brand">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}
