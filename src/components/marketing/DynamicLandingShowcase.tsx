"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BellRing,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
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
  const spotlight = achievements[activeAchievement % Math.max(achievements.length, 1)];

  const boardSquares = useMemo(
    () =>
      Array.from({ length: 64 }, (_, index) => {
        const row = Math.floor(index / 8);
        const col = index % 8;
        const isLight = (row + col) % 2 === 0;
        const piece =
          index === 4 ? "k" : index === 11 ? "n" : index === 18 ? "p" : index === 28 ? "Q" : index === 35 ? "B" : index === 52 ? "R" : "";
        return { isLight, piece };
      }),
    []
  );

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
    <div className="motion-rise relative mx-auto w-full max-w-[560px] lg:max-w-none" aria-label="Dynamic Envision learning portal preview">
      <div className="absolute -left-4 top-8 hidden h-44 w-24 rotate-[-10deg] border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/25 backdrop-blur md:block" />
      <div className="absolute -right-3 bottom-16 hidden h-52 w-28 rotate-[8deg] border border-accent/20 bg-accent/[0.07] shadow-2xl shadow-black/25 backdrop-blur md:block" />

      <div className="relative overflow-hidden rounded-lg border border-white/14 bg-[#070b10]/88 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-white/42">Student command centre</div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[0.78fr_1.22fr]">
          <aside className="border-b border-white/10 bg-white/[0.025] p-4 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent">Envision LMS</p>
                <h2 className="mt-1 text-lg font-black leading-tight text-white">Weekly progress</h2>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-brand-900">
                <UsersRound size={18} />
              </span>
            </div>

            <div className="mt-5 grid gap-2">
              {views.map((view, index) => {
                const Icon = view.icon;
                const active = index === activeView;
                return (
                  <button
                    key={view.label}
                    type="button"
                    onClick={() => setActiveView(index)}
                    className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 text-left transition ${
                      active ? "border-accent/55 bg-accent/12 text-white" : "border-white/10 bg-white/[0.035] text-white/58 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? "bg-accent text-brand-900" : "bg-white/[0.06] text-accent"}`}>
                      <Icon size={17} />
                    </span>
                    <span>
                      <span className="block text-sm font-black">{view.label}</span>
                      <span className="block text-xs">{view.detail}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-black/18 p-3">
              <div className="mb-3 flex items-center justify-between text-xs">
                <span className="font-black text-white">Training pulse</span>
                <span className="text-accent">Live</span>
              </div>
              <div className="grid grid-cols-8 gap-1.5">
                {boardSquares.map((square, index) => (
                  <span
                    key={index}
                    className={`grid aspect-square place-items-center rounded-[3px] text-[10px] font-black ${
                      square.isLight ? "bg-white/18 text-accent" : "bg-white/[0.055] text-white/72"
                    }`}
                  >
                    {square.piece}
                  </span>
                ))}
              </div>
            </div>
          </aside>

          <div className="p-4">
            <div className={`rounded-lg bg-gradient-to-br ${currentView.accent} p-4 text-[#13051b] shadow-xl shadow-black/20`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">{currentView.label}</p>
                  <div className="mt-1 text-2xl font-black leading-tight">{currentView.title}</div>
                  <p className="mt-2 text-sm font-bold opacity-70">{currentView.detail}</p>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-black/12">
                  <ViewIcon size={21} />
                </span>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/14">
                <div key={activeView} className="h-full rounded-full bg-[#13051b] landing-progress" />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1.08fr_0.92fr]">
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-black text-white">Activity feed</h3>
                  <BarChart3 size={17} className="text-accent" />
                </div>
                <div className="grid gap-2">
                  {activity.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex items-center gap-3 rounded-lg border border-white/8 bg-black/14 p-2.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-accent">
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

              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-black text-white">Spotlight</h3>
                  <PlayCircle size={17} className="text-accent" />
                </div>
                {spotlight ? (
                  <div className="overflow-hidden rounded-lg border border-white/10 bg-black/22">
                    <div className="relative aspect-[1.08] bg-[#05070b]">
                      <Image src={spotlight.achievementImageUrl} alt="" fill sizes="220px" className="scale-110 object-cover opacity-20 blur-xl" />
                      <Image src={spotlight.achievementImageUrl} alt={`${spotlight.studentName} achievement`} fill sizes="220px" className="object-contain p-2.5" />
                      <span className="absolute left-2 top-2 rounded-md bg-accent px-2 py-0.5 text-[10px] font-black text-brand-900">{spotlight.achievementLevel}</span>
                    </div>
                    <div className="p-3">
                      <div className="truncate text-sm font-black text-white">{spotlight.studentName}</div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/54">{spotlight.result}</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-48 place-items-center rounded-lg border border-white/10 bg-black/18 text-sm font-bold text-white/54">
                    Achievement spotlight
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {files.map(([title, detail, status]) => (
                <div key={title} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
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

      <div className="absolute -bottom-5 left-6 hidden rounded-lg border border-white/12 bg-[#10131b]/92 p-3 text-white shadow-2xl shadow-black/30 backdrop-blur md:block">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-300 text-[#07100e]">
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
