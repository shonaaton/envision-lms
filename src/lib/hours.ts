/** Minutes as hours to two decimals, trailing zeros dropped: 45 -> "0.75", 135 -> "2.25", 60 -> "1". */
export function formatHours(minutes: number) {
  const hours = Math.round(((Number(minutes) || 0) / 60) * 100) / 100;
  return String(hours);
}
