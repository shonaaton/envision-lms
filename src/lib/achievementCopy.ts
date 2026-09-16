import type { AchievementRecord } from "@/lib/achievementData";

/**
 * Alt text and captions for achievement photos.
 *
 * Shared by the landing page gallery and the results strip on the course
 * pages, so a photo is described the same way wherever it appears and the
 * wording only has to be fixed in one place.
 */

/**
 * Seeded and admin-entered rows both use the literal string "Not specified"
 * where a field is unknown, so alt text and captions have to drop those rather
 * than print them.
 */
export function isKnownField(value?: string) {
  return Boolean(value) && value !== "Not specified";
}

/**
 * Rating rows carry a placeholder tournament name such as "FIDE Rating", so
 * naming the event too would read as "1602 FIDE rating at age 8 at FIDE
 * Rating". Those rows describe themselves through the result alone.
 */
export function isRatingOnly(item: AchievementRecord) {
  return item.achievementLevel === "Rating" || /^FIDE\b.*Rating$/i.test(item.tournamentName);
}

/** Alt text describing what the photo actually shows, built from the record. */
export function achievementAlt(item: AchievementRecord) {
  // A few rows are recorded under a placeholder name such as "Envision
  // Student", where the appositive would read "Envision Student, Envision
  // Chess Academy student".
  const named = /envision/i.test(item.studentName) ? item.studentName : `${item.studentName}, Envision Chess Academy student`;
  const lead = `${named}, ${item.result}`;
  if (isRatingOnly(item)) return lead;
  const where = isKnownField(item.tournamentLocation) ? ` in ${item.tournamentLocation}` : "";
  return `${lead} at ${item.tournamentName}${where}`;
}

/** The visible caption under a photo: event, year and level. */
export function achievementCaption(item: AchievementRecord) {
  const level = item.achievementLevel === "Other" ? null : `${item.achievementLevel} level`;
  const parts = isRatingOnly(item)
    ? ["FIDE rating", isKnownField(item.year) ? item.year : null]
    : [item.tournamentName, isKnownField(item.year) ? item.year : null, level];
  return parts.filter(Boolean).join(" · ");
}
