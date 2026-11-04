"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, BadgeCheck, Crown } from "lucide-react";
import { academyCoaches, COACH_RATINGS_AS_OF, fideProfileUrl } from "@/lib/academyCoaches";

const ratingRows = [
  { key: "standard", label: "Classical" },
  { key: "rapid", label: "Rapid" },
  { key: "blitz", label: "Blitz" },
] as const;

const isInstructor = (coach: (typeof academyCoaches)[number]) => coach.designations.some((title) => /^(FIDE|National) Instructor$/.test(title));
const instructors = academyCoaches.filter(isInstructor);

type Coach = (typeof academyCoaches)[number];

/** One coach. `hidden` marks the second, decorative copy in the scrolling strip. */
function CoachCard({ coach, hidden, as: Tag = "li" }: { coach: Coach; hidden?: boolean; as?: "li" | "div" }) {
  return (
    <Tag className="coach-card" aria-hidden={hidden || undefined}>
      <div className="coach-card__identity">
        <div className="coach-card__portrait">
          <Image src={coach.photo} alt={hidden ? "" : `${coach.name}, chess coach at Envision Chess Academy`} fill sizes="(min-width: 640px) 104px, 88px" className="object-cover" />
        </div>
        <div className="coach-card__name">
          <span className="coach-card__label">{isInstructor(coach) ? <><Crown size={12} aria-hidden="true" /> Certified instructor</> : "Academy coach"}</span>
          <h3>{coach.name}</h3>
          <ul className="coach-card__titles">{coach.designations.map((title) => <li key={title}>{title}</li>)}</ul>
        </div>
      </div>
      <dl className="coach-card__ratings">
        {ratingRows.map(({ key, label }) => (
          <div key={key}><dt>{label}</dt><dd>{coach[key] ?? <span aria-label="Not rated">—</span>}</dd></div>
        ))}
      </dl>
      <a className="coach-card__profile" href={fideProfileUrl(coach.fideId)} target="_blank" rel="noopener noreferrer" aria-label={`View ${coach.name}'s FIDE profile (opens in a new tab)`} tabIndex={hidden ? -1 : undefined}>
        <span><span className="coach-card__id">FIDE ID {coach.fideId}</span>View FIDE profile</span>
        <span className="coach-card__arrow"><ArrowUpRight size={20} aria-hidden="true" /></span>
      </a>
    </Tag>
  );
}

/**
 * Every coach in an endless sideways strip that moves by itself but is a real
 * scroller underneath: a swipe, trackpad or mouse drag takes over, and the
 * strip picks up again from wherever it was left. A CSS-animated track cannot
 * do that; it can only pause, which read as the strip freezing under a finger.
 *
 * The list is rendered twice and the position wraps by one copy's width, so
 * the loop has no seam in either direction.
 */
