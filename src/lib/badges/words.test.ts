import { test } from "node:test";
import assert from "node:assert/strict";
import {
  badgeDescription,
  badgesDetail,
  creditsDetail,
  creditsEarned,
  deleteBadgeWarning,
  formatBadgeDate,
  formatCredits,
  playersCount,
  progressFraction,
  tierProgress,
  tierRequirement,
} from "./words";

test("badgeDescription: each measure, matching badge_description() in the migration", () => {
  assert.equal(badgeDescription("sessions_attended", 25), "Attended 25 sessions");
  assert.equal(badgeDescription("sessions_attended", 1), "Attended 1 session");
  assert.equal(badgeDescription("attendance_streak", 8), "8 sessions in a row");
  assert.equal(badgeDescription("month_points", 100), "100+ points in one month");
  assert.equal(badgeDescription("monthly_wins", 1), "Won a monthly leaderboard");
  assert.equal(badgeDescription("monthly_wins", 3), "Won 3 monthly leaderboards");
});

test("tierRequirement: the short form on a tier tile", () => {
  assert.equal(tierRequirement("sessions_attended", 25), "25 sessions");
  assert.equal(tierRequirement("sessions_attended", 1), "1 session");
  assert.equal(tierRequirement("attendance_streak", 8), "8 in a row");
  assert.equal(tierRequirement("month_points", 100), "100+ points");
  assert.equal(tierRequirement("monthly_wins", 1), "1 win");
  assert.equal(tierRequirement("monthly_wins", 3), "3 wins");
});

test("tierProgress: how far a player is toward the next tier; a streak shows the run now", () => {
  assert.equal(tierProgress("sessions_attended", 34, null, 50), "34 / 50");
  assert.equal(tierProgress("attendance_streak", 5, 3, 8), "Run 3 / 8");
  assert.equal(tierProgress("attendance_streak", 0, null, 8), "Run 0 / 8");
  assert.equal(tierProgress("month_points", 64, null, 100), "64 / 100");
  assert.equal(tierProgress("monthly_wins", 1, null, 3), "1 / 3");
});

test("progressFraction: the bar's fill, capped at full; a streak follows the current run", () => {
  assert.equal(progressFraction("sessions_attended", 12, null, 24), 0.5);
  assert.equal(progressFraction("sessions_attended", 30, null, 25), 1);
  assert.equal(progressFraction("attendance_streak", 6, 2, 8), 0.25);
  assert.equal(progressFraction("attendance_streak", 6, null, 8), 0);
  assert.equal(progressFraction("monthly_wins", 0, null, 1), 0);
});

test("formatCredits: singular, plural, zero and a negative balance", () => {
  assert.equal(formatCredits(1), "1 credit");
  assert.equal(formatCredits(320), "320 credits");
  assert.equal(formatCredits(0), "0 credits");
  assert.equal(formatCredits(-1), "-1 credit");
  assert.equal(formatCredits(-50), "-50 credits");
});

test("creditsEarned: what a tier pays, or nothing for a 0-credit tier", () => {
  assert.equal(creditsEarned(50), "+50 credits");
  assert.equal(creditsEarned(1), "+1 credit");
  assert.equal(creditsEarned(0), null);
});

test("formatBadgeDate: short, medium and long, never shifted by the viewer's timezone", () => {
  assert.equal(formatBadgeDate("2026-09-25", "short"), "25 Sep");
  assert.equal(formatBadgeDate("2026-10-02", "medium"), "2 Oct 2026");
  assert.equal(formatBadgeDate("2026-09-25", "long"), "25 September 2026");
  assert.equal(formatBadgeDate("2026-01-01", "short"), "1 Jan");
});

test("playersCount: how many players hold a tier, on the admin page", () => {
  assert.equal(playersCount(0), "Nobody yet");
  assert.equal(playersCount(1), "1 player");
  assert.equal(playersCount(12), "12 players");
});

test("deleteBadgeWarning: who loses it, and the credits actually paid that go with it", () => {
  assert.equal(
    deleteBadgeWarning("Court Regular", 12, 840),
    "12 players hold Court Regular. Deleting it takes it away from them, with the 840 credits it gave them."
  );
  assert.equal(
    deleteBadgeWarning("Court Regular", 1, 1),
    "1 player holds Court Regular. Deleting it takes it away from them, with the 1 credit it gave them."
  );
  assert.equal(deleteBadgeWarning("Iron Streak", 3, 0), "3 players hold Iron Streak. Deleting it takes it away from them.");
  assert.equal(deleteBadgeWarning("Court Regular", 0, 0), "Nobody holds Court Regular yet.");
});

test("badgesDetail: the Badges earned tile's second line, counting tiers", () => {
  assert.equal(badgesDetail(7, 18), "11 still to unlock");
  assert.equal(badgesDetail(17, 18), "1 still to unlock");
  assert.equal(badgesDetail(18, 18), "All unlocked");
  assert.equal(badgesDetail(0, 0), "None yet");
});

test("creditsDetail: the Beachamp Credits tile's second line, counting tiers that paid", () => {
  assert.equal(creditsDetail(3), "From 3 badges");
  assert.equal(creditsDetail(1), "From 1 badge");
  assert.equal(creditsDetail(0), "Earn badges to collect them");
});
