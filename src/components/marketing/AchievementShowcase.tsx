"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, MapPin, Pause, Play, Sparkles, Trophy } from "lucide-react";
import type { AchievementRecord } from "@/lib/achievementData";

export default function AchievementShowcase({ achievements }: { achievements: AchievementRecord[] }) {
  const slides = achievements.slice(0, 10);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);
  const active = slides[index] || slides[0];
  const categories = useMemo(() => Array.from(new Set(slides.map((slide) => slide.achievementLevel))), [slides]);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % slides.length), 5600);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  if (!active) return null;

  function go(step: number) {
    setIndex((current) => (current + step + slides.length) % slides.length);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowLeft") go(-1);
    if (event.key === "ArrowRight") go(1);
  }

  function onTouchEnd(event: React.TouchEvent<HTMLElement>) {
    if (touchStart.current == null) return;
    const delta = event.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(delta) < 44) return;
    go(delta > 0 ? -1 : 1);
  }

  return (
    <section
      id="achievements"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0].clientX;
      }}
      onTouchEnd={onTouchEnd}
      className="relative overflow-hidden bg-[#18051f] py-16 text-white outline-none lg:py-24"
      aria-roledescription="carousel"
      aria-label="Student achievement slideshow"
    >
      <div className="absolute inset-0 opacity-[0.055] [background-image:linear-gradient(45deg,#fde75a_25%,transparent_25%),linear-gradient(-45deg,#fde75a_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#fde75a_75%),linear-gradient(-45deg,transparent_75%,#fde75a_75%)] [background-position:0_0,0_18px,18px_-18px,-18px_0] [background-size:36px_36px]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-accent">
              <Sparkles size={15} /> Real students. Real tournaments. Real progress.
            </p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-white sm:text-5xl">
              Achievement stories stay at the centre.
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-white/72 sm:text-base">
            Verified student results are presented with the achievement photographs, tournament details, result, location, year, and level.
          </p>
        </div>

        <div className="grid overflow-hidden rounded-lg border border-white/12 bg-white/[0.07] shadow-2xl shadow-black/30 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
          <div className="group relative min-h-[340px] bg-black sm:min-h-[540px]">
            <Image
              key={active.achievementImageUrl}
              src={active.achievementImageUrl}
              alt={`${active.studentName} ${active.result}`}
              fill
              priority={index === 0}
              sizes="(min-width: 1024px) 58vw, 100vw"
              className="object-cover object-center transition duration-700 group-hover:scale-[1.035]"
            />
            <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.78))] p-5 sm:p-7">
              <div className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-black uppercase text-brand-900">
                <Trophy size={14} /> {active.achievementLevel}
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between p-5 sm:p-7 lg:p-8">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-accent">{active.result}</div>
              <h3 className="mt-3 text-3xl font-black leading-tight text-white">{active.studentName}</h3>
              <p className="mt-3 text-lg font-semibold text-white/90">{active.tournamentName}</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <Info label="Location" value={active.tournamentLocation} />
                <Info label="Year" value={active.year} />
              </div>
              <p className="mt-5 text-sm leading-7 text-white/72">{active.shortDescription}</p>
            </div>

            <div className="mt-8 space-y-5">
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <span key={category} className="rounded-full border border-white/12 bg-white/[0.08] px-3 py-1 text-xs font-bold text-white/72">
                    {category}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => go(-1)} className="grid h-11 w-11 place-items-center rounded-lg border border-white/14 bg-white/[0.08] text-white hover:bg-white/15" aria-label="Previous achievement">
                    <ArrowLeft size={18} />
                  </button>
                  <button type="button" onClick={() => go(1)} className="grid h-11 w-11 place-items-center rounded-lg border border-white/14 bg-white/[0.08] text-white hover:bg-white/15" aria-label="Next achievement">
                    <ArrowRight size={18} />
                  </button>
                  <button type="button" onClick={() => setPaused((value) => !value)} className="grid h-11 w-11 place-items-center rounded-lg border border-white/14 bg-white/[0.08] text-white hover:bg-white/15" aria-label={paused ? "Play achievement slideshow" : "Pause achievement slideshow"}>
                    {paused ? <Play size={18} /> : <Pause size={18} />}
                  </button>
                </div>
                <div className="flex items-center gap-1.5" aria-label="Achievement slide position">
                  {slides.map((slide, slideIndex) => (
                    <button
                      key={`${slide.studentName}-${slideIndex}`}
                      type="button"
                      onClick={() => setIndex(slideIndex)}
                      className={`h-2.5 rounded-full transition ${slideIndex === index ? "w-8 bg-accent" : "w-2.5 bg-white/30 hover:bg-white/55"}`}
                      aria-label={`Show achievement ${slideIndex + 1}`}
                      aria-current={slideIndex === index}
                    />
                  ))}
                </div>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/12">
                <div className="h-full bg-accent transition-all duration-500" style={{ width: `${((index + 1) / slides.length) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {slides.slice(0, 4).map((item, itemIndex) => (
            <button
              key={`${item.studentName}-${itemIndex}-thumb`}
              type="button"
              onClick={() => setIndex(itemIndex)}
              className="group grid grid-cols-[76px_minmax(0,1fr)] gap-3 rounded-lg border border-white/10 bg-white/[0.07] p-2 text-left transition hover:-translate-y-1 hover:bg-white/[0.11]"
            >
              <span className="relative aspect-square overflow-hidden rounded-md bg-black">
                <Image src={item.achievementImageUrl} alt="" fill sizes="76px" className="object-cover transition duration-500 group-hover:scale-110" />
              </span>
              <span className="self-center">
                <span className="block truncate text-sm font-black text-white">{item.studentName}</span>
                <span className="mt-1 flex items-center gap-1 text-xs text-white/62"><MapPin size={12} /> {item.tournamentLocation}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/12 bg-white/[0.07] px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">{label}</div>
      <div className="mt-1 text-sm font-bold text-white">{value}</div>
    </div>
  );
}
