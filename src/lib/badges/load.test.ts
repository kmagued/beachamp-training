import { test } from "node:test";
import assert from "node:assert/strict";
import {
  latestAchievements,
  loadLatestAchievements,
  loadPlayerAchievements,
  loadStreak,
  type PlayerBadgeView,
} from "./load";
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
      limit: () => q,
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
  {
    id: "regular",
    name: "Court Regular",
    icon: "shield-check",
    measure: "sessions_attended",
    created_at: "2026-10-02T09:00:00Z",
    // Out of order on purpose: the loader puts Bronze first
    badge_tiers: [
      { id: "regular-2", tier: 2, threshold: 25, credits: 100 },
      { id: "regular-1", tier: 1, threshold: 10, credits: 20 },
      { id: "regular-3", tier: 3, threshold: 50, credits: 200 },
    ],
  },
  {
    id: "streak",
    name: "Iron Streak",
    icon: "zap",
    measure: "attendance_streak",
    created_at: "2026-10-02T10:00:00Z",
    badge_tiers: [{ id: "streak-1", tier: 1, threshold: 8, credits: 0 }],
  },
  {
    id: "century",
    name: "Century Club",
    icon: "sparkles",
    measure: "month_points",
    created_at: "2026-10-02T11:00:00Z",
    badge_tiers: [{ id: "century-1", tier: 1, threshold: 100, credits: 30 }],
  },
];

const awardRows = [
  { id: "a1", month: "2026-09", place: 1, points: 142, sessions: 8, created_at: "2026-10-01T10:00:00Z", groups: { name: "Women's Team" } },
];

const tables: Record<string, Result> = {
  badges: { data: badgeRows },
  player_badges: {
    data: [
      // Silver was earned when it paid 50; the tier pays 100 now
      { badge_tier_id: "regular-2", earned_on: "2026-11-03", credit_transactions: [{ amount: 50 }] },
      { badge_tier_id: "regular-1", earned_on: "2026-10-12", credit_transactions: [{ amount: 20 }] },
      { badge_tier_id: "century-1", earned_on: "2026-10-20", credit_transactions: [{ amount: 30 }] },
    ],
  },
  credit_transactions: { data: [{ amount: 20 }, { amount: 50 }, { amount: 30 }] },
  attendance: { count: 64 },
  leaderboard_awards: { data: awardRows },
};

const progress: Result = {
  data: [
    { badge_id: "regular", value: 34, current_run: null },
    { badge_id: "streak", value: 5, current_run: 3 },
  ],
};

test("loadPlayerAchievements: awards, badges with their tiers, what was paid, progress, balance and sessions", async () => {
  const a = await loadPlayerAchievements(stubClient(tables, progress), "p1");

  assert.deepEqual(a.awards.map((w) => w.id), ["a1"]);
  assert.equal(a.creditBalance, 100);
  assert.equal(a.sessionsAttended, 64);
  assert.deepEqual(
    a.badges.map((b) => [b.id, b.earned_on, b.value, b.current_run]),
    [
      ["regular", "2026-11-03", 34, null],
      ["century", "2026-10-20", 0, null],
      ["streak", null, 5, 3],
    ],
    "badges with an earned tier first, newest first, then locked; a badge with no progress row reads 0"
  );
  assert.deepEqual(a.badges[0].tiers, [
    { id: "regular-1", tier: 1, threshold: 10, credits: 20, earned_on: "2026-10-12", credits_paid: 20 },
    { id: "regular-2", tier: 2, threshold: 25, credits: 100, earned_on: "2026-11-03", credits_paid: 50 },
    { id: "regular-3", tier: 3, threshold: 50, credits: 200, earned_on: null, credits_paid: null },
  ]);
});

test("loadPlayerAchievements: a tier earned with 0 credits shows 0 paid", async () => {
  const a = await loadPlayerAchievements(
    stubClient(
      { ...tables, player_badges: { data: [{ badge_tier_id: "streak-1", earned_on: "2026-10-05", credit_transactions: [] }] } },
      progress
    ),
    "p1"
  );
  const streak = a.badges.find((b) => b.id === "streak")!;
  assert.equal(streak.tiers[0].credits_paid, 0);
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
const badge = (id: string, tiers: (string | null)[]): PlayerBadgeView => ({
  id,
  name: id,
  icon: "star",
  measure: "sessions_attended",
  created_at: "2026-10-01T00:00:00Z",
  tiers: tiers.map((earned_on, i) => ({
    id: `${id}-${i + 1}`,
    tier: (i + 1) as 1 | 2 | 3 | 4 | 5,
    threshold: (i + 1) * 10,
    credits: 0,
    earned_on,
    credits_paid: earned_on ? 0 : null,
  })),
  earned_on: tiers.filter((t): t is string => t !== null).sort().at(-1) ?? null,
  value: 0,
  current_run: null,
});

test("latestAchievements: awards and earned tiers together, newest first, up to the limit", () => {
  const items = latestAchievements(
    [award("sep", "2026-10-01T10:00:00Z"), award("aug", "2026-09-01T10:00:00Z")],
    [badge("regular", ["2026-09-10", "2026-10-15", null]), badge("locked", [null])],
    3
  );
  assert.deepEqual(items.map((i) => `${i.kind}:${i.id}`), ["badge:regular-2", "award:sep", "badge:regular-1"]);
});

test("latestAchievements: two tiers earned the same day show the higher first", () => {
  const items = latestAchievements([], [badge("regular", ["2026-10-15", "2026-10-15", null])], 3);
  assert.deepEqual(items.map((i) => i.id), ["regular-2", "regular-1"]);
});

test("loadLatestAchievements: the dashboard's newest three, every badge with progress, and the balance", async () => {
  const latest = await loadLatestAchievements(stubClient(tables, progress), "p1", 3);
  assert.deepEqual(latest.items.map((i) => `${i.kind}:${i.id}`), ["badge:regular-2", "badge:century-1", "badge:regular-1"]);
  assert.equal(latest.creditBalance, 100);
  assert.deepEqual(
    latest.badges.map((b) => [b.id, b.value, b.current_run]),
    [
      ["regular", 34, null],
      ["century", 0, null],
      ["streak", 5, 3],
    ]
  );
});

test("loadStreak: the player's run, best and recent marks", async () => {
  const streak = await loadStreak(
    stubClient({
      attendance: {
        data: [
          { session_date: "2026-10-08", session_time: null, created_at: "2026-10-08T10:00:00Z", status: "present" },
          { session_date: "2026-10-05", session_time: null, created_at: "2026-10-05T10:00:00Z", status: "absent" },
          { session_date: "2026-10-01", session_time: null, created_at: "2026-10-01T10:00:00Z", status: "present" },
        ],
      },
    }),
    "p1"
  );
  assert.deepEqual(streak, { current: 1, best: 1, recent: ["present", "absent", "present"] });
});

test("loadStreak: a failed read is an empty streak, not a broken dashboard", async () => {
  const streak = await loadStreak(stubClient({ attendance: { error: { message: "boom" } } }), "p1");
  assert.deepEqual(streak, { current: 0, best: 0, recent: [] });
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
  assert.deepEqual(latest, { items: [], badges: [], creditBalance: 0 });
});
