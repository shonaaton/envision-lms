import { COURSE_TIERS, COURSE_TIER_LABELS } from "@/lib/courseTiers";

/**
 * The taught syllabus, session by session, for each tier of the course ladder.
 *
 * A coach finishing a demo has to answer the one question sales acts on: which
 * session does this student start from? Typed free-hand that answer came back
 * as "pins", "The Pin", "pin easy" and "tactics" for the same session, so the
 * assessment form picks from this list instead. Ordering is the curriculum's
 * own, and a session number is the position in the tier - numbers are derived,
 * never stored here, so inserting a session renumbers the rest for free.
 *
 * Each tier is three sub-levels of roughly sixteen sessions. The tier keys are
 * the ones in `COURSE_TIERS`, so the level recommended on a demo is the same
 * value a batch, classroom or course is tagged with.
 */

const CURRICULUM: Record<string, string[][]> = {
  beginner: [
    [
      "Introduction to the course, the game & its history, introduction to the board",
      "Introduction to the pieces & their values, symbols of the pieces, setting up a board",
      "Movement of Rook, Movement of Bishop (including captures)",
      "Movement of Queen (including captures)",
      "Movement of Pawn, Movement of King (including captures)",
      "Movement of Knight (including captures)",
      "Notation Writing",
      "Revision Class",
      "Attacking a Piece",
      "Capturing a Hanging Piece",
      "Good Trade, Bad Trade, Equal Trade",
      "Gaining by Exchange",
      "Defending a Piece",
      "Giving Check & Getting Rid of Check",
      "Checkmate",
      "Revision Class",
    ],
    [
      "Stalemate",
      "Castling & Exceptions",
      "Promotion & Underpromotion",
      "En Passant Day 1",
      "Legal and Illegal Moves",
      "Revision Class",
      "Practice and Analysis",
      "How Does a Game End in a Draw",
      "Mate in 1 (Queen)",
      "Mate in 1 (Rook & Bishop)",
      "Mate in 1 with Pawn",
      "Mate in 1 (Knight)",
      "Defending Checkmate",
      "The Basic Principles of Chess (including Opening)",
      "Revision Class",
      "Practice and Analysis",
    ],
    [
      "Mate in 1 Easy",
      "Mate in 1 Medium",
      "Mate in 1 Hard",
      "Mate in 1 Mixed",
      "Checkmate with King and Queen",
      "Checkmate with Double Rook",
      "Checkmate with Single Rook and King",
      "Combined Practice: Checkmate with Queen, Double Rook and Single Rook",
      "Revision Class",
      "Practice and Analysis",
      "Proper Defensive Choices",
      "Opening Traps (Simple)",
      "Punishing Bad Opening Moves",
      "The Important Rules of Chess",
      "Practice and Analysis",
      "Revision Class",
    ],
  ],
  intermediate: [
    [
      "Double Attack Easy & Knight Fork Easy",
      "Double Attack Medium",
      "Pin Easy",
      "Pin Medium",
      "Skewer Easy",
      "Skewer Medium",
      "Revision",
      "Practice Session",
      "Back Rank Easy",
      "Back Rank Medium",
      "Discovered Attack & Check Easy",
      "Discovered Attack & Check Medium",
      "Double Check Easy",
      "Double Check Medium",
      "Revision",
      "Practice Session",
    ],
    [
      "Trapping Pieces Easy",
      "Trapping Pieces Medium",
      "Forced Moves (Check, Capture, Threat)",
      "Defending by Check or Pin",
      "Capturing the Defender",
      "Deflection Easy",
      "Revision",
      "Checkmate in 1 with Pin",
      "Checkmate in 1 with Discovered Attack",
      "Tricky Checkmates in 1",
      "Various Checkmates in 1",
      "Simple Checkmates in 2 Moves",
      "Medium Checkmates in 2 Moves",
      "Intermediate Move Easy",
      "Revision",
      "Practice Session",
    ],
    [
      "Intermediate Move Medium",
      "Decoy Easy",
      "Decoy Medium",
      "Windmill Easy",
      "Windmill Medium",
      "Overloading Easy",
      "Overloading Medium",
      "Revision",
      "Practice Session",
      "Smothered Mate & Suffocation Mate",
      "Pattern Recognition",
      "Back Rank Combinations",
      "Mate in 3 Easy",
      "Mate in 3 Medium",
      "Revision",
      "Practice Session",
    ],
  ],
  semi_pro: [
    [
      "Opposition (Basic & Distant Opposition)",
      "Key Squares",
      "The Rule of the Square",
      "Triangulation",
      "Mined Squares",
      "King and Pawn Endgames You Must Know",
      "Pawn Races, Underpass Method & Overpass Method",
      "Various Saving Moves",
      "Anastasia's Mate & Corner Mate",
      "Arabian Mate & Vukovic's Mate",
      "Greco's Mate & Lolli's Mate",
      "Opera Mate & Reti's Mate",
      "Hook Mate & Morphy's Mate",
      "Damiano's Mate & Damiano's Bishop Mate",
      "Boden's Mate",
      "Revision & Practice Session",
    ],
    [
      "Italian Game as White",
      "Ruy Lopez as White",
      "Queen's Gambit as White",
      "London System as White",
      "1.e4 e5 Classical Open Games as Black",
      "Sicilian Defence as Black",
      "Practice & Application",
      "Counterattack",
      "Avoiding Being Trapped",
      "Defending against a Double Attack",
      "Defending against a Pin",
      "Defending against Pawn Promotion",
      "Various Saving Moves",
      "Model Game 1",
      "Model Game 2",
      "Revision & Practice Session",
    ],
    [
      "Rook against Pawn",
      "Knight against Pawn",
      "Bishop against Pawn",
      "Queen against Pawn on the 7th Rank Day 1",
      "Queen against Pawn on the 7th Rank Practice",
      "Basic Rook Endgames: Lucena",
      "Basic Rook Endgames: Philidor",
      "Revision & Practice Session",
      "Pawn Endings Part 1",
      "Pawn Endings Part 2",
      "Double Bishop Checkmate",
      "Bishop and Pawn Endgame, Same Colour",
      "Bishop and Pawn Endgame, Opposite Colour",
      "Basic Rook Endgames: Vancura",
      "Bishop vs Knight Endgame",
      "Revision & Practice Session",
    ],
  ],
  pro: [
    [
      "X-Ray Attack Easy",
      "X-Ray Attack Medium",
      "Clearance Easy",
      "Clearance Medium",
      "Blockade Easy",
      "Blockade Medium",
      "Destroying the Castled King Easy",
      "Revision & Practice Session",
      "Combination involving Promotion",
      "Combination involving Files",
      "Combination involving Ranks",
      "Combination involving Diagonals",
      "Combination involving Knight Easy",
      "Combination involving Knight Medium",
      "Combination involving Major Pieces",
      "Revision & Practice Session",
    ],
    [
      "Greek Gift Sacrifice Easy",
      "Greek Gift Sacrifice Medium",
      "Perpetual Check",
      "Stalemate Combinations",
      "Opening and Closing Lines",
      "Positional Strengths of Each Piece",
      "Bishop and Knight Checkmate",
      "Revision & Practice Session",
      "Mate in 4 Easy",
      "Mate in 4 Medium",
      "Zugzwang Easy",
      "Zugzwang Medium",
      "Fork (Double Attack) Hard",
      "Pin Hard",
      "Skewer Hard",
      "Revision & Practice Session",
    ],
    [
      "Discovered Attack Hard",
      "Double Check Hard",
      "Back Rank Hard",
      "Overloading Hard",
      "Deflection Hard",
      "Decoy Hard",
      "Windmill Hard",
      "Revision & Practice Session",
      "Mate in 2 Hard",
      "Clearance Hard",
      "X-Ray Hard",
      "Blockade Hard",
      "Greek Gift Sacrifice Hard",
      "Zugzwang Hard",
      "Intermediate Moves Hard",
      "Revision & Practice Session",
    ],
  ],
  masters: [
    [
      "Mating Combinations",
      "The 7th Rank",
      "Line Blocking",
      "Outpost Day 1",
      "Outpost Day 2",
      "Underpromotion Day 1",
      "Underpromotion Day 2",
      "Revision & Practice Session",
      "Exploiting Weaknesses",
      "Fortresses",
      "Attacking the King: Lasker's Double Bishop Sacrifice",
      "Minor Tactics",
      "Weak Points",
      "Pawn Weaknesses",
      "Open Files and Semi-Open Files",
      "Revision & Practice Session",
    ],
    [
      "Isolated Pawns Day 1",
      "Isolated Pawns Day 2",
      "Doubled Pawns",
      "Backward Pawns",
      "Hanging Pawns Day 1",
      "Hanging Pawns Day 2",
      "Passed Pawns",
      "Revision & Practice Session",
      "Pawn Islands",
      "Queen Sacrifices",
      "Combinations involving Diagonals Hard",
      "Combinations involving Files Hard",
      "Combinations with the Major Pieces Hard",
      "Attacking the King: Typical Mates",
      "Attacking the King: Target Points",
      "Revision & Practice Session",
    ],
    [
      "Pawn Chain",
      "Attacking with Queen and Bishop",
      "Attacking with Queen and Rook",
      "Attacking with Queen and Pawn",
      "Attacking with Rook and Bishop",
      "Attacking with Rook and Knight",
      "Combinations involving Promotion",
      "Revision & Practice Session",
      "Shouldering",
      "The Active King",
      "The King's Routes: Zigzag and The Pendulum",
      "The Outside Passed Pawn",
      "The Protected Passed Pawn",
      "Breakthrough",
      "Theoretical Endgame: Same Colour Bishop Endings",
      "Revision & Practice Session",
    ],
  ],
};

