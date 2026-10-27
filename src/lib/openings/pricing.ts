/**
 * What one opening costs. Amounts are in paise, like everywhere else in the LMS.
 * GST is charged on top (the "excluded" GST mode), so ₹49 becomes ₹57.82.
 */
export const OPENING_PRICE_PAISE = 4900;
export const OPENING_GST_PERCENT = 18;
export const OPENING_GST_PAISE = Math.round((OPENING_PRICE_PAISE * OPENING_GST_PERCENT) / 100);
export const OPENING_TOTAL_PAISE = OPENING_PRICE_PAISE + OPENING_GST_PAISE;

/**
 * Whether openings can be bought yet. While false the public pages are
 * noindex and left out of the sitemap, and every Unlock button says "opens
 * soon". Flip it when checkout and the students' free picks ship.
 */
export const OPENINGS_ON_SALE = false;

/** Openings an enrolled academy student may unlock without paying. */
export const STUDENT_FREE_OPENINGS = 3;

export function rupees(paise: number) {
  const value = paise / 100;
  return `₹${Number.isInteger(value) ? value : value.toFixed(2)}`;
}
