"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, Star } from "lucide-react";
import type { ReviewRecord } from "@/lib/achievementData";

export default function TestimonialCarousel({ reviews }: { reviews: ReviewRecord[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);
  const active = reviews[index] || reviews[0];

  useEffect(() => {
    if (paused || reviews.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % reviews.length), 5200);
    return () => window.clearInterval(timer);
  }, [paused, reviews.length]);

  if (!active) return null;

  function go(step: number) {
    setIndex((current) => (current + step + reviews.length) % reviews.length);
  }

  return (
    <div
      className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/20 backdrop-blur"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current == null) return;
        const delta = event.changedTouches[0].clientX - touchStart.current;
        touchStart.current = null;
        if (Math.abs(delta) > 44) go(delta > 0 ? -1 : 1);
      }}
    >
      <div className="grid gap-0 lg:grid-cols-[0.72fr_1.28fr]">
        <div className="border-b border-white/10 bg-[#111722]/72 p-6 text-white sm:p-8 lg:border-b-0 lg:border-r">
          <div className="grid h-20 w-20 place-items-center rounded-lg bg-accent text-2xl font-black text-brand shadow-lg shadow-accent/10">
            {active.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
          </div>
          <div className="mt-5 flex gap-1 text-accent">
            {Array.from({ length: active.rating }).map((_, itemIndex) => (
              <Star key={itemIndex} size={18} fill="currentColor" />
            ))}
          </div>
          <div className="mt-5 text-xl font-black">{active.name}</div>
          <div className="mt-1 text-sm text-white/68">{active.role}</div>
        </div>
        <div className="flex min-h-72 flex-col justify-between p-6 sm:p-8">
          <p className="text-xl font-semibold leading-9 text-white/78">&ldquo;{active.text}&rdquo;</p>
          <div className="mt-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => go(-1)} className="grid h-11 w-11 place-items-center rounded-lg border border-white/12 bg-white/[0.06] text-white hover:bg-white/[0.1]" aria-label="Previous review">
                <ArrowLeft size={18} />
              </button>
              <button type="button" onClick={() => go(1)} className="grid h-11 w-11 place-items-center rounded-lg border border-white/12 bg-white/[0.06] text-white hover:bg-white/[0.1]" aria-label="Next review">
                <ArrowRight size={18} />
              </button>
              <button type="button" onClick={() => setPaused((value) => !value)} className="grid h-11 w-11 place-items-center rounded-lg border border-white/12 bg-white/[0.06] text-white hover:bg-white/[0.1]" aria-label={paused ? "Play reviews" : "Pause reviews"}>
                {paused ? <Play size={18} /> : <Pause size={18} />}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              {reviews.map((review, reviewIndex) => (
                <button
                  key={`${review.name}-${reviewIndex}`}
                  type="button"
                  onClick={() => setIndex(reviewIndex)}
                  className={`h-2.5 rounded-full transition ${reviewIndex === index ? "w-8 bg-accent" : "w-2.5 bg-white/28 hover:bg-white/50"}`}
                  aria-label={`Show review ${reviewIndex + 1}`}
                  aria-current={reviewIndex === index}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
