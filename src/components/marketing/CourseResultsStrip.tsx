import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { publicAchievementList, studentSlug } from "@/lib/achievementData";
import { achievementAlt, achievementCaption } from "@/lib/achievementCopy";

/**
 * A short proof strip of real student results, for the course pages.
 *
 * It reads the seeded achievement list rather than the database on purpose:
 * these pages are statically rendered, and a DB call would opt them out of
 * that for the sake of four photos.
 *
 * `offset` rotates which four are shown, so the hub and the five course pages
 * each feature different students instead of repeating one block six times.
 */
export default function CourseResultsStrip({
  heading,
  intro,
  offset = 0,
}: {
  heading: string;
  intro: string;
  offset?: number;
}) {
  const all = publicAchievementList();
  const start = all.length ? (offset * 4) % all.length : 0;
  const featured = [...all.slice(start), ...all.slice(0, start)].slice(0, 4);
  if (!featured.length) return null;

  return (
    <section className="relative overflow-hidden bg-white py-14 text-brand-900 lg:py-20">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#f5edf8_0%,#ffffff_100%)]" />
      <div className="absolute inset-0 opacity-[0.5] [background-image:linear-gradient(115deg,rgba(90,19,114,0.06)_1px,transparent_1px)] [background-size:74px_74px]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="inline-flex rounded-full bg-brand px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-sm shadow-brand-900/20">Student Results</p>
            <h2 className="mt-4 text-2xl font-black text-brand-900">{heading}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-brand-900/70">{intro}</p>
          </div>
          <Link href="/#achievements" className="btn border border-brand/25 bg-white text-brand shadow-sm shadow-brand-900/5 hover:border-brand/50 hover:bg-brand-50">
            All student achievements <ArrowRight size={16} />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((item) => (
            <article
              key={`${item.studentName}-${item.displayOrder}`}
              className="group relative rounded-xl border border-brand/10 bg-white p-2 shadow-lg shadow-brand-900/5 transition duration-300 hover:-translate-y-0.5 hover:border-brand/30 hover:bg-brand-50"
            >
              <figure className="m-0">
                <div className="relative aspect-[1.08] overflow-hidden rounded-xl bg-brand-50 shadow-inner shadow-brand-900/10">
                  <Image src={item.achievementImageUrl} alt="" aria-hidden fill sizes="(min-width: 1024px) 25vw, 50vw" className="scale-110 object-cover opacity-12 blur-2xl" />
                  <Image src={item.achievementImageUrl} alt={achievementAlt(item)} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-contain p-3 transition duration-700 group-hover:scale-[1.02]" />
                </div>
                <figcaption className="p-3">
                  <h3 className="line-clamp-1 text-sm font-black text-brand-900">{item.studentName}</h3>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold text-brand-900/70">{item.result}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-brand-900/55">{achievementCaption(item)}</p>
                  <Link href={`/success-stories/${studentSlug(item.studentName)}`} className="mt-3 inline-flex items-center gap-1 text-xs font-black text-brand">
                    Story <ArrowRight size={13} />
                  </Link>
                </figcaption>
              </figure>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
