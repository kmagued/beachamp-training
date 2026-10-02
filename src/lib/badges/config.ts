// What a badge can be made of. The badges table's CHECK constraints allow exactly these
// (supabase/migrations/20261002000000_badges_and_credits.sql), so keep the two in step.

export type Measure = "sessions_attended" | "attendance_streak" | "month_points" | "monthly_wins";

export const MEASURE_ORDER: Measure[] = ["sessions_attended", "attendance_streak", "month_points", "monthly_wins"];

export const MEASURES: Record<Measure, { label: string; numberLabel: string; min: number }> = {
  sessions_attended: { label: "Sessions attended", numberLabel: "Sessions", min: 1 },
  // A streak of 1 is the same as attending once
  attendance_streak: { label: "Attendance streak", numberLabel: "Sessions in a row", min: 2 },
  month_points: { label: "Points in one month", numberLabel: "Points", min: 1 },
  monthly_wins: { label: "Monthly wins", numberLabel: "Wins", min: 1 },
};

/** Icon keys, in the order the admin's picker shows them */
export const BADGE_ICONS = [
  "shield-check",
  "star",
  "flame",
  "zap",
  "trophy",
  "crown",
  "medal",
  "award",
  "target",
  "sparkles",
  "rocket",
  "volleyball",
] as const;

export type BadgeIconKey = (typeof BADGE_ICONS)[number];

export const BADGE_LIMITS = { nameMax: 40, thresholdMax: 1000, creditsMax: 10000 } as const;

export function isMeasure(value: string): value is Measure {
  return (MEASURE_ORDER as string[]).includes(value);
}

export function isBadgeIcon(value: string): value is BadgeIconKey {
  return (BADGE_ICONS as readonly string[]).includes(value);
}

export type TierNumber = 1 | 2 | 3 | 4 | 5;

export const MAX_TIERS = 5;

/**
 * Bronze to Diamond. tier_name() in the migration uses the same names. Colours: the
 * medallion's gradient, and a light shade for text on the navy share card.
 */
export const TIERS: Record<TierNumber, { key: string; label: string; from: string; to: string; light: string }> = {
  1: { key: "bronze", label: "Bronze", from: "#E7A774", to: "#A35F2C", light: "#EDB98C" },
  2: { key: "silver", label: "Silver", from: "#EEF1F4", to: "#98A2AE", light: "#D5DBE2" },
  3: { key: "gold", label: "Gold", from: "#F9C677", to: "#E8901A", light: "#F7AC40" },
  4: { key: "platinum", label: "Platinum", from: "#E3EEF1", to: "#7E9FAA", light: "#C9DCE2" },
  5: { key: "diamond", label: "Diamond", from: "#B9F3FF", to: "#1FA9CF", light: "#8EE6F8" },
};

export function isTierNumber(n: number): n is TierNumber {
  return Number.isInteger(n) && n >= 1 && n <= MAX_TIERS;
}
