"use client";

import { useEffect, useRef } from "react";

/** Content stays visible without JS; motion only enhances cards arriving below the fold. */
export default function MarketingExperience() {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = progressRef.current?.closest(".marketing-site");
    if (!root) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in-view");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08 });

    const cards = root.querySelectorAll(".marketing-card, .coach-card");
    if (!reducedMotion.matches) {
      cards.forEach((card) => {
        if (card.getBoundingClientRect().top > window.innerHeight) observer.observe(card);
      });
    }

    let frame = 0;
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0})`;
      frame = 0;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const menu = root.querySelector<HTMLDetailsElement>("header details");
    const closeOnLink = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("a")) menu?.removeAttribute("open");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu?.open) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    menu?.addEventListener("click", closeOnLink);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      menu?.removeEventListener("click", closeOnLink);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={progressRef} className="marketing-reading-progress" aria-hidden="true" />;
}