function CoachMarquee() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SPEED = 38; // px per second
    let pos = el.scrollLeft;
    let holding = false;
    let resumeAt = 0;
    let last = performance.now();
    let frame = 0;

    // One copy's width: the second copy starts exactly there.
    const loopWidth = () => el.scrollWidth / 2;
    const wrap = () => {
      const half = loopWidth();
      if (half <= 0) return;
      if (el.scrollLeft >= half) el.scrollLeft -= half;
      else if (el.scrollLeft <= 0) el.scrollLeft += half;
    };

    const tick = (now: number) => {
      const dt = Math.min(now - last, 64) / 1000;
      last = now;
      if (!holding && now >= resumeAt && !reduced) {
        // Track our own float position: scrollLeft rounds, and a sub-pixel step would never move.
        pos += SPEED * dt;
        const half = loopWidth();
        if (half > 0 && pos >= half) pos -= half;
        el.scrollLeft = pos;
      } else {
        pos = el.scrollLeft;
      }
      frame = requestAnimationFrame(tick);
    };

    const hold = () => {
      holding = true;
    };
    const release = () => {
      holding = false;
      resumeAt = performance.now() + 2500;
    };
    // Wheel and trackpad gestures have no "end", so each one just pushes the restart back.
    const onWheel = () => {
      resumeAt = performance.now() + 2500;
    };
    const onScroll = () => {
      if (holding || performance.now() < resumeAt) wrap();
    };

    // A mouse cannot swipe a scroller, so dragging with it moves the strip too.
    let dragX: number | null = null;
    let dragged = 0;
    const onPointerDown = (event: PointerEvent) => {
      hold();
      dragged = 0;
      if (event.pointerType === "mouse") dragX = event.clientX;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (dragX === null) return;
      const delta = event.clientX - dragX;
      dragged += Math.abs(delta);
      el.scrollLeft -= delta;
      dragX = event.clientX;
      wrap();
    };
    // A drag that ends over a card must not also open that coach's FIDE profile.
    const onClick = (event: MouseEvent) => {
      if (dragged > 6) event.preventDefault();
    };
    const onPointerUp = () => {
      dragX = null;
      release();
    };

    el.scrollLeft = 1;
    pos = 1;
    frame = requestAnimationFrame(tick);
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("click", onClick, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    el.addEventListener("touchstart", hold, { passive: true });
    el.addEventListener("touchend", release, { passive: true });
    el.addEventListener("touchcancel", release, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("focusin", hold);
    el.addEventListener("focusout", release);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("click", onClick, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("touchstart", hold);
      el.removeEventListener("touchend", release);
      el.removeEventListener("touchcancel", release);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("focusin", hold);
      el.removeEventListener("focusout", release);
    };
  }, []);

  return (
    <div ref={ref} className="coach-marquee">
      <ul className="coach-marquee-track">
        {[0, 1].map((copy) =>
          academyCoaches.map((coach) => (
            <li key={`${copy}-${coach.fideId}`} className="shrink-0 pr-5">
              <CoachCard coach={coach} hidden={copy === 1} as="div" />
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default function CoachesSection({
  heading = "Good moves start with great mentors.",
  intro = "Learn with FIDE and National Instructors, backed by a team of rated players. Real experience at the board. Personal guidance at every step.",
  className = "",
  scrolling = false,
}: {
  heading?: string;
  intro?: string;
  className?: string;
  /** An endless sideways strip of every coach instead of the filterable grid (the book-free-demo page). */
  scrolling?: boolean;
}) {
  const [instructorsOnly, setInstructorsOnly] = useState(false);
  const coaches = instructorsOnly ? instructors : academyCoaches;

  return (
    <section id="coaches" aria-labelledby="coaches-heading" className={`coach-section ${className}`}>
      <div className="coach-section__pattern" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="coach-section__heading">
          <div className="max-w-2xl">
            <p className="marketing-eyebrow"><span /> The people behind your progress</p>
            <h2 id="coaches-heading">{heading}</h2>
            <p className="coach-section__intro">{intro}</p>
          </div>
          <div className="coach-section__seal"><BadgeCheck size={25} aria-hidden="true" /><span>Every coach.<br /><strong>Officially FIDE-rated.</strong></span></div>
        </div>
        {!scrolling && <div className="coach-section__toolbar">
          <div className="coach-filters" role="group" aria-label="Filter coaching team">
            <button type="button" aria-pressed={!instructorsOnly} onClick={() => setInstructorsOnly(false)}>Entire team <span>{academyCoaches.length}</span></button>
            <button type="button" aria-pressed={instructorsOnly} onClick={() => setInstructorsOnly(true)}>Certified instructors <span>{instructors.length}</span></button>
          </div>
          <p className="coach-section__hint" role="status">{coaches.length} coaches · Explore their FIDE profiles</p>
        </div>}
        {scrolling ? (
          <CoachMarquee />
        ) : (
          <ul className="coach-grid">
            {coaches.map((coach) => (
              <CoachCard key={coach.fideId} coach={coach} />
            ))}
          </ul>
        )}
        <p className="coach-section__footnote">Ratings as of {COACH_RATINGS_AS_OF}. Profiles link directly to the official FIDE ratings website.</p>
      </div>
    </section>
  );
}
