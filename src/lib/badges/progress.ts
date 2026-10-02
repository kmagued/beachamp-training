// How close a player is to each badge's next tier, for the dashboard.

import type { Measure } from "./config";
import type { PlayerBadgeView, PlayerTierView } from "./load";
import { progressFraction } from "./words";

const more = (n: number, word: string) => `${n} more ${word}${n === 1 ? "" : "s"}`;

/**
 * "16 more sessions", "2 more in a row", "36 more points in a month", "1 more win". A
 * streak counts from the run as it stands now. If the figure is already past the tier
 * (its badges haven't been re-checked yet) it reads "Almost there".
 */
export function remainingLabel(measure: Measure, value: number, currentRun: number | null, threshold: number): string {
  const figure = measure === "attendance_streak" ? currentRun ?? 0 : value;
  const left = threshold - figure;
  if (left <= 0) return "Almost there";
  switch (measure) {
    case "sessions_attended":
      return more(left, "session");
    case "attendance_streak":
      return `${left} more in a row`;
    case "month_points":
      return `${left} more points in a month`;
    case "monthly_wins":
      return more(left, "win");
  }
}

export interface BadgeProgressEntry {
  badge: PlayerBadgeView;
  /** The lowest tier not yet earned, or null when every tier is */
  next: PlayerTierView | null;
  /** 0 to 1 toward the next tier; 1 when every tier is earned */
  fraction: number;
}

/** Every badge with its next tier, the closest first; badges with every tier earned last */
export function badgeProgress(badges: PlayerBadgeView[]): BadgeProgressEntry[] {
  const entries = badges.map((badge) => {
    const next = badge.tiers.find((t) => t.earned_on === null) ?? null;
    const fraction = next ? progressFraction(badge.measure, badge.value, badge.current_run, next.threshold) : 1;
    return { badge, next, fraction };
  });
  return entries.sort((a, b) => {
    if (!a.next !== !b.next) return a.next ? -1 : 1;
    return b.fraction - a.fraction;
  });
}
