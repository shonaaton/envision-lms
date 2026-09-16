import Image from "next/image";

/**
 * The hero's student cluster.
 *
 * Each artwork already carries its own blob shape, purple/yellow rings and
 * badge, baked in with transparency - so this component only places and drifts
 * them. Wrapping them in a fill, a ring or a morphing mask would double up on
 * what the PNG already draws, which is why none of that is here.
 *
 * The drift is the only motion, and it sits behind `prefers-reduced-motion`.
 */

type ClusterStudent = {
  /** Describes the moment, not the child - these are stock-styled brand assets. */
  alt: string;
  src: string;
  /** Position and size, as a share of the cluster box. */
  style: { left: string; top: string; width: string };
  /** Drift cycle, staggered so the four never bob in sync. */
  float: string;
  /** Stacking, so the overlaps read front-to-back deliberately. */
  z: string;
};

const students: ClusterStudent[] = [
  {
    alt: "Envision Chess Academy student playing a rated tournament game with a chess clock",
    src: "/images/students/tournament-play.webp",
    style: { left: "41%", top: "0%", width: "44%" },
    float: "hero-float-a",
    z: "z-20",
  },
  {
    alt: "Chess student writing notation while finishing homework set in an online chess class",
    src: "/images/students/homework-notation.webp",
    style: { left: "4%", top: "24%", width: "42%" },
    float: "hero-float-b",
    z: "z-30",
  },
  {
    alt: "Young chess student making a move on the board during a live coaching session",
    src: "/images/students/live-board.webp",
    style: { left: "54%", top: "34%", width: "43%" },
    float: "hero-float-c",
    z: "z-10",
  },
  {
    alt: "Chess student checking their progress dashboard in the Envision learning portal",
    src: "/images/students/progress-tracking.webp",
    style: { left: "23%", top: "55%", width: "40%" },
    float: "hero-float-d",
    z: "z-40",
  },
];

/** Dots, sparkles, rings and plus-signs, in brand tints only. */
const confetti = [
  { kind: "dot", left: "30%", top: "9%", size: 12, cls: "bg-brand" },
  { kind: "dot", left: "14%", top: "82%", size: 10, cls: "bg-accent-500" },
  { kind: "dot", left: "92%", top: "68%", size: 9, cls: "bg-brand-300" },
  { kind: "ring", left: "86%", top: "22%", size: 19, cls: "border-brand-400" },
  { kind: "ring", left: "3%", top: "60%", size: 14, cls: "border-accent-500" },
  { kind: "spark", left: "90%", top: "12%", size: 15, cls: "text-brand" },
  { kind: "spark", left: "2%", top: "40%", size: 13, cls: "text-accent-500" },
  { kind: "spark", left: "96%", top: "50%", size: 12, cls: "text-brand-300" },
  { kind: "plus", left: "84%", top: "86%", size: 16, cls: "text-accent-500" },
  { kind: "plus", left: "20%", top: "16%", size: 12, cls: "text-brand-300" },
];

function Confetti({ item }: { item: (typeof confetti)[number] }) {
  const base = "pointer-events-none absolute z-0";
  const pos = { left: item.left, top: item.top };
  if (item.kind === "dot") {
    return <span className={`${base} rounded-full ${item.cls}`} style={{ ...pos, width: item.size, height: item.size }} />;
  }
  if (item.kind === "ring") {
    return <span className={`${base} rounded-full border-2 ${item.cls}`} style={{ ...pos, width: item.size, height: item.size }} />;
  }
  if (item.kind === "plus") {
    return (
      <svg className={`${base} ${item.cls}`} style={pos} width={item.size} height={item.size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={`${base} ${item.cls}`} style={pos} width={item.size} height={item.size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 0c1.1 6.4 5.5 10.9 12 12-6.5 1.1-10.9 5.6-12 12-1.1-6.4-5.5-10.9-12-12C6.5 10.9 10.9 6.4 12 0Z" fill="currentColor" />
    </svg>
  );
}

export default function HeroStudentCluster() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[640px]" aria-label="Envision Chess Academy students learning chess online and at our Kolkata centres">
      {confetti.map((item, index) => (
        <Confetti key={index} item={item} />
      ))}

      {/* Handwritten aside, the way the reference points at its own photos. */}
      <div className="pointer-events-none absolute left-[0%] top-[4%] z-50 hidden sm:block">
        <p className="font-hand text-[1.5rem] leading-[1.15] text-brand">
          that&apos;s
          <br />
          our kids!
        </p>
        <svg className="mt-1 text-brand-300" width="62" height="34" viewBox="0 0 62 34" fill="none" aria-hidden>
          <path d="M2 10c6-8 13 6 19 0s10-8 15-1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M40 4c4 8 5 16 4 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M39 24l5 6 6-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {students.map((student) => (
        <div key={student.src} className={`absolute ${student.z} ${student.float}`} style={student.style}>
          <div className="relative aspect-square w-full">
            <Image
              src={student.src}
              alt={student.alt}
              fill
              sizes="(min-width: 1024px) 28vw, 45vw"
              className="object-contain drop-shadow-[0_14px_28px_rgba(90,19,114,0.16)]"
              priority
            />
          </div>
        </div>
      ))}
    </div>
  );
}
