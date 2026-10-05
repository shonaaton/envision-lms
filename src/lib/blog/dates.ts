const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * "2026-10-05" -> "5 October 2026". Formatted by hand rather than through
 * `Intl`, because the production Node's ICU data has disagreed with local
 * builds before, and a static page must render the same date everywhere.
 */
export function formatPostDate(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
