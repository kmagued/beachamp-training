import { test } from "node:test";
import assert from "node:assert/strict";
import {
  badgeDescription,
  creditsEarned,
  deleteBadgeWarning,
  formatBadgeDate,
  formatCredits,
  holdersLabel,
  progressFraction,
  progressLabel,
} from "./words";

test("badgeDescription: each measure, matching badge_description() in the migration", () => {
  assert.equal(badgeDescription("sessions_attended", 25), "Attended 25 sessions");
  assert.equal(badgeDescription("sessions_attended", 1), "Attended 1 session");
  assert.equal(badgeDescription("attendance_streak", 8), "8 sessions in a row");
  assert.equal(badgeDescription("month_points", 100), "100+ points in one month");
  assert.equal(badgeDescription("monthly_wins", 1), "Won a monthly leaderboard");
  assert.equal(badgeDescription("monthly_wins", 3), "Won 3 monthly leaderboards");
});

test("progressLabel: how far a player is toward a locked badge", () => {
  assert.equal(progressLabel("sessions_attended", 12, null, 25), "12 of 25 sessions");
  assert.equal(progressLabel("sessions_attended", 0, null, 1), "0 of 1 session");
  assert.equal(progressLabel("attendance_streak", 5, 3, 8), "Current run: 3 of 8");
  assert.equal(progressLabel("attendance_streak", 0, null, 8), "Current run: 0 of 8");
  assert.equal(progressLabel("month_points", 64, null, 100), "Best month: 64 of 100 points");
  assert.equal(progressLabel("monthly_wins", 1, null, 3), "1 of 3 wins");
  assert.equal(progressLabel("monthly_wins", 0, null, 1), "0 of 1 win");
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

test("creditsEarned: what a badge pays, or nothing for a 0-credit badge", () => {
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

test("holdersLabel: how many players hold a badge, on the admin page", () => {
  assert.equal(holdersLabel(0), "Nobody holds it yet");
  assert.equal(holdersLabel(1), "1 player holds it");
  assert.equal(holdersLabel(12), "12 players hold it");
});

test("deleteBadgeWarning: who loses it, and the credits that go with it", () => {
  assert.equal(
    deleteBadgeWarning("Court Regular", 12, 50),
    "12 players hold Court Regular. Deleting it takes it away from them, with the 50 credits it gave each."
  );
  assert.equal(
    deleteBadgeWarning("Court Regular", 1, 1),
    "1 player holds Court Regular. Deleting it takes it away from them, with the 1 credit it gave each."
  );
  assert.equal(
    deleteBadgeWarning("Iron Streak", 3, 0),
    "3 players hold Iron Streak. Deleting it takes it away from them."
  );
  assert.equal(deleteBadgeWarning("Court Regular", 0, 50), "Nobody holds Court Regular yet.");
});
