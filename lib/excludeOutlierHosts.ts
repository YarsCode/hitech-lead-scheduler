/**
 * Cal.com round-robin host pool: bench agents whose monthly booking count (from Airtable)
 * is far ahead of the rest, so they are omitted from the hosts array for this event type.
 *
 * Rule: let maxCount = highest count in the pool, runnerUp = highest count strictly below maxCount.
 * If every host shares maxCount (no runner-up), return hosts unchanged.
 * If maxCount - runnerUp > OUTLIER_LEADER_GAP_THRESHOLD (strictly more than 3), remove every
 * host whose count equals maxCount ("the whole leading pack").
 *
 * Examples:
 * - (25, 25, 12) → runnerUp 12, gap 13 > 3 → both 25s removed.
 * - (25, 24, 10) → runnerUp 24, gap 1 → no change.
 * - (25, 25) only → no runner-up → no change.
 */

export const OUTLIER_LEADER_GAP_THRESHOLD = 3;

export type OutlierHostInput = {
  userId: number;
  weight: number;
  dailyLimit?: number | null;
  email?: string | null;
  monthlyBookingCount?: number | null;
};

export function excludeOutlierHostsByMonthlyBookings<T extends OutlierHostInput>(hosts: T[]): T[] {
  if (hosts.length < 2) return hosts;

  const counts = hosts.map((h) => h.monthlyBookingCount ?? 0);
  const maxCount = Math.max(...counts);
  const lowerCounts = counts.filter((c) => c < maxCount);
  if (lowerCounts.length === 0) return hosts;

  const runnerUp = Math.max(...lowerCounts);
  if (maxCount - runnerUp <= OUTLIER_LEADER_GAP_THRESHOLD) return hosts;

  return hosts.filter((h) => (h.monthlyBookingCount ?? 0) < maxCount);
}
