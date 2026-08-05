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
  const [checkingLimit, setCheckingLimit] = useState(false);
  const [limitBlocked, setLimitBlocked] = useState("");
  const [showResult, setShowResult] = useState(false);
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
    let active = true;
    fetch("/api/square-trainer", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) setLimitBlocked(payload?.error || "Your demo Square Trainer limit is finished.");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const element = boardWrapRef.current;
    if (!element) return;
    const resize = () => {
      const availableWidth = Math.floor(element.clientWidth);
      const availableHeight = Math.floor(element.clientHeight);
      const hasSideBySideLayout = window.innerWidth >= 1024;
      const nextSize = hasSideBySideLayout
        ? Math.min(620, availableWidth, availableHeight)
        : Math.min(560, availableWidth);

      if (nextSize > 0) setBoardSize(nextSize);
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

  async function startSession() {
    if (checkingLimit) return;
    setCheckingLimit(true);
    try {
      const response = await fetch("/api/square-trainer", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Your demo Square Trainer limit is finished.");
    } catch (error: any) {
      setLimitBlocked(error?.message || "Your demo Square Trainer limit is finished.");
      setFeedback({ type: "wrong", text: error?.message || "Could not start a new round." });
      setCheckingLimit(false);
      return;
    }
    setCheckingLimit(false);
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
    setShowResult(false);
    setLastAttempt(null);
    setFeedback({ type: "info", text: `Find ${nextTarget.toUpperCase()} on the board.` });
  }

  async function finishSession() {
    if (savedRef.current) return;
    savedRef.current = true;
    setStatus("finished");
    setShowResult(true);
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
      if (result.demo?.isDemo && result.demo.remaining <= 0) setLimitBlocked("Your demo Square Trainer attempts are now finished.");
      setFeedback({
        type: result.demo?.isDemo && result.demo.remaining <= 0 ? "info" : "correct",
        text: result.demo?.isDemo && result.demo.remaining <= 0
          ? "Round saved. Your demo Square Trainer attempts are now finished."
          : "Round saved. XP has been added to the leaderboard.",
      });
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

  const resultModal = showResult ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Trophy size={22} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-950">Round Complete</h2>
            <p className="text-sm text-slate-500">{duration} second coordinate round</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <MiniStat label="Correct" value={correct} />
          <MiniStat label="Accuracy" value={`${accuracy}%`} />
          <MiniStat label="Best streak" value={bestStreak} />
          <MiniStat label="Mistakes" value={mistakes} />
          <MiniStat label="XP earned" value={reward?.xp ?? (saving ? "..." : 0)} />
          <MiniStat label="Coins" value={reward?.coins ?? (saving ? "..." : 0)} />
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-outline flex-1" onClick={() => setShowResult(false)}>Close</button>
          <button type="button" className="btn-primary flex-1" onClick={startSession} disabled={checkingLimit}><Play size={16} /> {checkingLimit ? "Checking..." : "Play Again"}</button>
        </div>
      </div>
    </div>
  ) : null;

  if (limitBlocked) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-xl">
        <h1 className="text-2xl font-black text-slate-950">Demo Square Trainer completed</h1>
        <p className="mx-auto mt-2 max-w-xl text-slate-600">{limitBlocked}</p>
        <a href="/booking" className="btn-primary mt-5 inline-flex">Open Demo Booking</a>
      </div>
    );
  }

  if (status !== "running") {
    return (
      <div className="flex min-h-[calc(100dvh-76px)] items-center justify-center bg-[linear-gradient(180deg,#fffdf6_0%,#fff_52%,#faf8fc_100%)] p-3 text-slate-950 sm:p-5">
        <section className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-brand/10 sm:p-6">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
              <Crosshair size={14} />
              Square Trainer
            </div>
            <h1 className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl">Set Up Board Vision Practice</h1>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">Choose the round length and the side you want to read from. The board appears after you start.</p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Round Length</label>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[30, 60, 120].map((seconds) => (
                  <button key={seconds} type="button" onClick={() => { setDuration(seconds); setRemaining(seconds); }} className={cn("min-h-12 rounded-xl border px-3 py-2 text-sm font-bold transition", duration === seconds ? "border-brand bg-brand text-white" : "border-slate-200 bg-white hover:border-brand/40")}>
                    {seconds}s
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Board Side</label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["white", "black"] as Orientation[]).map((side) => (
                  <button key={side} type="button" onClick={() => setOrientation(side)} className={cn("min-h-12 rounded-xl border px-3 py-2 text-sm font-bold capitalize transition", orientation === side ? "border-brand bg-brand text-white" : "border-slate-200 bg-white hover:border-brand/40")}>
                    {side}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={cn("mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold", feedback.type === "correct" && "border-emerald-200 bg-emerald-50 text-emerald-700", feedback.type === "wrong" && "border-rose-200 bg-rose-50 text-rose-700", feedback.type === "info" && "border-slate-200 bg-slate-50 text-slate-600")}>
            {showResult ? "Your last round is saved. Start again when ready." : "When the round starts, the target square, timer, score, mistakes, live streak, and best streak stay on screen."}
          </div>

          <button type="button" onClick={startSession} disabled={checkingLimit} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60">
            <Play size={16} />
            {checkingLimit ? "Checking..." : showResult ? "Play Again" : "Start Round"}
          </button>
        </section>
        {resultModal}
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-76px)] flex-col bg-[linear-gradient(180deg,#fffdf6_0%,#fff_52%,#faf8fc_100%)] p-2 text-slate-950 sm:p-3 lg:h-[calc(100dvh-32px)] lg:min-h-[560px] lg:overflow-hidden lg:p-0">
      <div className="mb-2 flex flex-none flex-wrap items-end justify-between gap-2 md:mb-3 md:gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            <Crosshair size={14} />
            Square Trainer
          </div>
          <h1 className="mt-1.5 text-xl font-black text-slate-950 sm:text-2xl">Board Vision Practice</h1>
          <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">Click the named square quickly and keep the board fully in focus.</p>
        </div>
        <div className="grid w-full grid-cols-3 gap-1.5 sm:w-auto sm:gap-2">
          <CompactStat label="Score" value={correct} icon={<Trophy size={14} />} />
          <CompactStat label="Accuracy" value={`${accuracy}%`} icon={<CheckCircle2 size={14} />} />
          <CompactStat label="Streak" value={bestStreak} icon={<Zap size={14} />} />
        </div>
      </div>

      <div className="grid flex-1 gap-2 lg:min-h-0 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-3 xl:grid-cols-[240px_minmax(0,1fr)_220px]">
        <aside className="order-2 flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg shadow-brand/5 sm:p-4 lg:order-1 lg:p-3 xl:p-4">
          <div className="hidden rounded-2xl bg-slate-950 px-3 py-3 text-white sm:px-4 sm:py-4 lg:block">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300">Target Square</div>
            <div className="mt-1.5 text-4xl font-black tracking-wide sm:text-5xl">{target.toUpperCase()}</div>
          </div>

          <div className="mt-3 hidden items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 lg:flex">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Timer size={16} className="text-brand" />
              Timer
            </div>
            <div className="text-xl font-black text-brand">{remaining}s</div>
          </div>

          <div className={cn("mt-3 hidden rounded-2xl border px-4 py-3 text-sm font-semibold lg:block", feedback.type === "correct" && "border-emerald-200 bg-emerald-50 text-emerald-700", feedback.type === "wrong" && "border-rose-200 bg-rose-50 text-rose-700", feedback.type === "info" && "border-slate-200 bg-slate-50 text-slate-600")}>
            {feedback.text}
          </div>

          <div className="space-y-3 overflow-auto pr-1 lg:mt-3 xl:mt-4">
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Correct" value={correct} />
              <MiniStat label="Mistakes" value={mistakes} />
              <MiniStat label="Live streak" value={streak} />
              <MiniStat label="Best streak" value={bestStreak} />
            </div>

          </div>

          <div className="mt-3 grid flex-none grid-cols-2 gap-2 xl:mt-4">
            <button type="button" onClick={startSession} disabled={checkingLimit} className="flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60">
              <Play size={16} />
              {checkingLimit ? "Checking..." : status === "running" ? "Restart" : "Start"}
            </button>
            <button type="button" onClick={startSession} disabled={checkingLimit} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-60">
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

        <section className="order-1 flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg shadow-brand/5 sm:p-3 lg:order-2 lg:min-h-0">
          <div className="mb-2 grid grid-cols-[1fr_auto] gap-2 lg:hidden">
            <div className="rounded-xl bg-slate-950 px-3 py-2 text-white">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">Target Square</div>
              <div className="mt-0.5 text-3xl font-black tracking-wide">{target.toUpperCase()}</div>
            </div>
            <div className="flex min-w-24 flex-col justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500"><Timer size={13} /> Timer</div>
              <div className="mt-0.5 text-xl font-black text-brand">{remaining}s</div>
            </div>
            <div className={cn("col-span-2 rounded-xl border px-3 py-2 text-xs font-semibold", feedback.type === "correct" && "border-emerald-200 bg-emerald-50 text-emerald-700", feedback.type === "wrong" && "border-rose-200 bg-rose-50 text-rose-700", feedback.type === "info" && "border-slate-200 bg-slate-50 text-slate-600")}>
              {feedback.text}
            </div>
          </div>

          <div ref={boardWrapRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
            <div className="flex w-full max-w-[620px] justify-center">
              <div
                data-testid="square-trainer-board"
                className="mx-auto grid overflow-hidden rounded-xl border-[6px] border-[#8a4f25] shadow-xl shadow-black/15"
                style={{ width: `min(100%, ${boardSize}px)`, aspectRatio: "1 / 1", gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }}
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
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="order-3 hidden min-h-0 flex-col rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg shadow-brand/5 xl:flex xl:p-4">
          <div className="text-base font-black text-slate-950 sm:text-lg">How it works</div>
          <p className="mt-2 text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">
            A target square appears next to the board. Click that exact square as quickly as you can. Each correct click gives you the next target immediately.
          </p>
          <div className="mt-3 space-y-2 text-xs text-slate-700 sm:mt-4 sm:space-y-3 sm:text-sm">
            <Instruction title="Visible at all times" text="Target, timer, score, and controls stay close to the board." />
            <Instruction title="No hidden corners" text="The board resizes to the screen instead of spilling below the fold." />
            <Instruction title="Clean practice loop" text="Start, click, correct, repeat. Results save when the round ends." />
          </div>
        </aside>
      </div>
      {resultModal}
    </div>
  );
}

function CompactStat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-1.5 py-1.5 text-center shadow-lg shadow-brand/5 sm:min-w-20 sm:px-3 sm:py-2">
      <div className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-[11px]">{icon}{label}</div>
      <div className="mt-0.5 text-base font-black text-brand sm:mt-1 sm:text-lg">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-[11px]">{label}</div>
      <div className="mt-0.5 text-lg font-black text-slate-950 sm:mt-1 sm:text-xl">{value}</div>
    </div>
  );
}

function Instruction({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 sm:p-3">
      <div className="font-bold text-slate-950">{title}</div>
      <div className="mt-1 text-slate-600">{text}</div>
    </div>
  );
}
