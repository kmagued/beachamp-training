// A player's achievements, for the Achievements page and the dashboard card. Read with the
// player's own client: row-level security limits player_badges and credit_transactions
// to their rows, and my_badge_progress() only ever answers for the signed-in player.

import { loadPlayerAwards, type PlayerAward } from "@/lib/king-of-court/awards-load";
import type { BadgeIconKey, Measure, TierNumber } from "./config";
import { sortBadges } from "./sort";
import { attendanceStreak, type AttendanceMark, type StreakSummary } from "./streak";

/** One tier of a badge, as one player sees it */
export interface PlayerTierView {
  id: string;
  tier: TierNumber;
  threshold: number;
  /** What the tier pays now, for a tier still to earn */
  credits: number;
  /** YYYY-MM-DD, or null while locked */
  earned_on: string | null;
  /** What the player was actually paid for it (credits are fixed when earned), or null while locked */
  credits_paid: number | null;
}

/** A badge as one player sees it */
export interface PlayerBadgeView {
  id: string;
  name: string;
  icon: BadgeIconKey;
  measure: Measure;
  created_at: string;
  /** Bronze first */
  tiers: PlayerTierView[];
  /** The latest day any of its tiers was earned, or null if none is: for ordering */
  earned_on: string | null;
  /** The player's figure for the measure (sessions, best run, best month, wins) */
  value: number;
  /** For a streak: the run as it stands now */
  current_run: number | null;
}

export interface PlayerAchievements {
  awards: PlayerAward[];
  /** Badges with an earned tier first, newest first; then locked */
  badges: PlayerBadgeView[];
  creditBalance: number;
  sessionsAttended: number;
}

export type LatestAchievement =
  | { kind: "award"; id: string; date: string; award: PlayerAward }
  | { kind: "badge"; id: string; date: string; badge: PlayerBadgeView; tier: PlayerTierView };

type Progress = Map<string, { value: number; current_run: number | null }>;

const fail = (message: string) => new Error(`Could not load your achievements: ${message}`);

