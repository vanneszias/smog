/** One day in milliseconds. */
export const DAY_MS = 86_400_000;

/** `ms` (epoch milliseconds) plus `days` whole days. */
export function addDays(ms: number, days: number): number {
  return ms + days * DAY_MS;
}
