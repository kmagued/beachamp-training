// Who holds a badge, for the admin's holders drawer. Pure: the server action reads one
// row per tier held, and these turn them into one row per player.

import type { TierNumber } from "./config";

/** One tier one player holds, as read from player_badges */
export interface HeldTierRow {
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  tier: TierNumber;
  /** YYYY-MM-DD */
  earned_on: string;
  /** Credits actually paid for this tier */
  paid: number;
}

export interface BadgeHolder {
  player_id: string;
  name: string;
  initials: string;
  /** Their highest tier */
  tier: TierNumber;
  /** When they reached their highest tier */
  since: string;
  /** Every tier they hold, lowest first */
  tiers: TierNumber[];
  /** Credits this badge has paid them, across its tiers */
  credits_paid: number;
}

/** One row per player: highest tier first, then whoever reached it first, then by name */
export function groupHolders(rows: HeldTierRow[]): BadgeHolder[] {
  const byPlayer = new Map<string, HeldTierRow[]>();
  for (const r of rows) byPlayer.set(r.player_id, [...(byPlayer.get(r.player_id) ?? []), r]);

  const holders = [...byPlayer.values()].map((held) => {
    const sorted = [...held].sort((a, b) => a.tier - b.tier);
    const top = sorted[sorted.length - 1];
    const first = (top.first_name ?? "").trim();
    const last = (top.last_name ?? "").trim();
    const name = `${first} ${last}`.trim() || "Unnamed player";
    const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?";
    return {
      player_id: top.player_id,
      name,
      initials,
      tier: top.tier,
      since: top.earned_on,
      tiers: sorted.map((r) => r.tier),
      credits_paid: sorted.reduce((sum, r) => sum + r.paid, 0),
    };
  });

  return holders.sort((a, b) => b.tier - a.tier || a.since.localeCompare(b.since) || a.name.localeCompare(b.name));
}

/**
 * The drawer's filters. A tier shows everyone holding it, including players who have
 * gone higher, matching the tier counts on the badge card.
 */
export function filterHolders(holders: BadgeHolder[], tier: TierNumber | "all", search: string): BadgeHolder[] {
  const query = search.trim().toLowerCase();
  return holders.filter(
    (h) => (tier === "all" || h.tiers.includes(tier)) && (!query || h.name.toLowerCase().includes(query))
  );
}