export type CurriculumSession = {
  /** Position in the tier, 1-based - what a coach and a batch both call "Session 12". */
  sessionNumber: number;
  topic: string;
  /** "Level 1" .. "Level 3": the sub-level the session sits in. */
  levelName: string;
};

export type CurriculumLevel = { name: string; sessions: CurriculumSession[] };

/** Only live tiers are offered; "advanced" is retired and "mixed" is not a syllabus. */
export const CURRICULUM_TIERS: string[] = COURSE_TIERS.filter((tier) => (CURRICULUM[tier] || []).length);

export const CURRICULUM_TIER_OPTIONS = CURRICULUM_TIERS.map((tier) => ({
  value: tier,
  label: COURSE_TIER_LABELS[tier] || tier,
}));

/** A tier's sub-levels, with session numbers already counted across the whole tier. */
export function curriculumLevels(tier?: string | null): CurriculumLevel[] {
  const blocks = CURRICULUM[String(tier || "").trim()] || [];
  let sessionNumber = 0;
  return blocks.map((topics, index) => {
    const name = `Level ${index + 1}`;
    return {
      name,
      sessions: topics.map((topic) => ({ sessionNumber: ++sessionNumber, topic, levelName: name })),
    };
  });
}

/** Every session in a tier, flat and in teaching order. */
export function curriculumSessions(tier?: string | null): CurriculumSession[] {
  return curriculumLevels(tier).flatMap((level) => level.sessions);
}

/** The whole ladder at once, for a client form that switches tiers without a round trip. */
export function curriculumByTier(): Record<string, CurriculumLevel[]> {
  return Object.fromEntries(CURRICULUM_TIERS.map((tier) => [tier, curriculumLevels(tier)]));
}

/**
 * Resolve the session a coach picked. Keyed by number rather than by topic
 * because "Revision" and "Practice Session" each appear several times in a
 * tier, and a name lookup would silently resolve every one of them to the
 * first.
 */
export function curriculumSessionByNumber(tier: string | null | undefined, sessionNumber: number) {
  if (!Number.isFinite(sessionNumber) || sessionNumber < 1) return undefined;
  return curriculumSessions(tier).find((session) => session.sessionNumber === sessionNumber);
}
