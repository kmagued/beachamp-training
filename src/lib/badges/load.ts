// A player's achievements, for the Achievements page and the dashboard card. Read with the
// player's own client: row-level security limits player_badges and credit_transactions
// to their rows, and my_badge_progress() only ever answers for the signed-in player.

import { loadPlayerAwards, type PlayerAward } from "@/lib/king-of-court/awards-load";
import type { BadgeIconKey, Measure } from "./config";
import { sortBadges } from "./sort";

/** A badge as one player sees it: earned_on is set when they hold it */
export interface PlayerBadgeView {
  id: string;
  name: string;
  icon: BadgeIconKey;
  measure: Measure;
  threshold: number;
  credits: number;
  created_at: string;
  /** YYYY-MM-DD, or null while locked */
  earned_on: string | null;
  /** The player's figure for the measure (sessions, best run, best month, wins) */
  value: number;
  /** For a streak: the run as it stands now */
  current_run: number | null;
}

export interface PlayerAchievements {
  awards: PlayerAward[];
  /** Earned first, newest first; then locked */
  badges: PlayerBadgeView[];
  creditBalance: number;
  sessionsAttended: number;
}

export type LatestAchievement =
  | { kind: "award"; id: string; date: string; award: PlayerAward }
  | { kind: "badge"; id: string; date: string; badge: PlayerBadgeView };

const fail = (message: string) => new Error(`Could not load your achievements: ${message}`);

/** Every badge, with whether and when the player earned it */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadBadges(supabase: any, playerId: string, progress: Map<string, { value: number; current_run: number | null }>) {
  const [{ data: badges, error: badgeErr }, { data: held, error: heldErr }] = await Promise.all([
    supabase.from("badges").select("id, name, icon, measure, threshold, credits, created_at"),
    supabase.from("player_badges").select("badge_id, earned_on").eq("player_id", playerId),
  ]);
  if (badgeErr) throw fail(badgeErr.message);
  if (heldErr) throw fail(heldErr.message);

  const earnedOn = new Map(((held || []) as { badge_id: string; earned_on: string }[]).map((h) => [h.badge_id, h.earned_on]));
  const rows = (badges || []) as Omit<PlayerBadgeView, "earned_on" | "value" | "current_run">[];
  return sortBadges(
    rows.map((b) => ({
      ...b,
      earned_on: earnedOn.get(b.id) ?? null,
      value: progress.get(b.id)?.value ?? 0,
      current_run: progress.get(b.id)?.current_run ?? null,
    }))
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadCreditBalance(supabase: any, playerId: string): Promise<number> {
  const { data, error } = await supabase.from("credit_transactions").select("amount").eq("player_id", playerId);
  if (error) throw fail(error.message);
  return ((data || []) as { amount: number }[]).reduce((sum, row) => sum + row.amount, 0);
}

/** Everything the Achievements page shows. Throws, so a failed read isn't shown as "nothing yet". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadPlayerAchievements(supabase: any, playerId: string): Promise<PlayerAchievements> {
  const [awards, progressRes, creditBalance, attendanceRes] = await Promise.all([
    loadPlayerAwards(supabase, playerId),
    supabase.rpc("my_badge_progress"),
    loadCreditBalance(supabase, playerId),
    // Every present session, all time: not limited by any badge's start day
    supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId)
      .eq("status", "present"),
  ]);
  if (progressRes.error) throw fail(progressRes.error.message);
  if (attendanceRes.error) throw fail(attendanceRes.error.message);

  const progress = new Map(
    ((progressRes.data || []) as { badge_id: string; value: number; current_run: number | null }[]).map((p) => [
      p.badge_id,
      { value: p.value, current_run: p.current_run },
    ])
  );
  const badges = await loadBadges(supabase, playerId, progress);

  return { awards, badges, creditBalance, sessionsAttended: attendanceRes.count ?? 0 };
}

/**
 * Awards and earned badges together, newest first. An award is dated by when its month
 * was closed (a timestamp), a badge by the day it was earned; the two compare as strings.
 */
export function latestAchievements(awards: PlayerAward[], badges: PlayerBadgeView[], limit: number): LatestAchievement[] {
  const items: LatestAchievement[] = [
    ...awards.map((award) => ({ kind: "award" as const, id: award.id, date: award.awarded_at, award })),
    ...badges
      .filter((badge) => badge.earned_on)
      .map((badge) => ({ kind: "badge" as const, id: badge.id, date: badge.earned_on!, badge })),
  ];
  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

/**
 * The dashboard card's newest few, and the credit balance. Never throws: the card is an
 * extra, and a problem reading badges must not take the dashboard (or the awards) with it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadLatestAchievements(supabase: any, playerId: string, limit: number) {
  let awards: PlayerAward[] = [];
  let badges: PlayerBadgeView[] = [];
  let creditBalance = 0;
  try {
    awards = await loadPlayerAwards(supabase, playerId);
  } catch (err) {
    console.error("[achievements]", err);
  }
  try {
    [badges, creditBalance] = await Promise.all([loadBadges(supabase, playerId, new Map()), loadCreditBalance(supabase, playerId)]);
  } catch (err) {
    console.error("[achievements]", err);
  }
  return { items: latestAchievements(awards, badges, limit), creditBalance };
}
