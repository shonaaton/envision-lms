import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { academyCoaches, COACH_RATINGS_AS_OF, fideProfileUrl, type AcademyCoach } from "@/lib/academyCoaches";

const ratingRows: { key: "standard" | "rapid" | "blitz"; label: string }[] = [
  { key: "standard", label: "Classical" },
  { key: "rapid", label: "Rapid" },
  { key: "blitz", label: "Blitz" },
];

function CoachCard({ coach }: { coach: AcademyCoach }) {
  return (
    <li className="flex flex-col rounded-2xl border border-brand/10 bg-white p-5 shadow-sm shadow-brand-900/5">
      <div className="flex items-center gap-4">
        <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-brand-50 ring-2 ring-accent/70">
          <Image src={coach.photo} alt={`${coach.name}, chess coach at Envision Chess Academy`} fill sizes="80px" className="object-cover" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-black leading-tight text-brand-900">{coach.name}</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {coach.designations.map((designation, index) => (
              <li
                key={designation}
                className={
                  index === 0
                    ? "rounded-full bg-brand px-2.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-white"
                    : "rounded-full border border-brand/20 bg-brand-50 px-2.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-brand"
                }
              >
                {designation}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 divide-x divide-brand/10 rounded-xl border border-brand/10 bg-brand-50/60 text-center">
        {ratingRows.map(({ key, label }) => (
          <div key={key} className="px-2 py-2">
            <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-brand-900/50">{label}</dt>
            <dd className="mt-0.5 text-base font-black text-brand-900">{coach[key] ?? "-"}</dd>
          </div>
        ))}
      </dl>
      <a
        href={fideProfileUrl(coach.fideId)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 self-start text-xs font-bold text-brand hover:underline"
      >
        FIDE ID {coach.fideId} <ExternalLink size={12} aria-hidden />
        <span className="sr-only">(opens the FIDE ratings profile)</span>
      </a>
    </li>
  );
}

/**
 * "Meet our coaches": the academy's coaching team with their FIDE trainer
 * titles and ratings, each linked to the public FIDE profile so the numbers
 * can be checked. Shared by the homepage, the centre and city pages, the
 * course pages and the online-class hubs; callers may override the copy.
 */
export default function CoachesSection({
  heading = "Learn from FIDE-certified, FIDE-rated coaches.",
  intro = "Our coaching team is led by FIDE and National Instructors, and every coach below holds an official FIDE rating. Each card links to that coach's profile on FIDE's own ratings site.",
  className = "bg-white",
}: {
  heading?: string;
  intro?: string;
  className?: string;
}) {
  return (
    <section id="coaches" aria-labelledby="coaches-heading" className={`relative overflow-hidden py-16 text-brand-900 lg:py-20 ${className}`}>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-3xl">
          <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm shadow-brand-900/20">
            Our Coaches
          </p>
          <h2 id="coaches-heading" className="mt-4 text-2xl font-black leading-tight text-brand-900 sm:text-3xl">
            {heading}
          </h2>
          <p className="mt-3 text-sm leading-7 text-brand-900/70">{intro}</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {academyCoaches.map((coach) => (
            <CoachCard key={coach.fideId} coach={coach} />
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-brand-900/45">FIDE ratings as of {COACH_RATINGS_AS_OF}.</p>
      </div>
    </section>
  );
}
