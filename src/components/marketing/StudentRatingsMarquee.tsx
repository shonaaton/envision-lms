import Image from "next/image";
import Link from "next/link";
import { RATINGS_AS_OF, type StudentRating } from "@/lib/studentRatings";

function initials(name: string) {
  return name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function Card({ student, hidden }: { student: StudentRating; hidden?: boolean }) {
  const external = student.href?.startsWith("http");
  const body = (
    <>
      <span className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-full bg-brand-50 ring-1 ring-brand/10">
        {student.photo ? (
          <Image
            src={student.photo}
            alt={hidden ? "" : `${student.name}, Envision Chess Academy student`}
            fill
            sizes="88px"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-brand text-2xl font-black text-white" aria-hidden>
            {initials(student.name)}
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold leading-tight text-brand-900">{student.name}</span>
        <span className="mt-2 inline-flex items-baseline gap-1.5 rounded-md border border-brand/15 bg-brand-50 px-2.5 py-1">
          <span className="text-sm font-black text-brand">{student.value}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-brand-900/55">{student.label}</span>
        </span>
        <span className="mt-2 line-clamp-2 block text-xs leading-[1.45] text-brand-900/65">{student.detail}</span>
      </span>
    </>
  );

  const className =
    "flex h-full w-[300px] items-center gap-4 rounded-2xl border border-brand/10 bg-white p-4 shadow-sm shadow-brand-900/5 transition hover:border-brand/30 hover:shadow-md sm:w-[330px]";

  if (!student.href) return <div className={className}>{body}</div>;
  if (external) {
    return (
      <a href={student.href} target="_blank" rel="noopener noreferrer" className={className} tabIndex={hidden ? -1 : undefined}>
        {body}
      </a>
    );
  }
  return (
    <Link href={student.href} className={className} tabIndex={hidden ? -1 : undefined}>
      {body}
    </Link>
  );
}

/**
 * A slow, endless strip of student cards. Pure CSS: the list is rendered twice
 * and the track slides by exactly half its width, so the loop has no seam. The
 * second copy is hidden from screen readers and the tab order. Hover or focus
 * pauses it; reduced-motion turns it into a plain horizontal scroller.
 */
export default function StudentRatingsMarquee({ students }: { students: StudentRating[] }) {
  return (
    <section aria-labelledby="student-ratings-heading" className="border-y border-brand/10 bg-brand-50 py-8 text-brand-900">
      <h2
        id="student-ratings-heading"
        className="px-4 text-center text-sm font-black uppercase tracking-[0.16em] text-brand-900/70 sm:text-base"
      >
        Our students. Their achievements.
      </h2>
      <div className="student-marquee mt-5">
        <ul className="student-marquee-track">
          {[0, 1].map((copy) =>
            students.map((student) => (
              <li key={`${copy}-${student.name}`} className="shrink-0 pr-4" aria-hidden={copy === 1 ? true : undefined}>
                <Card student={student} hidden={copy === 1} />
              </li>
            ))
          )}
        </ul>
      </div>
      <p className="mt-4 px-4 text-center text-[11px] text-brand-900/45">FIDE ratings as of {RATINGS_AS_OF}.</p>
    </section>
  );
}
