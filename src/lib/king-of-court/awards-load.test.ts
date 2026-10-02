import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPlayerAwards } from "./awards-load";

/** A stand-in for the player's Supabase client: the awards query resolves to this result */
function stubClient(result: { data: unknown; error: { message: string } | null }) {
  return {
    from: () => ({
      select: () => ({
        eq: async () => result,
      }),
    }),
  };
}

const rows = [
  { id: "w", month: "2026-08", place: 1, points: 96, sessions: 6, created_at: "2026-09-01T10:00:00Z", groups: { name: "Women's Team" } },
  { id: "x", month: "2026-09", place: 2, points: 40, sessions: 4, created_at: "2026-10-01T10:00:00Z", groups: { name: "Mixed" } },
  { id: "y", month: "2026-09", place: 1, points: 142, sessions: 8, created_at: "2026-10-01T10:00:00Z", groups: { name: "Women's Team" } },
  { id: "z", month: "2026-06", place: 2, points: 30, sessions: 3, created_at: "2026-07-02T10:00:00Z", groups: null },
];

test("loadPlayerAwards: newest month first, 1st before 2nd, with the group's name and when it was awarded", async () => {
  const awards = await loadPlayerAwards(stubClient({ data: rows, error: null }), "p1");
  assert.deepEqual(awards, [
    { id: "y", month: "2026-09", place: 1, points: 142, sessions: 8, awarded_at: "2026-10-01T10:00:00Z", group_name: "Women's Team" },
    { id: "x", month: "2026-09", place: 2, points: 40, sessions: 4, awarded_at: "2026-10-01T10:00:00Z", group_name: "Mixed" },
    { id: "w", month: "2026-08", place: 1, points: 96, sessions: 6, awarded_at: "2026-09-01T10:00:00Z", group_name: "Women's Team" },
    { id: "z", month: "2026-06", place: 2, points: 30, sessions: 3, awarded_at: "2026-07-02T10:00:00Z", group_name: "Your group" },
  ]);
});

test("loadPlayerAwards: no awards is an empty list", async () => {
  assert.deepEqual(await loadPlayerAwards(stubClient({ data: [], error: null }), "p1"), []);
  assert.deepEqual(await loadPlayerAwards(stubClient({ data: null, error: null }), "p1"), []);
});

test("loadPlayerAwards: a failed read is thrown, so the Achievements page doesn't show an empty state for it", async () => {
  await assert.rejects(
    loadPlayerAwards(stubClient({ data: null, error: { message: "relation does not exist" } }), "p1"),
    /Could not load your achievements: relation does not exist/
  );
});
