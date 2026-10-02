/**
 * The Achievements page's badge order: earned badges first, the most recently earned at
 * the front; then locked ones in the order the academy created them.
 */
export function sortBadges<T extends { created_at: string; earned_on: string | null }>(badges: T[]): T[] {
  return [...badges].sort((a, b) => {
    if (a.earned_on && b.earned_on) {
      return b.earned_on.localeCompare(a.earned_on) || a.created_at.localeCompare(b.created_at);
    }
    if (a.earned_on) return -1;
    if (b.earned_on) return 1;
    return a.created_at.localeCompare(b.created_at);
  });
}
