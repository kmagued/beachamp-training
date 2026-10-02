import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeProgress, remainingLabel } from "./progress";
import type { Measure } from "./config";
import type { PlayerBadgeView } from "./load";

const badge = (
  id: string,
  measure: Measure,
  value: number,
  current_run: number | null,
  tiers: [number, string | null][]
): PlayerBadgeView => ({
  id,
  name: id,
  icon: "star",
  measure,
  created_at: "2026-10-02T00:00:00Z",
  tiers: tiers.map(([threshold, earned_on], i) => ({
    id: `${id}-${i + 1}`,
    tier: (i + 1) as 1 | 2 | 3 | 4 | 5,
    threshold,
    credits: 0,
    earned_on,
    credits_paid: earned_on ? 0 : null,
  })),
  earned_on: null,
  value,
  current_run,
});

test("remainingLabel: how much is left, in the measure's words", () => {
  assert.equal(remainingLabel("sessions_attended", 34, null, 50), "16 more sessions");
  assert.equal(remainingLabel("sessions_attended", 49, null, 50), "1 more session");
  assert.equal(remainingLabel("attendance_streak", 9, 6, 8), "2 more in a row");
  assert.equal(remainingLabel("attendance_streak", 9, null, 8), "8 more in a row");
  assert.equal(remainingLabel("month_points", 64, null, 100), "36 more points in a month");
  assert.equal(remainingLabel("monthly_wins", 1, null, 3), "2 more wins");
  assert.equal(remainingLabel("monthly_wins", 0, null, 1), "1 more win");
});

test("remainingLabel: a figure already past a locked tier (badges not yet re-checked) reads as nearly there", () => {
  assert.equal(remainingLabel("sessions_attended", 27, null, 25), "Almost there");
});

test("badgeProgress: every badge's next tier, closest first; finished badges last", () => {
  const entries = badgeProgress([
    badge("regular", "sessions_attended", 34, null, [
      [10, "2026-10-10"],
      [25, "2026-10-20"],
      [50, null],
    ]),
    badge("streak", "attendance_streak", 9, 6, [
      [4, "2026-10-12"],
      [8, null],
    ]),
    badge("champion", "monthly_wins", 1, null, [[1, "2026-11-01"]]),
    badge("century", "month_points", 20, null, [[100, null]]),
  ]);
  assert.deepEqual(
    entries.map((e) => [e.badge.id, e.next?.tier ?? null, e.fraction]),
    [
      ["streak", 2, 0.75],
      ["regular", 3, 0.68],
      ["century", 1, 0.2],
      ["champion", null, 1],
    ]
  );
});

test("badgeProgress: no badges, no entries", () => {
  assert.deepEqual(badgeProgress([]), []);
});
