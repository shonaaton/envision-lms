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
  /**
   * Optional H2 directly under the H1. Lets a page lead with a course name
   * while still carrying its target phrase in a real heading.
   */
  supportingHeading?: string;
  eyebrow: string;
  title: string;
  description: string;
  keywords: string[];
  intro: string;
  /** What each level is for, keyed by "Level 1".."Level 3". */
  levelBlurb: Record<string, string>;
  /**
   * Wording for the demo call to action. The upper tiers are assessment-led
   * rather than drop-in, so they say so.
   */
  ctaLabel?: string;
  /** Who the course assumes you already are. */
  prerequisite: string;
  /**
   * schema.org educationalLevel. Kept separate from `eyebrow` because the
   * ladder's own name for a tier is not always the word people search for -
   * Semi Pro is taught and indexed as advanced.
   */
  educationalLevel: string;
  faqs: { q: string; a: string }[];
  whyHeading: string;
};

export const coursePages: CoursePageConfig[] = [
  {
    tier: "beginner",
    slug: "online-chess-coaching-courses/beginner-chess-course",
    navLabel: "Beginner Course",
    keyword: "online chess classes for beginners",
    h1: "Beginner Chess Course",
    supportingHeading: "Online chess classes for beginners, starting from the very first move.",
    eyebrow: "Beginner Stage",
    title: "Online Chess Classes for Beginners | Envision",
    description:
      "A structured online chess course for beginners: 48 live sessions across three levels, from how the pieces move to checkmate patterns and opening principles. Two classes a week with a coach. Book a free demo class.",
    keywords: [
      "online chess classes for beginners",
      "beginner chess course online",
      "online chess classes for kids",
      "chess coaching for beginners",
      "learn chess online for kids",
      "beginner chess coaching",
      "chess lessons for beginners",
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
    educationalLevel: "Beginner",
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
    slug: "online-chess-coaching-courses/intermediate-chess-course",
    navLabel: "Intermediate Course",
    keyword: "intermediate chess course online",
    h1: "Intermediate Chess Course",
    supportingHeading: "Intermediate chess course online - turn the fundamentals into stronger chess.",
    eyebrow: "Intermediate Stage",
    title: "Intermediate Chess Course Online | Envision",
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
    educationalLevel: "Intermediate",
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
  {
    tier: "semi_pro",
    slug: "online-chess-coaching-courses/semi-pro-chess-course",
    navLabel: "Semi-Pro Course",
    keyword: "advanced chess course online",
    h1: "Semi-Pro Chess Course",
    supportingHeading: "Advanced chess training for developing competitive players.",
    eyebrow: "Semi Pro Stage",
    title: "Advanced Chess Course Online | Semi-Pro - Envision",
    description:
      "An advanced chess course online for competitive players: 48 live sessions covering king and pawn endgames, fifteen named mating patterns, a full opening repertoire as White and Black, and Lucena, Philidor and Vancura rook endings. Book a free demo class.",
    keywords: [
      "advanced chess course online",
      "advanced chess coaching online",
      "online chess classes for advanced players",
      "competitive chess training",
      "advanced chess classes for kids",
      "tournament chess preparation",
      "chess coaching for rated players",
      "FIDE rating improvement",
      "opening preparation for chess tournaments",
      "advanced chess strategy course",
    ],
    intro:
      "For the player who already sees tactics and now needs technique. 48 live sessions on the endgames, mating patterns and opening repertoire that decide rated tournament games.",
    levelBlurb: {
      "Level 1":
        "King and pawn endgame technique - opposition, key squares, triangulation, mined squares - then fifteen named mating patterns from Anastasia's to Boden's.",
      "Level 2":
        "A working opening repertoire: Italian, Ruy Lopez, Queen's Gambit and London as White, classical open games and the Sicilian as Black, plus defensive technique and model games.",
      "Level 3":
        "The endgames that decide tournament games: piece against pawn, Lucena, Philidor and Vancura, pawn endings, opposite and same-colour bishops, and bishop against knight.",
    },
    prerequisite: "For competitive players",
    educationalLevel: "Advanced",
    whyHeading: "Why competitive players train at Envision Chess Academy.",
    faqs: [
      {
        q: "Who is this advanced chess course online for?",
        a: "A player who already spots tactics reliably and plays in tournaments, but loses points to technique - drawn endgames going wrong, no repertoire against a prepared opponent, or missing a known mating pattern. It assumes the intermediate tactics stage is behind you.",
      },
      {
        q: "Does the course include opening preparation for chess tournaments?",
        a: "Yes. Level 2 is a complete repertoire block: the Italian Game, Ruy Lopez, Queen's Gambit and London System as White, and classical open games plus the Sicilian Defence as Black, followed by annotated model games.",
      },
      {
        q: "Which endgames does the advanced course cover?",
        a: "Opposition, key squares, the rule of the square, triangulation and mined squares, then rook, knight, bishop and queen against pawn, Lucena, Philidor and Vancura rook endings, pawn endings, same and opposite-colour bishop endgames, and bishop against knight.",
      },
      {
        q: "Will this help with FIDE rating improvement?",
        a: "The syllabus targets the areas rated games are usually decided by - endgame technique, a prepared repertoire and recognising mating patterns quickly. Progress depends on the player, but the course is built around competitive rather than casual play.",
      },
      {
        q: "How long is the advanced stage?",
        a: "48 sessions across three levels of sixteen. At two classes a week that is about two months per level, so roughly six months for the full stage.",
      },
    ],
  },
  {
    tier: "pro",
    slug: "online-chess-coaching-courses/pro-chess-course",
    navLabel: "Pro Course",
    keyword: "chess coaching for rated players",
    h1: "Pro Chess Course",
    supportingHeading: "Structured training for FIDE-rated and competitive players.",
    eyebrow: "Pro Stage",
    title: "Chess Coaching for Rated Players | Pro Course - Envision",
    description:
      "Chess coaching for rated players at Envision Chess Academy. The Pro Course is 48 live sessions of advanced calculation for competitive tournament players.",
    keywords: [
      "chess coaching for rated players",
      "online chess coaching for rated players",
      "chess coaching for FIDE-rated players",
      "FIDE chess coaching",
      "competitive chess coaching",
      "professional chess coaching",
      "chess coaching for tournament players",
      "chess rating improvement",
      "FIDE rating improvement",
      "competitive chess training",
      "tournament chess preparation",
      "online chess training in India",
      "advanced chess training online",
      "chess calculation training",
      "advanced chess tactics",
      "professional chess training",
    ],
    intro:
      "Structured online chess coaching in India for rated and tournament players. 48 live sessions on advanced calculation - sacrifices, combinations and every tactical motif taken to its hardest form.",
    levelBlurb: {
      "Level 1":
        "Advanced motifs and combinations: x-ray, clearance, blockade, destroying the castled king, and combinations on files, ranks, diagonals and with the knight.",
      "Level 2":
        "Sacrificial and positional play - the Greek gift, perpetual check, stalemate combinations, opening and closing lines, bishop and knight mate - plus mate in four, zugzwang and hard forks, pins and skewers.",
      "Level 3":
        "Every motif at its hardest: discovered attack, double check, back rank, overloading, deflection, decoy and windmill, finishing with hard x-ray, blockade, Greek gift, zugzwang and intermediate moves.",
    },
    prerequisite: "For rated and tournament players",
    educationalLevel: "Advanced",
    whyHeading: "Why competitive players choose Envision for online chess coaching in India.",
    faqs: [
      {
        q: "Who should join the Envision Pro Chess Course?",
        a: "A competitive player who already has a tactical foundation and an endgame and opening base, and now needs depth of calculation. It assumes the intermediate and advanced stages are behind you, and is aimed at players competing in rated events.",
      },
      {
        q: "Is the Pro Course suitable for FIDE-rated chess players?",
        a: "Yes. The syllabus is built around the calculation depth rated games demand - sacrificial attacks, multi-move combinations and every standard motif in its hardest form, up to mate in four.",
      },
      {
        q: "Do you provide online chess coaching in India?",
        a: "Yes. Classes are live and online, so students anywhere in India join from the academy portal. Envision also runs four centres in Kolkata for students who prefer to attend in person.",
      },
      {
        q: "Can online chess coaching help improve my FIDE rating?",
        a: "The course targets what rated games are usually decided by at this level: whether you find the combination and calculate it accurately. Rating gains depend on the player and how much they compete, so no coach can promise a number, but the training is built for competitive rather than casual play.",
      },
      {
        q: "Does the Pro Course include opening repertoire training?",
        a: "Opening repertoire is taught in the Advanced (Semi Pro) stage before this one - the Italian, Ruy Lopez, Queen's Gambit and London as White, and classical open games and the Sicilian as Black. The Pro Course builds on that foundation and concentrates entirely on calculation and combinations.",
      },
      {
        q: "Is individual chess coaching available?",
        a: "Yes. Students can be enrolled in group batches or one-to-one coaching, and the demo assessment covers which format suits the player.",
      },
      {
        q: "How are students placed into the Pro Course?",
        a: "Through a free assessment class. A coach reviews the student's current level and recommends the exact session to start from, so a strong player is not made to repeat earlier stages.",
      },
      {
        q: "How long does the Pro stage take?",
        a: "48 sessions across three levels of sixteen. At two classes a week that is about two months per level, so roughly six months for the full stage.",
      },
    ],
  },
  {
    tier: "masters",
    slug: "online-chess-coaching-courses/masters-chess-course",
    navLabel: "Masters Course",
    keyword: "elite chess coaching online",
    h1: "Masters Chess Course",
    supportingHeading: "Elite training for serious competitive chess players.",
    eyebrow: "Masters Stage",
    title: "Elite Chess Coaching Online | Masters Course - Envision",
    description:
      "Elite chess coaching online for competitive players. Train pawn structure, attacking play, positional judgement and advanced endgames with Envision.",
    keywords: [
      "elite chess coaching online",
      "elite chess training online",
      "master chess course online",
      "high level chess coaching",
      "professional chess training online",
      "chess coaching for competitive players",
      "chess coaching for rated players",
      "advanced tournament chess training",
      "FIDE rating improvement",
      "personalised chess coaching online",
      "advanced chess calculation training",
      "advanced chess endgame training",
      "advanced positional chess",
      "strategic chess training",
      "high performance chess training",
    ],
    intro:
      "High-performance chess training for ambitious rated players. 48 live sessions on the positional understanding that separates strong players - pawn structure, weak squares, attacking schemes and deep endgame theory.",
    levelBlurb: {
      "Level 1":
        "Positional foundations: the seventh rank, line blocking, outposts and underpromotion, then exploiting weaknesses, fortresses, weak points and open files.",
      "Level 2":
        "Pawn structure as a whole discipline - isolated, doubled, backward, hanging and passed pawns, pawn islands - alongside queen sacrifices and attacking the king by typical mates and target points.",
      "Level 3":
        "Attacking schemes by piece pair, then king and pawn technique at theoretical depth: shouldering, the active king, king routes, outside and protected passed pawns, breakthrough and same-colour bishop endings.",
    },
    ctaLabel: "Book Your Masters Assessment",
    prerequisite: "By assessment only",
    educationalLevel: "Advanced",
    whyHeading: "Why ambitious players train at Envision Chess Academy.",
    faqs: [
      {
        q: "Who is the Masters Chess Course designed for?",
        a: "A competitive player who already calculates well and now needs judgement - knowing which structure to aim for, which weakness to attack and which endgame to steer into. It assumes the Pro stage, or equivalent strength, is already behind you.",
      },
      {
        q: "What is elite chess coaching?",
        a: "At this level coaching stops being about learning motifs and becomes about understanding positions. The Masters syllabus is built around pawn structure, weak squares, attacking schemes and theoretical endgames rather than puzzle patterns.",
      },
      {
        q: "How do I qualify for the Masters Course?",
        a: "Through an assessment class rather than direct enrolment. A coach reviews the player's current standard and recommends whether Masters is the right stage, or which earlier session to start from instead.",
      },
      {
        q: "Is the Masters Course suitable for FIDE-rated players?",
        a: "Yes, it is aimed at rated and competitive players. The material - hanging pawns, fortresses, target points, the outside passed pawn, same-colour bishop endings - is the sort that decides games between players who both already know the tactics.",
      },
      {
        q: "Does the course include advanced endgame training?",
        a: "Yes. The second half of Level 3 is theoretical endgame work: shouldering, the active king, king routes, outside and protected passed pawns, breakthrough and same-colour bishop endings.",
      },
      {
        q: "Does the Masters Course include opening preparation?",
        a: "Opening repertoire is taught earlier in the ladder, in the Advanced (Semi Pro) stage. The Masters Course is positional and endgame work, and assumes a repertoire is already in place.",
      },
      {
        q: "Can the Masters Course help improve my FIDE rating?",
        a: "It targets the areas games are decided by once both players see the tactics. Rating depends on the player and how often they compete, so no course can promise a number, but the syllabus is built for competitive rather than casual play.",
      },
      {
        q: "Is individual coaching available for Masters students?",
        a: "Yes. Students can be placed in a group batch or in one-to-one coaching, and the assessment covers which format suits the player.",
      },
    ],
  },
];

/**
 * The parent page every course sits under. It carries the broad commercial
 * phrases so the child pages do not compete with it - each of those owns one
 * specific intent instead.
 */
export const courseHub = {
  slug: "online-chess-coaching-courses",
  navLabel: "Online Chess Coaching Courses",
  keyword: "online chess coaching courses",
  h1: "Online Chess Coaching Courses",
  supportingHeading: "Structured online chess coaching in India for every level.",
  title: "Online Chess Coaching Courses in India | Envision Chess Academy",
  description:
    "Explore online chess coaching courses at Envision Chess Academy, with structured training from Beginner to Masters level for students across India and worldwide.",
  keywords: [
    "online chess coaching courses",
    "online chess coaching in India",
    "online chess classes in India",
    "online chess courses",
    "online chess training",
    "online chess academy in India",
    "chess classes online",
    "online chess classes for kids",
    "professional chess coaching online",
    "chess coaching for kids",
    "structured online chess coaching",
  ],
  intro:
    "One ladder, five stages, 240 taught sessions. Every student is placed by a coach at the session that matches their strength, then works through a syllabus that runs from the first move to elite competitive play.",
};

export function courseHubMetadata(): Metadata {
  const url = `${MARKETING_BASE_URL}/${courseHub.slug}`;
  return {
    metadataBase: new URL(MARKETING_BASE_URL),
    title: courseHub.title,
    description: courseHub.description,
    keywords: courseHub.keywords,
    alternates: { canonical: url },
    openGraph: { title: courseHub.title, description: courseHub.description, url, siteName: "Envision Chess Academy", type: "website" },
    twitter: { card: "summary_large_image", title: "Online Chess Coaching Courses", description: courseHub.description },
  };
}

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
