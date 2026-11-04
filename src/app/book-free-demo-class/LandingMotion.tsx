"use client";

import { useEffect } from "react";

/**
 * The scroll-driven half of the landing page's motion: reveals, count-ups, the
 * header shadow and the phone's sticky CTA.
 *
 * Renders nothing. Content is visible in the server HTML; only once this runs
 * does `.motion` hide what has not yet scrolled into view, and anything already
 * on screen is marked revealed in the same task, so nothing blinks out.
 */
export default function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".bfd");
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: (() => void)[] = [];

    // Reveals and count-ups.
    const revealables = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const counters = Array.from(root.querySelectorAll<HTMLElement>("[data-count]"));
    if (!reduced && "IntersectionObserver" in window) {
      const inView = (el: Element) => {
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      };
      revealables.forEach((el) => inView(el) && el.classList.add("is-in"));
      root.classList.add("motion");

      const countUp = (el: HTMLElement) => {
        const target = Number(el.dataset.count);
        const started = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - started) / 1200);
          el.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const el = entry.target as HTMLElement;
            if (el.dataset.count) countUp(el);
            else el.classList.add("is-in");
            observer.unobserve(el);
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
      );
      revealables.forEach((el) => !el.classList.contains("is-in") && observer.observe(el));
      counters.forEach((el) => observer.observe(el));
      cleanups.push(() => observer.disconnect());
    }

    // Header shadow once the page has moved.
    const topbar = root.querySelector<HTMLElement>("[data-topbar]");
    const onScroll = () => topbar?.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => window.removeEventListener("scroll", onScroll));

    // The phone's sticky CTA: shown only while neither on-page button is on screen.
    const bar = root.querySelector<HTMLElement>("[data-mobile-cta]");
    const anchors = [root.querySelector("[data-hero-cta]"), root.querySelector("[data-final-cta]")].filter(Boolean) as Element[];
    if (bar && anchors.length && "IntersectionObserver" in window) {
      const visible = new Set<Element>();
      const ctaObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => (entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target)));
        bar.classList.toggle("show", visible.size === 0);
      });
      anchors.forEach((el) => ctaObserver.observe(el));
      cleanups.push(() => ctaObserver.disconnect());
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return null;
}
