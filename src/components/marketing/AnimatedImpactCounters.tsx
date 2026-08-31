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

export default function AnimatedImpactCounters({ counters }: { counters: Counter[] }) {
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
    <section ref={ref} className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-brand-900/12 sm:grid-cols-2 lg:grid-cols-5">
        {counters.map((item, index) => (
          <article key={item.label} className="group border-b border-slate-200 p-5 transition duration-300 hover:bg-[#fffdf0] sm:border-r lg:border-b-0">
            <div className="text-3xl font-black tabular-nums text-brand">{formatCounter(values[index], item.value)}</div>
            <div className="mt-2 text-sm font-semibold leading-5 text-slate-600">{item.label}</div>
            <div className="mt-4 h-0.5 w-10 bg-accent transition duration-300 group-hover:w-16" />
          </article>
        ))}
      </div>
    </section>
  );
}
