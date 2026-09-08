/**
 * The academy's course ladder, in order: Beginner, Intermediate, Semi Pro, Pro,
 * Masters.
 *
 * This is the coarse tier a course, classroom, batch or homework template sits
 * in - deliberately separate from `User.studentLevel`, which is an assessment of
 * a player (absolute beginner through federated) and drives the puzzle trainer
 * rating bands and the demo flow. The two look alike and mean different things.
 *
 * Every schema, dropdown and label reads the ladder from here, so adding a tier
 * is one edit rather than a hunt through fifteen hardcoded option lists.
 */

/** The live ladder, in the order it should be offered. */
export const COURSE_TIERS = ["beginner", "intermediate", "semi_pro", "pro", "masters"] as const;

/**
 * Retired tiers. They stay valid because documents saved under them still exist -
 * dropping a value from the enum would make those rows fail validation on their
 * next save. They are offered last and labelled as legacy.
 */
export const LEGACY_COURSE_TIERS = ["advanced"] as const;

/** "mixed" is a course that spans tiers; a classroom folds it down to beginner. */
export const MIXED_TIER = "mixed";

export type CourseTier = (typeof COURSE_TIERS)[number] | (typeof LEGACY_COURSE_TIERS)[number];

/** Valid on a batch or classroom, which never span tiers. */
export const COURSE_TIER_VALUES: string[] = [...COURSE_TIERS, ...LEGACY_COURSE_TIERS];

/** Valid on a course or homework template, which can. */
export const COURSE_TIER_VALUES_WITH_MIXED: string[] = [...COURSE_TIER_VALUES, MIXED_TIER];

export const COURSE_TIER_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  semi_pro: "Semi Pro",
  pro: "Pro",
  masters: "Masters",
  advanced: "Advanced",
  mixed: "Mixed",
};

function optionFor(value: string) {
  const label = COURSE_TIER_LABELS[value] || value;
  // Marked only where someone is picking a tier, so a retired one is obvious in
  // the dropdown without the marker leaking into charts and report columns.
  return { value, label: (LEGACY_COURSE_TIERS as readonly string[]).includes(value) ? `${label} (legacy)` : label };
}

/** Options for a plain <select>, in ladder order with legacy tiers last. */
export const COURSE_TIER_OPTIONS = COURSE_TIER_VALUES.map(optionFor);

export const COURSE_TIER_OPTIONS_WITH_MIXED = COURSE_TIER_VALUES_WITH_MIXED.map(optionFor);

export function isCourseTier(value: any): boolean {
  return COURSE_TIER_VALUES.includes(String(value || ""));
}

export function isCourseTierOrMixed(value: any): boolean {
  return COURSE_TIER_VALUES_WITH_MIXED.includes(String(value || ""));
}

export function courseTierLabel(value?: string | null) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return "";
  return COURSE_TIER_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

/** A classroom never stores "mixed" - a mixed course lands its classes at beginner. */
export function classroomTier(value: any): string {
  const tier = String(value || "").trim();
  if (tier === MIXED_TIER) return "beginner";
  return isCourseTier(tier) ? tier : "beginner";
}

/** Zod's enum() needs a non-empty literal tuple; the values are validated above. */
export const COURSE_TIER_ENUM = COURSE_TIER_VALUES as [string, ...string[]];
export const COURSE_TIER_ENUM_WITH_MIXED = COURSE_TIER_VALUES_WITH_MIXED as [string, ...string[]];
export const COURSE_TIER_ENUM_WITH_MIXED_AND_BLANK = [...COURSE_TIER_VALUES_WITH_MIXED, ""] as unknown as [string, ...string[]];
