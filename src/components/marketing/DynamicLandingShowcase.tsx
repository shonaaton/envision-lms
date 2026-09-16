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
    accent: "from-brand-200 to-brand-100",
  },
  {
    label: "Practice",
    title: "38 puzzles solved",
    detail: "Calculation streak up",
    icon: Gauge,
    accent: "from-accent to-accent-300",
  },
  {
    label: "Coach Desk",
    title: "12 reviews ready",
    detail: "Homework feedback queued",
    icon: MessageSquare,
    accent: "from-white to-brand-50",
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
      <div className="absolute -left-3 top-8 hidden h-36 w-20 rotate-[-8deg] rounded-xl border border-brand/10 bg-white shadow-lg shadow-brand-900/5 xl:block" />
      <div className="absolute -right-2 bottom-14 hidden h-40 w-20 rotate-[7deg] rounded-xl border border-brand/15 bg-brand-50 shadow-lg shadow-brand-900/5 xl:block" />

      <div className="relative overflow-hidden rounded-2xl border border-brand/15 bg-white shadow-[0_24px_70px_rgba(90,19,114,0.14)]">
        <div className="flex items-center justify-between gap-3 border-b border-brand/10 bg-brand-50 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-100" />
          </div>
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-900/50">Student command centre</div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[0.72fr_1.28fr]">
          <aside className="border-b border-brand/10 bg-brand-50 p-3.5 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-brand">Envision LMS</p>
                <h2 className="mt-1 text-base font-black leading-tight text-brand-900">Weekly progress</h2>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-accent">
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
                      active ? "border-brand/30 bg-brand-50 text-brand-900" : "border-brand/10 bg-white text-brand-900/70 hover:bg-brand-50"
                    }`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? "bg-brand text-accent" : "bg-brand-50 text-brand"}`}>
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

            <div className="mt-3 rounded-xl border border-brand/10 bg-white p-2.5">
              <div className="mb-2.5 flex items-center justify-between text-[11px]">
                <span className="font-black text-brand-900">Puzzle of the day</span>
                <span className="font-black text-brand">Daily</span>
              </div>
              <div className="relative overflow-hidden rounded-lg border border-brand/15 bg-brand-50">
                <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(135deg,rgba(232,212,240,0.7),rgba(253,231,90,0.25))] p-4 text-center">
                  <div>
                    <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-brand text-accent">
                      <Gauge size={18} />
                    </div>
                    <p className="mt-3 text-xs font-black text-brand-900">Daily chess puzzle</p>
                    <p className="mt-1 text-[11px] leading-4 text-brand-900/60">Fresh challenge</p>
                  </div>
                </div>
                <iframe
                  title="Daily chess puzzle"
                  src="https://lichess.org/training/frame?theme=purple&bg=light&pieceSet=cburnett"
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
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-brand hover:underline"
              >
                Open full puzzle <ExternalLink size={12} />
              </a>
            </div>
          </aside>

          <div className="p-3.5">
            <div className={`rounded-lg bg-gradient-to-br ${currentView.accent} p-3.5 text-[#1a0622] shadow-lg shadow-brand-900/10`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">{currentView.label}</p>
                  <div className="mt-1 text-xl font-black leading-tight">{currentView.title}</div>
                  <p className="mt-1.5 text-xs font-bold opacity-70">{currentView.detail}</p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-900/10">
                  <ViewIcon size={21} />
                </span>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-brand-900/15">
                <div key={activeView} className="h-full rounded-full bg-brand landing-progress" />
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1.08fr_0.92fr]">
              <div className="rounded-xl border border-brand/10 bg-brand-50 p-2.5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-black text-brand-900">Activity feed</h3>
                  <BarChart3 size={17} className="text-brand" />
                </div>
                <div className="grid gap-2">
                  {activity.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex items-center gap-2.5 rounded-lg border border-brand/10 bg-white p-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-black text-brand-900">{item.title}</span>
                          <span className="block truncate text-[11px] text-brand-900/60">{item.detail}</span>
                        </span>
                        <span className={`text-[11px] font-black ${index === activeView ? "text-brand" : "text-brand-900/50"}`}>{item.value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-brand/10 bg-brand-50 p-2.5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-black text-brand-900">Spotlight</h3>
                  <PlayCircle size={17} className="text-brand" />
                </div>
                {spotlight ? (
                  <div className="rounded-xl border border-brand/10 bg-[linear-gradient(145deg,rgba(232,212,240,0.85),rgba(255,255,255,1)_48%,rgba(253,231,90,0.28))] p-3">
                    <span className="inline-flex rounded-md bg-accent px-2 py-0.5 text-[10px] font-black text-brand-900">{spotlight.achievementLevel}</span>
                    <div className="mt-5 text-lg font-black leading-tight text-brand-900">{spotlight.studentName}</div>
                    <p className="mt-2 line-clamp-3 min-h-14 text-xs leading-5 text-brand-900/70">{spotlight.result}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-md border border-brand/10 bg-white p-2">
                        <div className="text-[10px] font-bold uppercase text-brand-900/50">Category</div>
                        <div className="mt-1 truncate text-[11px] font-black text-brand">{spotlight.category}</div>
                      </div>
                      <div className="rounded-md border border-brand/10 bg-white p-2">
                        <div className="text-[10px] font-bold uppercase text-brand-900/50">Year</div>
                        <div className="mt-1 truncate text-[11px] font-black text-brand">{spotlight.year}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-48 place-items-center rounded-xl border border-brand/10 bg-white text-sm font-bold text-brand-900/60">
                    Achievement spotlight
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
              {files.map(([title, detail, status]) => (
                <div key={title} className="rounded-xl border border-brand/10 bg-brand-50 p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-black text-brand-900">
                    <span className="truncate">{title}</span>
                    <ChevronRight size={14} className="shrink-0 text-brand" />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-brand-900/60">{detail}</p>
                  <div className="mt-3 inline-flex rounded-md bg-brand px-2 py-1 text-[10px] font-black text-white">{status}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-4 left-5 hidden rounded-xl border border-brand/15 bg-white p-2.5 text-brand-900 shadow-lg shadow-brand-900/10 xl:block">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-accent">
            <CheckCircle2 size={18} />
          </span>
          <span>
            <span className="block text-xs font-black">Progress report generated</span>
            <span className="block text-[11px] text-brand-900/60">Coach, parent, and student aligned</span>
          </span>
        </div>
      </div>
    </div>
  );
}
