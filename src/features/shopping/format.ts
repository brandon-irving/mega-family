// Money for the Screen 15 cards: prices arrive in minor units (cents) with an ISO currency (CONTRACT v0.16
// `Product`), and are shown in the store's own currency, always with two decimals ("$34.99", "$28.00").
export function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
  } catch {
    // An unknown currency code: the number and the code, never a guessed symbol.
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Whole days from `today` until `date` (both "YYYY-MM-DD" in the family's timezone), never negative. */
export function daysUntil(date: string, today: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.max(0, Math.round((ms(date) - ms(today)) / 86_400_000));
}
