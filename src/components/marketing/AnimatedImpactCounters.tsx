"use client";

import { useEffect, useRef, useState } from "react";

type Counter = {
  value: string;
  label: string;
};

function parseCounter(value: string) {
  const numeric = Number(value.replace(/[^0-9]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCounter(value: number, template: string) {
  const formatted = value >= 1000 ? value.toLocaleString("en-IN") : String(value);
  return template.includes("+") ? `${formatted}+` : formatted;
}

/**
 * `heading` and `intro` are optional: the counters render as a bare strip
 * unless a caller wants the band to carry a real section heading rather than a
 * row of numbers with no context.
 */
export default function AnimatedImpactCounters({
  counters,
  heading,
  intro,
}: {
  counters: Counter[];
  heading?: string;
  intro?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [started, setStarted] = useState(false);
  const [values, setValues] = useState(() => counters.map(() => 0));

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const targets = counters.map((counter) => parseCounter(counter.value));
    const duration = 1450;
    const start = performance.now();
    let frame = 0;

    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValues(targets.map((target) => Math.round(target * eased)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [counters, started]);

  return (
    <section ref={ref} className="relative z-10 bg-brand-50 px-4 pb-10 pt-8 sm:px-6 lg:px-8">
      {heading ? (
        <div className="mx-auto mb-6 max-w-7xl">
          <h2 className="text-2xl font-black leading-tight text-brand-900 sm:text-3xl">{heading}</h2>
          {intro ? <p className="mt-3 max-w-3xl text-sm leading-7 text-brand-900/70">{intro}</p> : null}
        </div>
      ) : null}
      <div className="mx-auto grid max-w-7xl overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-lg shadow-brand-900/5 sm:grid-cols-2 lg:grid-cols-5">
        {counters.map((item, index) => (
          <article key={item.label} className="group border-b border-brand/10 p-5 transition duration-300 hover:bg-brand-50 sm:border-r lg:border-b-0">
            <div className="text-3xl font-black tabular-nums text-brand">{formatCounter(values[index], item.value)}</div>
            <div className="mt-2 text-sm font-semibold leading-5 text-brand-900/70">{item.label}</div>
            <div className="mt-4 h-1 w-10 rounded-full bg-brand transition duration-300 group-hover:w-16" />
          </article>
        ))}
      </div>
    </section>
  );
}
