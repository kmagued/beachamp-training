// A player's monthly leaderboard awards, for the Achievements page and the dashboard card.
// Read with the player's own client: row-level security limits it to their rows.

import { sortAwards, type Place } from "./awards";

export interface PlayerAward {
  id: string;
  /** YYYY-MM */
  month: string;
  place: Place;
  points: number;
  sessions: number;
  group_name: string;
}

/** A player's awards, newest month first; 1st place before 2nd within a month */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadPlayerAwards(supabase: any, playerId: string): Promise<PlayerAward[]> {
  const { data, error } = await supabase
    .from("leaderboard_awards")
    .select("id, month, place, points, sessions, groups(name)")
    .eq("player_id", playerId);
  if (error) throw new Error(`Could not load your achievements: ${error.message}`);

  const rows = (data || []) as {
    id: string;
    month: string;
    place: Place;
    points: number;
    sessions: number;
    groups: { name: string } | null;
  }[];
  // A player holds a handful of awards, so they are sorted here rather than in the query
  return sortAwards(
    rows.map((r) => ({
      id: r.id,
      month: r.month,
      place: r.place,
      points: r.points,
      sessions: r.sessions,
      group_name: r.groups?.name ?? "Your group",
    }))
  );
}

/**
 * The newest few, for the dashboard card. Never throws: the card is an extra, and a
 * problem reading awards must not take the player's dashboard down with it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadLatestAwards(supabase: any, playerId: string, limit: number): Promise<PlayerAward[]> {
  try {
    return (await loadPlayerAwards(supabase, playerId)).slice(0, limit);
  } catch (err) {
    console.error("[achievements]", err);
    return [];
  }
}
