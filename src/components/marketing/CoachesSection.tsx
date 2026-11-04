"use client";

import { useState } from "react";
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

export default function CoachesSection({
  heading = "Good moves start with great mentors.",
  intro = "Learn with FIDE and National Instructors, backed by a team of rated players. Real experience at the board. Personal guidance at every step.",
  className = "",
}: {
  heading?: string;
  intro?: string;
  className?: string;
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
        <div className="coach-section__toolbar">
          <div className="coach-filters" role="group" aria-label="Filter coaching team">
            <button type="button" aria-pressed={!instructorsOnly} onClick={() => setInstructorsOnly(false)}>Entire team <span>{academyCoaches.length}</span></button>
            <button type="button" aria-pressed={instructorsOnly} onClick={() => setInstructorsOnly(true)}>Certified instructors <span>{instructors.length}</span></button>
          </div>
          <p className="coach-section__hint" role="status">{coaches.length} coaches · Explore their FIDE profiles</p>
        </div>
        <ul className="coach-grid">
          {coaches.map((coach) => (
            <li key={coach.fideId} className="coach-card">
              <div className="coach-card__identity">
                <div className="coach-card__portrait">
                  <Image src={coach.photo} alt={`${coach.name}, chess coach at Envision Chess Academy`} fill sizes="(min-width: 640px) 104px, 88px" className="object-cover" />
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
              <a className="coach-card__profile" href={fideProfileUrl(coach.fideId)} target="_blank" rel="noopener noreferrer" aria-label={`View ${coach.name}'s FIDE profile (opens in a new tab)`}>
                <span><span className="coach-card__id">FIDE ID {coach.fideId}</span>View FIDE profile</span>
                <span className="coach-card__arrow"><ArrowUpRight size={20} aria-hidden="true" /></span>
              </a>
            </li>
          ))}
        </ul>
        <p className="coach-section__footnote">Ratings as of {COACH_RATINGS_AS_OF}. Profiles link directly to the official FIDE ratings website.</p>
      </div>
    </section>
  );
}
