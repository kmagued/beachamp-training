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

/** The short form on a tier tile, under the badge's measure: "25 sessions", "8 in a row" */
export function tierRequirement(measure: Measure, threshold: number): string {
  switch (measure) {
    case "sessions_attended":
      return plural(threshold, "session");
    case "attendance_streak":
      return `${threshold} in a row`;
    case "month_points":
      return `${threshold}+ points`;
    case "monthly_wins":
      return plural(threshold, "win");
  }
}

/**
 * How far a player is toward the next tier: "34 / 50". value is the player's figure for
 * the measure; for a streak it's the run as it stands now, which is what they can build on.
 */
export function tierProgress(measure: Measure, value: number, currentRun: number | null, threshold: number): string {
  return measure === "attendance_streak" ? `Run ${currentRun ?? 0} / ${threshold}` : `${value} / ${threshold}`;
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

/** "+50 credits" for a tier that pays some, or null for one that pays none */
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

/** How many players hold a tier, on the admin page: "Nobody yet", "1 player", "12 players" */
export function playersCount(holders: number): string {
  return holders === 0 ? "Nobody yet" : plural(holders, "player");
}

/**
 * The delete confirmation: who loses the badge, and the credits actually paid for it,
 * which can differ from what its tiers pay now
 */
export function deleteBadgeWarning(name: string, holders: number, creditsPaid: number): string {
  if (holders === 0) return `Nobody holds ${name} yet.`;
  const who = holders === 1 ? "1 player holds" : `${holders} players hold`;
  const withCredits = creditsPaid > 0 ? `, with the ${formatCredits(creditsPaid)} it gave them` : "";
  return `${who} ${name}. Deleting it takes it away from them${withCredits}.`;
}

/** The Badges earned tile, counting tiers: "11 still to unlock", "All unlocked" */
export function badgesDetail(earnedTiers: number, totalTiers: number): string {
  if (totalTiers === 0) return "None yet";
  const left = totalTiers - earnedTiers;
  return left <= 0 ? "All unlocked" : `${left} still to unlock`;
}

/** The Beachamp Credits tile: where the balance came from, counting tiers that paid */
export function creditsDetail(paidTiers: number): string {
  return paidTiers === 0 ? "Earn badges to collect them" : `From ${plural(paidTiers, "badge")}`;
}
