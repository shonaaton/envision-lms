"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  BellRing,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Gauge,
  MessageSquare,
  PlayCircle,
  Trophy,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { AchievementRecord } from "@/lib/achievementData";

type DynamicLandingShowcaseProps = {
  achievements: AchievementRecord[];
};

const views = [
  {
    label: "Today",
    title: "6 live classes",
    detail: "2 batches starting soon",
    icon: CalendarDays,
    accent: "from-emerald-300/85 to-teal-200/85",
  },
  {
    label: "Practice",
    title: "38 puzzles solved",
    detail: "Calculation streak up",
    icon: Gauge,
    accent: "from-yellow-200/95 to-amber-300/95",
  },
  {
    label: "Coach Desk",
    title: "12 reviews ready",
    detail: "Homework feedback queued",
    icon: MessageSquare,
    accent: "from-sky-200/90 to-cyan-300/90",
  },
];

const activity = [
  { icon: BookOpenCheck, title: "Opening homework", detail: "Submitted by Aarav", value: "92%" },
  { icon: Trophy, title: "Saturday rapid", detail: "Pairings published", value: "18 players" },
  { icon: WalletCards, title: "Class credits", detail: "Parent reminder sent", value: "8 left" },
  { icon: BellRing, title: "Coach reply", detail: "Tactics hint delivered", value: "Now" },
];

const files = [
  ["Live board", "Ruy Lopez middlegame", "Active"],
  ["Assignment", "Passed pawns drill", "Due today"],
  ["Leaderboard", "Under-10 practice", "Updated"],
];

