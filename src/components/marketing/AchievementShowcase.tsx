"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, Trophy } from "lucide-react";

export type AchievementSlide = {
  student: string;
  title: string;
  result: string;
  location: string;
  year: string;
  description: string;
  category: string;
  image: string;
  alt: string;
  placeholder?: boolean;
};

export default function AchievementShowcase({ slides }: { slides: AchievementSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);
  const active = slides[index] || slides[0];
  const categories = useMemo(() => Array.from(new Set(slides.map((slide) => slide.category))), [slides]);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % slides.length), 6500);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

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
      className="bg-[#16051d] py-14 text-white outline-none lg:py-20"
      aria-roledescription="carousel"
      aria-label="Student achievement slideshow"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Real students. Real tournaments. Real progress.</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-white sm:text-5xl">
              Achievement stories stay at the centre.
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
            Add Cloudinary achievement images and verified result details here. Any missing student, tournament, location, year, or title is intentionally shown as an editable placeholder.
          </p>
        </div>

        <div className="grid overflow-hidden rounded-lg border border-white/12 bg-white/[0.06] shadow-2xl shadow-black/25 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="relative min-h-[330px] bg-black sm:min-h-[500px]">
            <Image
              key={active.image}
              src={active.image}
              alt={active.alt}
              fill
              priority={index === 0}
              sizes="(min-width: 1024px) 58vw, 100vw"
              className="object-cover object-top transition duration-500"
            />
            <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.76))] p-4 sm:p-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-black uppercase text-brand-900">
                <Trophy size={14} /> {active.category}
              </div>
              {active.placeholder && (
                <div className="mt-3 inline-flex rounded-full border border-white/20 bg-white/12 px-3 py-1 text-xs font-bold text-white">
                  Editable placeholder until Cloudinary asset details are added
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-between p-5 sm:p-7 lg:p-8">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-accent">{active.result}</div>
              <h3 className="mt-3 text-3xl font-black leading-tight text-white">{active.student}</h3>
              <p className="mt-2 text-lg font-semibold text-white/90">{active.title}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Info label="Location" value={active.location} />
                <Info label="Year" value={active.year} />
              </div>
              <p className="mt-5 text-sm leading-7 text-white/70">{active.description}</p>
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
                      key={`${slide.student}-${slideIndex}`}
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
