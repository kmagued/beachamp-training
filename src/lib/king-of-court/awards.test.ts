import { test } from "node:test";
import assert from "node:assert/strict";
import {
  awardNotification,
  awardSummary,
  canCloseMonth,
  closedMonthMessage,
  groupAwardSummary,
  monthAwards,
  placeLabel,
  sortAwards,
  type Award,
} from "./awards";
import type { ScoreRow } from "./leaderboard";

/** A score row; defaults to group g1, session s1 at 18:00 */
function row(player_id: string, session_date: string, points: number, extra: Partial<ScoreRow> = {}): ScoreRow {
  return { player_id, group_id: "g1", schedule_session_id: "s1", session_date, start_time: "18:00:00", points, ...extra };
}

test("monthAwards: a 1st and a 2nd, with their points and sessions; 3rd gets nothing", () => {
  const awards = monthAwards([
    row("a", "2026-09-03", 8),
    row("a", "2026-09-07", 12),
    row("b", "2026-09-03", 5),
    row("c", "2026-09-03", 2),
  ]);
  assert.deepEqual(awards, [
    { group_id: "g1", player_id: "a", place: 1, points: 20, sessions: 2 },
    { group_id: "g1", player_id: "b", place: 2, points: 5, sessions: 1 },
  ]);
});

test("monthAwards: a tie for 1st (1, 1, 3) gives two 1st places and no 2nd", () => {
  const awards = monthAwards([row("a", "2026-09-03", 10), row("b", "2026-09-03", 10), row("c", "2026-09-03", 4)]);
  assert.deepEqual(awards.map((a) => [a.player_id, a.place]), [["a", 1], ["b", 1]]);
});

test("monthAwards: a tie for 2nd (1, 2, 2) gives three awards", () => {
  const awards = monthAwards([row("a", "2026-09-03", 10), row("b", "2026-09-03", 6), row("c", "2026-09-03", 6)]);
  assert.deepEqual(awards.map((a) => [a.player_id, a.place]), [["a", 1], ["b", 2], ["c", 2]]);
});

test("monthAwards: level on points, the player with fewer sessions is 1st and the other 2nd", () => {
  const awards = monthAwards([
    row("m", "2026-09-03", 12),
    row("n", "2026-09-03", 6),
    row("n", "2026-09-07", 6),
  ]);
  assert.deepEqual(awards.map((a) => [a.player_id, a.place, a.points, a.sessions]), [["m", 1, 12, 1], ["n", 2, 12, 2]]);
});

test("monthAwards: a player on 0 points is never awarded, even when ranked 2nd", () => {
  const awards = monthAwards([row("a", "2026-09-03", 5), row("b", "2026-09-03", 0)]);
  assert.deepEqual(awards.map((a) => [a.player_id, a.place]), [["a", 1]]);
});

test("monthAwards: a group where everyone scored 0 gets no awards", () => {
  assert.deepEqual(monthAwards([row("a", "2026-09-03", 0), row("b", "2026-09-03", 0)]), []);
});

test("monthAwards: groups are awarded independently, and a player can be awarded in both", () => {
  const awards = monthAwards([
    row("a", "2026-09-03", 8),
    row("b", "2026-09-03", 4),
    row("a", "2026-09-04", 3, { group_id: "g2", schedule_session_id: "s9" }),
    row("c", "2026-09-04", 9, { group_id: "g2", schedule_session_id: "s9" }),
  ]);
  assert.deepEqual(awards.map((a) => [a.group_id, a.player_id, a.place]), [
    ["g1", "a", 1],
    ["g1", "b", 2],
    ["g2", "c", 1],
    ["g2", "a", 2],
  ]);
});

test("monthAwards: no scores, no awards", () => {
  assert.deepEqual(monthAwards([]), []);
});

test("canCloseMonth: a past month and the current month can be closed, a future month cannot", () => {
  assert.equal(canCloseMonth("2026-08", "2026-09"), true);
  assert.equal(canCloseMonth("2026-09", "2026-09"), true);
  assert.equal(canCloseMonth("2026-10", "2026-09"), false);
});

test("canCloseMonth: across a year boundary", () => {
  assert.equal(canCloseMonth("2026-12", "2027-01"), true);
  assert.equal(canCloseMonth("2027-01", "2026-12"), false);
});

test("placeLabel", () => {
  assert.equal(placeLabel(1), "1st place");
  assert.equal(placeLabel(2), "2nd place");
});

test("awardSummary: plural and singular", () => {
  assert.equal(awardSummary(142, 8), "142 points from 8 sessions");
  assert.equal(awardSummary(1, 1), "1 point from 1 session");
});

test("groupAwardSummary: one line per place, co-winners joined, null where nobody placed", () => {
  const awards: Award[] = [
    { group_id: "g1", player_id: "a", place: 1, points: 142, sessions: 8 },
    { group_id: "g1", player_id: "b", place: 1, points: 142, sessions: 8 },
    { group_id: "g1", player_id: "c", place: 2, points: 118, sessions: 7 },
    { group_id: "g2", player_id: "d", place: 1, points: 9, sessions: 1 },
  ];
  const names: Record<string, string> = { a: "Ali A", b: "Bea B", c: "Cy C", d: "Dee D" };
  const nameOf = (id: string) => names[id];

  assert.deepEqual(groupAwardSummary(awards, "g1", nameOf), {
    first: "1st: Ali A & Bea B (142 pts)",
    second: "2nd: Cy C (118 pts)",
  });
  assert.deepEqual(groupAwardSummary(awards, "g2", nameOf), { first: "1st: Dee D (9 pts)", second: null });
  assert.deepEqual(groupAwardSummary(awards, "g3", nameOf), { first: null, second: null });
});

test("awardNotification: 1st place, and a group name that already has an apostrophe", () => {
  assert.deepEqual(
    awardNotification({ place: 1, groupName: "Women's Team", month: "2026-09", points: 142, sessions: 8 }),
    {
      title: "You won the Women's Team King of Court for September 2026",
      body: "142 points from 8 sessions.",
    }
  );
});

test("awardNotification: 2nd place, a group name ending in s, and the singular", () => {
  assert.deepEqual(
    awardNotification({ place: 2, groupName: "Juniors", month: "2027-01", points: 1, sessions: 1 }),
    {
      title: "You finished 2nd in the Juniors King of Court for January 2027",
      body: "1 point from 1 session.",
    }
  );
});

test("closedMonthMessage: the same sentence the database trigger raises", () => {
  assert.equal(
    closedMonthMessage("2026-09"),
    "The September 2026 leaderboard is closed, and this would change its scores. An admin can reopen it from the Leaderboard."
  );
});

test("sortAwards: newest month first, then 1st before 2nd, then by group name; the input is left alone", () => {
  const input = [
    { id: "w", month: "2026-08", place: 1 as const, group_name: "Group A" },
    { id: "x", month: "2026-09", place: 2 as const, group_name: "Group A" },
    { id: "y", month: "2026-09", place: 1 as const, group_name: "Group B" },
    { id: "z", month: "2026-09", place: 1 as const, group_name: "Group A" },
  ];
  assert.deepEqual(sortAwards(input).map((a) => a.id), ["z", "y", "x", "w"]);
  assert.deepEqual(input.map((a) => a.id), ["w", "x", "y", "z"]);
});
