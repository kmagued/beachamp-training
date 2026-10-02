import { test } from "node:test";
import assert from "node:assert/strict";
import { latestAchievements, loadLatestAchievements, loadPlayerAchievements, type PlayerBadgeView } from "./load";
import type { PlayerAward } from "@/lib/king-of-court/awards-load";

type Result = { data?: unknown; error?: { message: string } | null; count?: number | null };

/**
 * A stand-in for the player's Supabase client. Each table's query, however it is chained,
 * resolves to that table's result; rpc("my_badge_progress") resolves to `progress`.
 */
function stubClient(tables: Record<string, Result>, progress: Result = { data: [], error: null }) {
  const query = (result: Result) => {
    const settled = { data: result.data ?? null, error: result.error ?? null, count: result.count ?? null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q,
      eq: () => q,
      order: () => q,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(settled).then(resolve, reject),
    };
    return q;
  };
  return {
    from: (table: string) => query(tables[table] ?? { data: [], error: null }),
    rpc: async () => ({ data: progress.data ?? null, error: progress.error ?? null }),
  };
}

const badgeRows = [
  { id: "regular", name: "Court Regular", icon: "shield-check", measure: "sessions_attended", threshold: 25, credits: 50, created_at: "2026-10-02T09:00:00Z" },
  { id: "streak", name: "Iron Streak", icon: "zap", measure: "attendance_streak", threshold: 8, credits: 0, created_at: "2026-10-02T10:00:00Z" },
  { id: "century", name: "Century Club", icon: "sparkles", measure: "month_points", threshold: 100, credits: 30, created_at: "2026-10-02T11:00:00Z" },
];

const awardRows = [
  { id: "a1", month: "2026-09", place: 1, points: 142, sessions: 8, created_at: "2026-10-01T10:00:00Z", groups: { name: "Women's Team" } },
];

const tables: Record<string, Result> = {
  badges: { data: badgeRows },
  player_badges: { data: [{ badge_id: "century", earned_on: "2026-10-20" }, { badge_id: "regular", earned_on: "2026-11-03" }] },
  credit_transactions: { data: [{ amount: 50 }, { amount: 30 }] },
  attendance: { count: 64 },
  leaderboard_awards: { data: awardRows },
};

const progress: Result = {
  data: [
    { badge_id: "regular", value: 27, current_run: null },
    { badge_id: "streak", value: 5, current_run: 3 },
  ],
};

test("loadPlayerAchievements: awards, badges with what's held and progress, the balance and sessions", async () => {
  const a = await loadPlayerAchievements(stubClient(tables, progress), "p1");

  assert.deepEqual(a.awards.map((w) => w.id), ["a1"]);
  assert.equal(a.creditBalance, 80);
  assert.equal(a.sessionsAttended, 64);
  assert.deepEqual(
    a.badges.map((b) => [b.id, b.earned_on, b.value, b.current_run]),
    [
      ["regular", "2026-11-03", 27, null],
      ["century", "2026-10-20", 0, null],
      ["streak", null, 5, 3],
    ],
    "earned newest first, then locked; a badge with no progress row reads 0"
  );
});

test("loadPlayerAchievements: a failed read is thrown, so the page doesn't show an empty state for it", async () => {
  await assert.rejects(
    loadPlayerAchievements(stubClient({ ...tables, badges: { error: { message: "relation does not exist" } } }, progress), "p1"),
    /Could not load your achievements: relation does not exist/
  );
  await assert.rejects(
    loadPlayerAchievements(stubClient(tables, { error: { message: "function does not exist" } }), "p1"),
    /Could not load your achievements: function does not exist/
  );
});

const award = (id: string, awarded_at: string): PlayerAward => ({
  id, month: "2026-09", place: 1, points: 10, sessions: 2, awarded_at, group_name: "Mixed",
});
const badge = (id: string, earned_on: string | null): PlayerBadgeView => ({
  id, name: id, icon: "star", measure: "sessions_attended", threshold: 5, credits: 0,
  created_at: "2026-10-01T00:00:00Z", earned_on, value: 0, current_run: null,
});

test("latestAchievements: awards and earned badges together, newest first, up to the limit", () => {
  const items = latestAchievements(
    [award("sep", "2026-10-01T10:00:00Z"), award("aug", "2026-09-01T10:00:00Z")],
    [badge("new", "2026-10-15"), badge("locked", null), badge("old", "2026-09-10")],
    3
  );
  assert.deepEqual(items.map((i) => `${i.kind}:${i.id}`), ["badge:new", "award:sep", "badge:old"]);
});

test("loadLatestAchievements: the dashboard's newest three and the balance", async () => {
  const latest = await loadLatestAchievements(stubClient(tables), "p1", 3);
  assert.deepEqual(latest.items.map((i) => `${i.kind}:${i.id}`), ["badge:regular", "badge:century", "award:a1"]);
  assert.equal(latest.creditBalance, 80);
});

test("loadLatestAchievements: if badges can't be read, awards still show and nothing is thrown", async () => {
  const latest = await loadLatestAchievements(
    stubClient({ ...tables, badges: { error: { message: "relation does not exist" } } }),
    "p1",
    3
  );
  assert.deepEqual(latest.items.map((i) => `${i.kind}:${i.id}`), ["award:a1"]);
});

test("loadLatestAchievements: if nothing can be read, the dashboard gets no card rather than an error", async () => {
  const failing = { error: { message: "boom" } };
  const latest = await loadLatestAchievements(
    stubClient({ badges: failing, player_badges: failing, credit_transactions: failing, leaderboard_awards: failing }),
    "p1",
    3
  );
  assert.deepEqual(latest, { items: [], creditBalance: 0 });
});