export default function DynamicLandingShowcase({ achievements }: DynamicLandingShowcaseProps) {
  const [activeView, setActiveView] = useState(0);
  const [activeAchievement, setActiveAchievement] = useState(0);
  const [puzzleFrameReady, setPuzzleFrameReady] = useState(false);
  const spotlight = achievements[activeAchievement % Math.max(achievements.length, 1)];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveView((current) => (current + 1) % views.length);
      setActiveAchievement((current) => current + 1);
    }, 3600);
    return () => window.clearInterval(timer);
  }, []);

  const currentView = views[activeView];
  const ViewIcon = currentView.icon;

  return (
    <div className="motion-rise relative mx-auto w-full max-w-[640px] text-[0.82rem]" aria-label="Dynamic Envision learning portal preview">
      <div className="absolute -left-3 top-8 hidden h-36 w-20 rotate-[-8deg] border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/20 backdrop-blur xl:block" />
      <div className="absolute -right-2 bottom-14 hidden h-40 w-20 rotate-[7deg] border border-accent/15 bg-accent/[0.05] shadow-2xl shadow-black/20 backdrop-blur xl:block" />

      <div className="relative overflow-hidden rounded-lg border border-white/14 bg-[#070b10]/88 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">Student command centre</div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[0.72fr_1.28fr]">
          <aside className="border-b border-white/10 bg-white/[0.025] p-3.5 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Envision LMS</p>
                <h2 className="mt-1 text-base font-black leading-tight text-white">Weekly progress</h2>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-brand-900">
                <UsersRound size={18} />
              </span>
            </div>

            <div className="mt-4 grid gap-2">
              {views.map((view, index) => {
                const Icon = view.icon;
                const active = index === activeView;
                return (
                  <button
                    key={view.label}
                    type="button"
                    onClick={() => setActiveView(index)}
                    className={`flex min-h-12 items-center gap-2.5 rounded-lg border px-2.5 text-left transition ${
                      active ? "border-accent/55 bg-accent/12 text-white" : "border-white/10 bg-white/[0.035] text-white/58 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? "bg-accent text-brand-900" : "bg-white/[0.06] text-accent"}`}>
                      <Icon size={17} />
                    </span>
                    <span>
                      <span className="block text-xs font-black">{view.label}</span>
                      <span className="block text-[11px]">{view.detail}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-lg border border-white/10 bg-black/18 p-2.5">
              <div className="mb-2.5 flex items-center justify-between text-[11px]">
                <span className="font-black text-white">Puzzle of the day</span>
                <span className="text-accent">Daily</span>
              </div>
              <div className="relative overflow-hidden rounded-md border border-accent/20 bg-[#120519] shadow-inner shadow-black/40">
                <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,rgba(253,231,90,0.09),rgba(255,255,255,0.02))] p-4 text-center">
                  <div>
                    <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-accent text-brand-900">
                      <Gauge size={18} />
                    </div>
                    <p className="mt-3 text-xs font-black text-white">Daily chess puzzle</p>
                    <p className="mt-1 text-[11px] leading-4 text-white/48">Fresh challenge</p>
                  </div>
                </div>
                <iframe
                  title="Daily chess puzzle"
                  src="https://lichess.org/training/frame?theme=purple&bg=dark&pieceSet=cburnett"
                  className={`relative h-[210px] w-full border-0 bg-transparent transition-opacity duration-500 sm:h-[224px] lg:h-[208px] ${
                    puzzleFrameReady ? "opacity-100" : "opacity-0"
                  }`}
                  loading="lazy"
                  onLoad={() => setPuzzleFrameReady(true)}
                />
              </div>
              <a
                href="https://lichess.org/training"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-accent hover:text-accent-200"
              >
                Open full puzzle <ExternalLink size={12} />
              </a>
            </div>
          </aside>

          <div className="p-3.5">
            <div className={`rounded-lg bg-gradient-to-br ${currentView.accent} p-3.5 text-[#13051b] shadow-xl shadow-black/20`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">{currentView.label}</p>
                  <div className="mt-1 text-xl font-black leading-tight">{currentView.title}</div>
                  <p className="mt-1.5 text-xs font-bold opacity-70">{currentView.detail}</p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-black/12">
                  <ViewIcon size={21} />
                </span>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/14">
                <div key={activeView} className="h-full rounded-full bg-[#13051b] landing-progress" />
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1.08fr_0.92fr]">
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-black text-white">Activity feed</h3>
                  <BarChart3 size={17} className="text-accent" />
                </div>
                <div className="grid gap-2">
                  {activity.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-black/14 p-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-accent">
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-black text-white">{item.title}</span>
                          <span className="block truncate text-[11px] text-white/48">{item.detail}</span>
                        </span>
                        <span className={`text-[11px] font-black ${index === activeView ? "text-accent" : "text-white/48"}`}>{item.value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-black text-white">Spotlight</h3>
                  <PlayCircle size={17} className="text-accent" />
                </div>
                {spotlight ? (
                  <div className="rounded-lg border border-white/10 bg-[linear-gradient(145deg,rgba(253,231,90,0.12),rgba(255,255,255,0.035)_48%,rgba(20,184,166,0.1))] p-3">
                    <span className="inline-flex rounded-md bg-accent px-2 py-0.5 text-[10px] font-black text-brand-900">{spotlight.achievementLevel}</span>
                    <div className="mt-5 text-lg font-black leading-tight text-white">{spotlight.studentName}</div>
                    <p className="mt-2 line-clamp-3 min-h-14 text-xs leading-5 text-white/62">{spotlight.result}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-md bg-black/18 p-2">
                        <div className="text-[10px] font-bold uppercase text-white/38">Category</div>
                        <div className="mt-1 truncate text-[11px] font-black text-accent">{spotlight.category}</div>
                      </div>
                      <div className="rounded-md bg-black/18 p-2">
                        <div className="text-[10px] font-bold uppercase text-white/38">Year</div>
                        <div className="mt-1 truncate text-[11px] font-black text-accent">{spotlight.year}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-48 place-items-center rounded-lg border border-white/10 bg-black/18 text-sm font-bold text-white/54">
                    Achievement spotlight
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
              {files.map(([title, detail, status]) => (
                <div key={title} className="rounded-lg border border-white/10 bg-white/[0.035] p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-black text-white">
                    <span className="truncate">{title}</span>
                    <ChevronRight size={14} className="shrink-0 text-accent" />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-white/48">{detail}</p>
                  <div className="mt-3 inline-flex rounded-md bg-white/[0.06] px-2 py-1 text-[10px] font-black text-accent">{status}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-4 left-5 hidden rounded-lg border border-white/12 bg-[#10131b]/92 p-2.5 text-white shadow-2xl shadow-black/30 backdrop-blur xl:block">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-300 text-[#07100e]">
            <CheckCircle2 size={18} />
          </span>
          <span>
            <span className="block text-xs font-black">Progress report generated</span>
            <span className="block text-[11px] text-white/46">Coach, parent, and student aligned</span>
          </span>
        </div>
      </div>
    </div>
  );
}
