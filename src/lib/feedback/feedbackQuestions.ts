/**
 * What a coach is asked about each student in the monthly feedback, per course
 * tier. Kept in code, like the demo assessment scales, so every coach rates
 * every student against the same ladder and the questions cannot drift per
 * coach.
 *
 * The form is deliberately short - four skills, one effort rating, a few
 * tap-to-pick chips - because it is filled once per student every month.
 *
 * Keys and values are stored; labels are not. Renaming a label is free.
 * Changing a key orphans every report saved under it, so add a new key (and
 * bump QUESTION_SET_VERSION) rather than renaming one.
 */

import { classroomTier, courseTierLabel } from "@/lib/courseTiers";

export const QUESTION_SET_VERSION = 1;

export type FeedbackSkill = { key: string; label: string; hint: string };
export type FeedbackQuestionSet = {
  tier: string;
  tierLabel: string;
  skills: FeedbackSkill[];
  highlights: string[];
  focusAreas: string[];
};

/** One scale for every rating, so a parent reads every bar the same way. */
export const RATING_SCALE = [
  { value: 1, label: "Needs support" },
  { value: 2, label: "Getting there" },
  { value: 3, label: "Good" },
  { value: 4, label: "Very good" },
  { value: 5, label: "Excellent" },
] as const;

export const EFFORT_SKILL: FeedbackSkill = { key: "effort", label: "Effort & focus in class", hint: "Attention, participation and homework" };

export const MAX_FOCUS_AREAS = 2;
export const MAX_HIGHLIGHTS = 4;
export const PARENT_NOTE_MAX = 400;
/** The note is the one personal line a family gets, so it is required and cannot be a one-word placeholder. */
export const PARENT_NOTE_MIN = 15;
export const INTERNAL_NOTE_MAX = 500;
export const CUSTOM_CHIP_MAX = 80;

const SETS: Record<string, Omit<FeedbackQuestionSet, "tier" | "tierLabel">> = {
  beginner: {
    skills: [
      { key: "rules", label: "Piece moves & rules", hint: "Moves every piece correctly, knows check, castling, en passant" },
      { key: "checkmates", label: "Basic checkmates", hint: "Queen and rook mates, back-rank mate" },
      { key: "board_vision", label: "Board vision", hint: "Stops leaving pieces undefended" },
      { key: "opening_principles", label: "Opening principles", hint: "Centre, development, king safety" },
    ],
    highlights: [
      "Learnt all the piece moves",
      "Delivered first checkmates",
      "Stopped hanging pieces",
      "Castles early and confidently",
      "Solves puzzles eagerly",
      "Asks great questions in class",
    ],
    focusAreas: [
      "Checking every move for threats",
      "Basic checkmate patterns",
      "Opening principles",
      "Finishing homework on time",
      "Playing more practice games",
      "Staying focused for the whole class",
    ],
  },
  intermediate: {
    skills: [
      { key: "tactics", label: "Tactics", hint: "Forks, pins, skewers, discovered attacks" },
      { key: "calculation", label: "Calculation", hint: "Sees two or three moves ahead" },
      { key: "endgames", label: "Basic endgames", hint: "King and pawn endings, opposition" },
      { key: "planning", label: "Middlegame planning", hint: "Chooses a plan instead of move-by-move play" },
    ],
    highlights: [
      "Spots forks and pins in games",
      "Calculating more carefully",
      "Converted winning endgames",
      "Plays with a clear plan",
      "Strong puzzle performance",
      "Good tournament results",
    ],
    focusAreas: [
      "Tactical pattern practice",
      "Calculating forcing lines",
      "King and pawn endgames",
      "Making a plan after the opening",
      "Time management in games",
      "Reviewing own games",
    ],
  },
  semi_pro: {
    skills: [
      { key: "combinations", label: "Combinations", hint: "Multi-move tactics and sacrifices" },
      { key: "positional", label: "Positional understanding", hint: "Pawn structure, weak squares, piece activity" },
      { key: "openings", label: "Opening repertoire", hint: "Knows the ideas behind their openings" },
      { key: "endgames", label: "Rook & minor-piece endgames", hint: "Technique in practical endings" },
    ],
    highlights: [
      "Found strong combinations",
      "Better positional judgement",
      "Solid opening repertoire",
      "Improved endgame technique",
      "Rating improvement",
      "Mature decision-making",
    ],
    focusAreas: [
      "Deeper combinations",
      "Pawn structures and plans",
      "Opening ideas, not just moves",
      "Rook endgame technique",
      "Clock management",
      "Annotating own games",
    ],
  },
  pro: {
    skills: [
      { key: "calculation", label: "Deep calculation", hint: "Long, branching variations" },
      { key: "strategy", label: "Strategic planning", hint: "Long-term plans and prophylaxis" },
      { key: "opening_prep", label: "Opening preparation", hint: "Prepared lines and understanding" },
      { key: "endgame_technique", label: "Endgame technique", hint: "Converting and defending precisely" },
    ],
    highlights: [
      "Calculated complex lines accurately",
      "Strong strategic games",
      "Well-prepared openings",
      "Precise endgame conversions",
      "Good tournament performance",
      "Rating gain",
    ],
    focusAreas: [
      "Calculation under time pressure",
      "Prophylactic thinking",
      "Expanding the opening repertoire",
      "Theoretical endgames",
      "Tournament preparation",
      "Deep game analysis",
    ],
  },
  masters: {
    skills: [
      { key: "candidate_moves", label: "Candidate-move discipline", hint: "Considers every serious option" },
      { key: "judgement", label: "Dynamic & positional judgement", hint: "Evaluates imbalances correctly" },
      { key: "repertoire", label: "Repertoire depth", hint: "Deep, well-understood preparation" },
      { key: "analysis", label: "Game analysis & tournament readiness", hint: "Self-review, stamina, practical play" },
    ],
    highlights: [
      "Excellent practical decisions",
      "Deep preparation paid off",
      "Strong tournament results",
      "Sharp self-analysis",
      "Handled complex positions well",
      "Title-norm level play",
    ],
    focusAreas: [
      "Candidate-move routine",
      "Evaluating imbalances",
      "Repertoire deepening",
      "Engine-assisted analysis",
      "Tournament stamina",
      "Psychological preparation",
    ],
  },
};

/** Retired "advanced" sat between intermediate and pro. */
function setKeyFor(tier: unknown) {
  const raw = String(tier || "").trim();
  if (raw === "advanced") return "semi_pro";
  return classroomTier(raw);
}

export function questionSetFor(tier: unknown): FeedbackQuestionSet {
  const key = setKeyFor(tier);
  const set = SETS[key] || SETS.beginner;
  return { tier: SETS[key] ? key : "beginner", tierLabel: courseTierLabel(SETS[key] ? key : "beginner"), ...set };
}

/** Every rating key the form must fill in for a tier: its skills plus effort. */
export function requiredRatingKeys(tier: unknown) {
  return [...questionSetFor(tier).skills.map((skill) => skill.key), EFFORT_SKILL.key];
}

export function ratingLabel(value: unknown) {
  const number = Number(value);
  return RATING_SCALE.find((step) => step.value === number)?.label || "";
}

export const FEEDBACK_TIERS = Object.keys(SETS);
