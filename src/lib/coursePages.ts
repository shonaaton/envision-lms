import type { Metadata } from "next";
import { curriculumLevels } from "@/lib/demoCurriculum";
import { MARKETING_BASE_URL } from "@/lib/publicLinks";

/**
 * Per-tier landing pages for the course ladder.
 *
 * Only the words live here. The sessions themselves are read from
 * `demoCurriculum` at render time, so a page can never advertise a syllabus the
 * coaches are not teaching. Adding a tier is one entry plus a two-line route.
 */

export type CoursePageConfig = {
  tier: string;
  slug: string;
  /** Short label for nav and breadcrumbs. */
  navLabel: string;
  /** The exact phrase the page targets, used in the H1 and title. */
  keyword: string;
  h1: string;
  eyebrow: string;
  title: string;
  description: string;
  keywords: string[];
  intro: string;
  /** What each level is for, keyed by "Level 1".."Level 3". */
  levelBlurb: Record<string, string>;
  /** Who the course assumes you already are. */
  prerequisite: string;
  faqs: { q: string; a: string }[];
  whyHeading: string;
};

export const coursePages: CoursePageConfig[] = [
  {
    tier: "beginner",
    slug: "online-chess-course-for-beginners",
    navLabel: "Beginner Course",
    keyword: "online chess course for beginners",
    h1: "Online chess course for beginners.",
    eyebrow: "Beginner Stage",
    title: "Online Chess Course for Beginners | 48 Live Sessions | Envision Chess Academy",
    description:
      "A structured online chess course for beginners: 48 live sessions across three levels, from how the pieces move to checkmate patterns and opening principles. Two classes a week with a coach. Book a free demo class.",
    keywords: [
      "online chess course for beginners",
      "beginner chess classes online",
      "learn chess online for beginners",
      "chess coaching for kids",
      "online chess classes",
      "chess course for beginners",
    ],
    intro:
      "Start from the very first move. 48 live sessions with a coach, across three levels, taking a complete beginner from how a rook moves to delivering checkmate on purpose.",
    levelBlurb: {
      "Level 1":
        "The board, the pieces and the rules. By the end of this level a complete beginner can play a full, legal game and record it.",
      "Level 2":
        "The rules that catch people out - stalemate, castling, promotion, en passant - plus finding checkmate in one and the opening principles.",
      "Level 3":
        "Delivering checkmate on purpose: king and queen, two rooks, rook and king, then defending, opening traps and punishing weak moves.",
    },
    prerequisite: "No experience needed",
    whyHeading: "Why parents choose Envision Chess Academy.",
    faqs: [
      {
        q: "Who is this online chess course for beginners suitable for?",
        a: "Anyone who has never played, or who knows roughly how the pieces move but has never been taught properly. The first session starts with the board itself, so no prior knowledge is assumed.",
      },
      {
        q: "How long does the beginner course take to complete?",
        a: "The beginner stage is 48 sessions in total, split into three levels of sixteen. At two classes a week each level takes about two months, so the full beginner stage runs roughly six months.",
      },
      {
        q: "Are the classes live or recorded?",
        a: "Every session is live with a coach. Students join from the academy portal, and homework, coach feedback and progress reports live in the same place.",
      },
      {
        q: "What happens after the beginner course?",
        a: "The ladder continues into Intermediate, Semi Pro, Pro and Masters. Each stage is another three levels of sixteen sessions, 240 taught sessions end to end.",
      },
      {
        q: "How do I know which level my child should start at?",
        a: "Book a free demo class. A coach assesses the student during the session and recommends the exact session number to begin from, rather than defaulting everyone to session one.",
      },
    ],
  },
  {
    tier: "intermediate",
    slug: "intermediate-chess-course-online",
    navLabel: "Intermediate Course",
    keyword: "intermediate chess course online",
    h1: "Intermediate chess course online.",
    eyebrow: "Intermediate Stage",
    title: "Intermediate Chess Course Online | 48 Tactics Sessions | Envision Chess Academy",
    description:
      "An intermediate chess course online built entirely on tactics: 48 live sessions covering forks, pins, skewers, back rank, discovered attacks, deflection, decoy, windmill and mate in two and three. Book a free demo class.",
    keywords: [
      "intermediate chess course online",
      "online chess classes for intermediate players",
      "chess tactics course online",
      "learn chess tactics",
      "chess coaching intermediate",
      "online chess training",
    ],
    intro:
      "For a player who knows the rules and now needs to see the board. 48 live sessions of pure tactics, from a first fork through to mate in three.",
    levelBlurb: {
      "Level 1":
        "The tactical alphabet: double attack, pin, skewer, back rank, discovered attack and double check, each worked from easy to medium.",
      "Level 2":
        "Turning tactics into wins - trapping pieces, forced moves, capturing the defender and deflection - then finding checkmate in one and two moves.",
      "Level 3":
        "The harder motifs: intermediate moves, decoy, windmill and overloading, finishing with smothered mate, pattern recognition and mate in three.",
    },
    prerequisite: "Knows the rules already",
    whyHeading: "Why players move to Envision Chess Academy.",
    faqs: [
      {
        q: "Who is this intermediate chess course online for?",
        a: "A player who already knows how every piece moves, can play a legal game and has met basic checkmates, but does not yet spot tactics reliably. If your child knows the rules but keeps losing pieces, this is the right stage.",
      },
      {
        q: "What does the intermediate course actually cover?",
        a: "It is a tactics course end to end: double attacks and knight forks, pins, skewers, back rank, discovered attack and double check, trapping pieces, deflection, decoy, windmill, overloading, smothered mate, and mate in one, two and three.",
      },
      {
        q: "How long does the intermediate stage take?",
        a: "48 sessions across three levels of sixteen. At two classes a week that is about two months per level, so roughly six months for the full stage.",
      },
      {
        q: "Do I need to finish the beginner course first?",
        a: "Not necessarily. A free demo class places the student at the right session, so a player who already knows the rules can start directly in the intermediate stage.",
      },
      {
        q: "How is progress tracked?",
        a: "Every session has homework the coach reviews, and attendance, assignment scores, tournament results and progress reports are visible to parents in the portal.",
      },
    ],
  },
];

export function getCoursePage(slug: string) {
  const config = coursePages.find((page) => page.slug === slug);
  if (!config) throw new Error(`No course page configured for "${slug}"`);
  return config;
}

export function courseSessionTotal(tier: string) {
  return curriculumLevels(tier).reduce((total, level) => total + level.sessions.length, 0);
}

export function courseMetadata(config: CoursePageConfig): Metadata {
  const url = `${MARKETING_BASE_URL}/${config.slug}`;
  return {
    metadataBase: new URL(MARKETING_BASE_URL),
    title: config.title,
    description: config.description,
    keywords: config.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: config.title,
      description: config.description,
      url,
      siteName: "Envision Chess Academy",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: config.keyword.replace(/\b\w/g, (c) => c.toUpperCase()),
      description: config.description,
    },
  };
}
