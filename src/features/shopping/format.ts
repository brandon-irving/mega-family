// Day counts for the Screen 15 cards. Prices use the one shared formatter, `formatPriceCents` (shared/config/shopping),
// so a card and the push for the same price read the same ("$28").
/** Whole days from `today` until `date` (both "YYYY-MM-DD" in the family's timezone), never negative. */
export function daysUntil(date: string, today: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.max(0, Math.round((ms(date) - ms(today)) / 86_400_000));
}
