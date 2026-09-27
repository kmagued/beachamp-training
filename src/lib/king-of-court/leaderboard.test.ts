import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStandings, groupScores, playerBreakdown, type ScoreRow } from "./leaderboard";

/** A score row; defaults to group g1, session s1 at 18:00 */
function row(player_id: string, session_date: string, points: number, extra: Partial<ScoreRow> = {}): ScoreRow {
  return { player_id, group_id: "g1", schedule_session_id: "s1", session_date, start_time: "18:00:00", points, ...extra };
}

test("buildStandings: totals, sessions played (0-point sessions count) and best", () => {
  const standings = buildStandings([
    row("a", "2026-09-03", 8),
    row("a", "2026-09-07", 12),
    row("a", "2026-09-10", 0),
    row("b", "2026-09-03", 5),
  ]);
  assert.deepEqual(
    standings.map((s) => [s.player_id, s.total, s.sessions, s.best, s.rank, s.isWinner]),
    [["a", 20, 3, 12, 1, true], ["b", 5, 1, 5, 2, false]]
  );
});

test("buildStandings: level on points, fewer sessions ranks higher", () => {
  // m: 38 points in 6 sessions; n: 38 points in 7 sessions
  const scores = [
    ...[7, 7, 6, 6, 6, 6].map((p, i) => row("m", `2026-09-0${i + 1}`, p)),
    ...[6, 6, 5, 5, 6, 5, 5].map((p, i) => row("n", `2026-09-0${i + 1}`, p)),
  ];
  assert.deepEqual(
    buildStandings(scores).map((s) => [s.player_id, s.total, s.sessions, s.rank, s.isWinner]),
    [["m", 38, 6, 1, true], ["n", 38, 7, 2, false]]
  );
});

test("buildStandings: level on points and sessions share the rank, and the next rank skips (1, 1, 3)", () => {
  const standings = buildStandings([row("a", "2026-09-03", 10), row("b", "2026-09-03", 10), row("c", "2026-09-03", 4)]);
  assert.deepEqual(
    standings.map((s) => [s.player_id, s.rank, s.isWinner]),
    [["a", 1, true], ["b", 1, true], ["c", 3, false]]
  );
});

test("buildStandings: no winner when the top total is 0", () => {
  const standings = buildStandings([row("a", "2026-09-03", 0), row("b", "2026-09-03", 0)]);
  assert.deepEqual(standings.map((s) => [s.rank, s.isWinner]), [[1, false], [1, false]]);
});

test("buildStandings: no scores, no standings", () => {
  assert.deepEqual(buildStandings([]), []);
});

test("groupScores: a player scored in two groups counts separately on each board", () => {
  const byGroup = groupScores([
    row("a", "2026-09-03", 8),
    row("a", "2026-09-20", 5, { group_id: "g2", schedule_session_id: "s9" }),
    row("b", "2026-09-03", 4),
  ]);
  assert.deepEqual(buildStandings(byGroup.get("g1")!).map((s) => [s.player_id, s.total]), [["a", 8], ["b", 4]]);
  assert.deepEqual(buildStandings(byGroup.get("g2")!).map((s) => [s.player_id, s.total]), [["a", 5]]);
  assert.equal(byGroup.get("g3"), undefined);
});

test("playerBreakdown: oldest first, with the player's place and field size each time", () => {
  const scores = [
    row("a", "2026-09-07", 12), row("b", "2026-09-07", 9), row("c", "2026-09-07", 12), // a shares 1st of 3
    row("a", "2026-09-03", 8), row("b", "2026-09-03", 10), // a is 2nd of 2
    row("b", "2026-09-10", 6), // a didn't play
  ];
  assert.deepEqual(playerBreakdown(scores, "a"), [
    { schedule_session_id: "s1", session_date: "2026-09-03", start_time: "18:00:00", points: 8, place: 2, fieldSize: 2 },
    { schedule_session_id: "s1", session_date: "2026-09-07", start_time: "18:00:00", points: 12, place: 1, fieldSize: 3 },
  ]);
});

test("playerBreakdown: two sessions on the same day are separate occurrences, ordered by time", () => {
  const scores = [
    row("a", "2026-09-03", 5, { schedule_session_id: "late", start_time: "20:00:00" }),
    row("b", "2026-09-03", 9, { schedule_session_id: "late", start_time: "20:00:00" }),
    row("a", "2026-09-03", 7, { schedule_session_id: "early", start_time: "18:00:00" }),
  ];
  assert.deepEqual(
    playerBreakdown(scores, "a").map((r) => [r.schedule_session_id, r.points, r.place, r.fieldSize]),
    [["early", 7, 1, 1], ["late", 5, 2, 2]]
  );
});

test("playerBreakdown: a player with no scores has no rows", () => {
  assert.deepEqual(playerBreakdown([row("b", "2026-09-03", 4)], "a"), []);
});
