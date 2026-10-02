// The words that go with a badge, for the admin page, the Achievements page and the
// share card. Pure functions, so every screen says the same thing.

import type { Measure } from "./config";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const plural = (n: number, word: string) => `${n} ${word}${Math.abs(n) === 1 ? "" : "s"}`;

/**
 * "Attended 25 sessions", "8 sessions in a row", "100+ points in one month", "Won a
 * monthly leaderboard". badge_description() in the migration writes the same sentences
 * into notifications.
 */
export function badgeDescription(measure: Measure, threshold: number): string {
  switch (measure) {
    case "sessions_attended":
      return `Attended ${plural(threshold, "session")}`;
    case "attendance_streak":
      return `${threshold} sessions in a row`;
    case "month_points":
      return `${threshold}+ points in one month`;
    case "monthly_wins":
      return threshold === 1 ? "Won a monthly leaderboard" : `Won ${threshold} monthly leaderboards`;
  }
}

/**
 * How far a player is toward a locked badge. value is the player's figure for the measure;
 * currentRun is the streak as it stands now, which is what a player can still build on.
 */
export function progressLabel(measure: Measure, value: number, currentRun: number | null, threshold: number): string {
  switch (measure) {
    case "sessions_attended":
      return `${value} of ${plural(threshold, "session")}`;
    case "attendance_streak":
      return `Current run: ${currentRun ?? 0} of ${threshold}`;
    case "month_points":
      return `Best month: ${value} of ${threshold} points`;
    case "monthly_wins":
      return `${value} of ${plural(threshold, "win")}`;
  }
}

/** The progress bar's fill, from 0 to 1 */
export function progressFraction(measure: Measure, value: number, currentRun: number | null, threshold: number): number {
  const figure = measure === "attendance_streak" ? currentRun ?? 0 : value;
  return Math.max(0, Math.min(1, figure / threshold));
}

/** "1 credit", "320 credits", "-50 credits" */
export function formatCredits(n: number): string {
  return plural(n, "credit");
}

/** "+50 credits" for a badge that pays some, or null for one that pays none */
export function creditsEarned(credits: number): string | null {
  return credits > 0 ? `+${formatCredits(credits)}` : null;
}

/**
 * "2026-09-25" → "25 Sep" (short), "25 Sep 2026" (medium) or "25 September 2026" (long).
 * Read in UTC so the viewer's timezone can't shift the day.
 */
export function formatBadgeDate(date: string, style: "short" | "medium" | "long"): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  if (style === "long") return `${day} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const short = `${day} ${MONTHS_SHORT[d.getUTCMonth()]}`;
  return style === "medium" ? `${short} ${d.getUTCFullYear()}` : short;
}
