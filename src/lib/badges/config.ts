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
