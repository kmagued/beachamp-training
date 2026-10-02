// A player's monthly leaderboard awards, for the Achievements page and the dashboard card
// (through src/lib/badges/load.ts, which adds their badges).
// Read with the player's own client: row-level security limits it to their rows.

import { sortAwards, type Place } from "./awards";

export interface PlayerAward {
  id: string;
  /** YYYY-MM */
  month: string;
  place: Place;
  points: number;
  sessions: number;
  /** When the award was given, which is when its month was closed */
  awarded_at: string;
  group_name: string;
}

/** A player's awards, newest month first; 1st place before 2nd within a month */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadPlayerAwards(supabase: any, playerId: string): Promise<PlayerAward[]> {
  const { data, error } = await supabase
    .from("leaderboard_awards")
    .select("id, month, place, points, sessions, created_at, groups(name)")
    .eq("player_id", playerId);
  if (error) throw new Error(`Could not load your achievements: ${error.message}`);

  const rows = (data || []) as {
    id: string;
    month: string;
    place: Place;
    points: number;
    sessions: number;
    created_at: string;
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
      awarded_at: r.created_at,
      group_name: r.groups?.name ?? "Your group",
    }))
  );
}
