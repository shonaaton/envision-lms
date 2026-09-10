/**
 * The graded scales a coach rates a demo student on.
 *
 * Free-text "playing strength" was unrankable: sales could not sort ten leads
 * by it, and two coaches never described the same student the same way. These
 * are fixed ladders instead - same rungs for every coach, every demo - so an
 * assessment can be read at a glance and compared across students.
 *
 * Each option carries a `hint` because the rung names alone ("developing",
 * "proficient") mean whatever the coach reading them thinks they mean; the hint
 * is the shared definition, shown next to the dropdown.
 *
 * Values are stored, labels are not. Renaming a label is free; changing a value
 * orphans every assessment saved under the old one, so add rather than rename.
 */

export type ScaleOption = { value: string; label: string; hint: string };
export type AssessmentScale = { key: string; label: string; options: ScaleOption[] };

/** How far ahead the student can see concretely. */
export const CALCULATION_POWER: ScaleOption[] = [
  { value: "2_moves", label: "2 moves", hint: "Sees the immediate reply" },
  { value: "3_moves", label: "3 moves", hint: "Sees a short forcing line" },
  { value: "4_moves", label: "4 moves", hint: "Calculates a full combination" },
  { value: "5_plus_moves", label: "5 moves or more", hint: "Calculates deep, branching lines" },
];

export const TACTICAL_STRENGTH: ScaleOption[] = [
  { value: "unaware", label: "1 - Unaware", hint: "No tactical vocabulary yet" },
  { value: "emerging", label: "2 - Emerging", hint: "Spots hanging pieces and simple captures" },
  { value: "developing", label: "3 - Developing", hint: "Knows fork, pin and skewer by name" },
  { value: "proficient", label: "4 - Proficient", hint: "Finds two-move combinations reliably" },
  { value: "advanced", label: "5 - Advanced", hint: "Finds deep, multi-motif combinations" },
];

export const ENDGAME_KNOWLEDGE: ScaleOption[] = [
  { value: "none", label: "1 - None", hint: "Cannot finish a won position" },
  { value: "basic", label: "2 - Basic", hint: "Mates with king and queen, king and rook" },
  { value: "developing", label: "3 - Developing", hint: "Opposition and simple pawn endings" },
  { value: "proficient", label: "4 - Proficient", hint: "Lucena, Philidor and rook endings" },
  { value: "advanced", label: "5 - Advanced", hint: "Theoretical and complex endgames" },
];

export const POSITIONAL_SENSE: ScaleOption[] = [
  { value: "none", label: "1 - None", hint: "Plays move to move, no plan" },
  { value: "basic", label: "2 - Basic", hint: "Follows opening principles" },
  { value: "developing", label: "3 - Developing", hint: "Reads pawn structure and weak squares" },
  { value: "proficient", label: "4 - Proficient", hint: "Forms plans from the position" },
  { value: "advanced", label: "5 - Advanced", hint: "Strong independent strategic judgement" },
];

export const OVERALL_STRENGTH: ScaleOption[] = [
  { value: "absolute_beginner", label: "1 - Absolute Beginner", hint: "New to the board" },
  { value: "beginner", label: "2 - Beginner", hint: "Knows the rules, plays casual games" },
  { value: "intermediate", label: "3 - Intermediate", hint: "Plays a coherent game, some tactics" },
  { value: "advanced", label: "4 - Advanced", hint: "Club standard, competes locally" },
  { value: "expert", label: "5 - Expert", hint: "Tournament standard, rated play" },
];

/** Rendered in this order on the assessment form. */
export const DEMO_ASSESSMENT_SCALES: AssessmentScale[] = [
  { key: "calculationPower", label: "Calculation power", options: CALCULATION_POWER },
  { key: "tacticalStrength", label: "Tactical strength & knowledge", options: TACTICAL_STRENGTH },
  { key: "endgameKnowledge", label: "Endgame knowledge", options: ENDGAME_KNOWLEDGE },
  { key: "positionalSense", label: "Positional sense & middlegame", options: POSITIONAL_SENSE },
  { key: "overallStrength", label: "Overall strength", options: OVERALL_STRENGTH },
];

/** Schema enums allow "" so an unrated scale stays unrated rather than defaulting. */
export function scaleEnum(options: ScaleOption[]): string[] {
  return [...options.map((option) => option.value), ""];
}

export function scaleLabel(options: ScaleOption[], value?: string | null) {
  const key = String(value || "").trim();
  if (!key) return "";
  return options.find((option) => option.value === key)?.label || key.replace(/_/g, " ");
}

/** The three class formats sales can sell a converted demo into. */
export const CLASS_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "group", label: "Group" },
  { value: "individual", label: "Individual" },
  { value: "either", label: "Either works" },
];