/** Every badge and its tiers, with whether and when the player earned each, and what it paid */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadBadges(supabase: any, playerId: string, progress: Promise<Progress>): Promise<PlayerBadgeView[]> {
  const [{ data: badges, error: badgeErr }, { data: held, error: heldErr }, progressByBadge] = await Promise.all([
    supabase.from("badges").select("id, name, icon, measure, created_at, badge_tiers(id, tier, threshold, credits)"),
    supabase
      .from("player_badges")
      .select("badge_tier_id, earned_on, credit_transactions(amount)")
      .eq("player_id", playerId),
    progress,
  ]);
  if (badgeErr) throw fail(badgeErr.message);
  if (heldErr) throw fail(heldErr.message);

  const heldTiers = new Map(
    ((held || []) as { badge_tier_id: string; earned_on: string; credit_transactions: { amount: number }[] | null }[]).map(
      (h) => [h.badge_tier_id, { earned_on: h.earned_on, paid: (h.credit_transactions ?? []).reduce((sum, c) => sum + c.amount, 0) }]
    )
  );
  const rows = (badges || []) as (Omit<PlayerBadgeView, "tiers" | "earned_on" | "value" | "current_run"> & {
    badge_tiers: { id: string; tier: TierNumber; threshold: number; credits: number }[] | null;
  })[];

  return sortBadges(
    rows.map(({ badge_tiers, ...badge }) => {
      const tiers = [...(badge_tiers ?? [])]
        .sort((a, b) => a.tier - b.tier)
        .map((t) => ({
          ...t,
          earned_on: heldTiers.get(t.id)?.earned_on ?? null,
          credits_paid: heldTiers.get(t.id)?.paid ?? null,
        }));
      const earnedDays = tiers.map((t) => t.earned_on).filter((d): d is string => d !== null).sort();
      return {
        ...badge,
        tiers,
        earned_on: earnedDays.at(-1) ?? null,
        value: progressByBadge.get(badge.id)?.value ?? 0,
        current_run: progressByBadge.get(badge.id)?.current_run ?? null,
      };
    })
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadProgress(supabase: any): Promise<Progress> {
  const { data, error } = await supabase.rpc("my_badge_progress");
  if (error) throw fail(error.message);
  return new Map(
    ((data || []) as { badge_id: string; value: number; current_run: number | null }[]).map((p) => [
      p.badge_id,
      { value: p.value, current_run: p.current_run },
    ])
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadCreditBalance(supabase: any, playerId: string): Promise<number> {
  const { data, error } = await supabase.from("credit_transactions").select("amount").eq("player_id", playerId);
  if (error) throw fail(error.message);
  return ((data || []) as { amount: number }[]).reduce((sum, row) => sum + row.amount, 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSessionsAttended(supabase: any, playerId: string): Promise<number> {
  // Every present session, all time: not limited by any badge's start day
  const { count, error } = await supabase
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId)
    .eq("status", "present");
  if (error) throw fail(error.message);
  return count ?? 0;
}

/** Everything the Achievements page shows. Throws, so a failed read isn't shown as "nothing yet". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadPlayerAchievements(supabase: any, playerId: string): Promise<PlayerAchievements> {
  const progress = loadProgress(supabase);
  // Handled by loadBadges; this stops an early failure being reported as unhandled
  progress.catch(() => {});
  const [awards, badges, creditBalance, sessionsAttended] = await Promise.all([
    loadPlayerAwards(supabase, playerId),
    loadBadges(supabase, playerId, progress),
    loadCreditBalance(supabase, playerId),
    loadSessionsAttended(supabase, playerId),
  ]);
  return { awards, badges, creditBalance, sessionsAttended };
}

/**
 * Awards and earned tiers together, newest first; two tiers earned the same day show the
 * higher first. An award is dated by when its month was closed (a timestamp), a tier by
 * the day it was earned; the two compare as strings.
 */
export function latestAchievements(awards: PlayerAward[], badges: PlayerBadgeView[], limit: number): LatestAchievement[] {
  const items: LatestAchievement[] = [
    ...awards.map((award) => ({ kind: "award" as const, id: award.id, date: award.awarded_at, award })),
    ...badges.flatMap((badge) =>
      badge.tiers
        .filter((tier) => tier.earned_on !== null)
        .map((tier) => ({ kind: "badge" as const, id: tier.id, date: tier.earned_on!, badge, tier }))
    ),
  ];
  const tierOf = (item: LatestAchievement) => (item.kind === "badge" ? item.tier.tier : 0);
  return items.sort((a, b) => b.date.localeCompare(a.date) || tierOf(b) - tierOf(a)).slice(0, limit);
}

/**
 * For the dashboard: the newest few achievements, every badge with the player's progress,
 * and the credit balance. Never throws: these cards are extras, and a problem reading
 * badges must not take the dashboard (or the awards) with it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadLatestAchievements(supabase: any, playerId: string, limit: number) {
  const [awards, badgesAndCredits] = await Promise.all([
    loadPlayerAwards(supabase, playerId).catch((err) => {
      console.error("[achievements]", err);
      return [] as PlayerAward[];
    }),
    Promise.all([loadBadges(supabase, playerId, loadProgress(supabase)), loadCreditBalance(supabase, playerId)]).catch(
      (err) => {
        console.error("[achievements]", err);
        return [[], 0] as [PlayerBadgeView[], number];
      }
    ),
  ]);
  const [badges, creditBalance] = badgesAndCredits;
  return { items: latestAchievements(awards, badges, limit), badges, creditBalance };
}

/**
 * The player's attendance streak for the dashboard. Reads their newest 1000 marks, which
 * covers the current run and the dots; a best run older than that (years of sessions) may
 * be missed. Never throws: a problem here gives an empty streak, not a broken dashboard.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadStreak(supabase: any, playerId: string): Promise<StreakSummary> {
  const { data, error } = await supabase
    .from("attendance")
    .select("session_date, session_time, created_at, status")
    .eq("player_id", playerId)
    .order("session_date", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("[achievements] streak:", error.message);
    return { current: 0, best: 0, recent: [] };
  }
  return attendanceStreak((data || []) as AttendanceMark[]);
}
