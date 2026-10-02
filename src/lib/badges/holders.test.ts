import { test } from "node:test";
import assert from "node:assert/strict";
import { filterHolders, groupHolders, type HeldTierRow } from "./holders";

const row = (
  player_id: string,
  first_name: string | null,
  last_name: string | null,
  tier: 1 | 2 | 3 | 4 | 5,
  earned_on: string,
  paid: number
): HeldTierRow => ({ player_id, first_name, last_name, tier, earned_on, paid });

const rows: HeldTierRow[] = [
  row("p1", "Talia", "Tawfik", 1, "2026-10-12", 20),
  row("p1", "Talia", "Tawfik", 2, "2026-11-03", 50),
  row("p2", "Omar", "Hassan", 1, "2026-10-05", 20),
  row("p3", "Nour", "Adel", 2, "2026-10-20", 50),
  row("p3", "Nour", "Adel", 1, "2026-10-08", 20),
  row("p4", null, null, 1, "2026-10-09", 0),
];

test("groupHolders: one row per player, with their highest tier, when they reached it, and all they were paid", () => {
  const holders = groupHolders(rows);
  assert.deepEqual(
    holders.map((h) => [h.player_id, h.name, h.initials, h.tier, h.since, h.tiers, h.credits_paid]),
    [
      // Silver first, the earlier Silver ahead; then Bronze, the earlier Bronze ahead
      ["p3", "Nour Adel", "NA", 2, "2026-10-20", [1, 2], 70],
      ["p1", "Talia Tawfik", "TT", 2, "2026-11-03", [1, 2], 70],
      ["p2", "Omar Hassan", "OH", 1, "2026-10-05", [1], 20],
      ["p4", "Unnamed player", "?", 1, "2026-10-09", [1], 0],
    ]
  );
});

test("groupHolders: no rows, no holders", () => {
  assert.deepEqual(groupHolders([]), []);
});

test("filterHolders: a tier shows everyone holding it, including those who went higher", () => {
  const holders = groupHolders(rows);
  assert.deepEqual(filterHolders(holders, "all", "").map((h) => h.player_id), ["p3", "p1", "p2", "p4"]);
  assert.deepEqual(filterHolders(holders, 1, "").map((h) => h.player_id), ["p3", "p1", "p2", "p4"]);
  assert.deepEqual(filterHolders(holders, 2, "").map((h) => h.player_id), ["p3", "p1"]);
  assert.deepEqual(filterHolders(holders, 3, ""), []);
});

test("filterHolders: search matches any part of the name, ignoring case and spaces around it", () => {
  const holders = groupHolders(rows);
  assert.deepEqual(filterHolders(holders, "all", "  taw ").map((h) => h.player_id), ["p1"]);
  assert.deepEqual(filterHolders(holders, 2, "omar"), []);
});
