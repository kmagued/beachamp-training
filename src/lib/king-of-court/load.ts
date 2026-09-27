// Loads a month of the leaderboard for one viewer, and the groups each kind of viewer
// may see. Server-only: it reads with the service role (players can't read other
// players' profiles under RLS), so the caller decides which groups are allowed from the
// signed-in user, never from the request.

import { createAdminClient } from "@/lib/supabase/server";
import { cairoMonthKey } from "@/lib/utils/cairo-time";
import { groupsForViewer, groupsToShow, type GroupRow, type LeaderboardGroup } from "./access";
import type { PlayerName, ScoreRow } from "./leaderboard";
import { monthRange, parseMonthParam } from "./month";

/** PostgREST returns at most this many rows per request */
const PAGE = 1000;

export interface LeaderboardData {
  month: string;
  currentMonth: string;
  groups: LeaderboardGroup[];
  scores: ScoreRow[];
  players: Record<string, PlayerName>;
}

/** Groups a coach is actively assigned to */
export async function coachGroupIds(coachId: string): Promise<Set<string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.from("coach_groups").select("group_id").eq("coach_id", coachId).eq("is_active", true);
  if (error) throw new Error(`Could not load the groups you coach: ${error.message}`);
  return new Set(((data || []) as { group_id: string }[]).map((r) => r.group_id));
}

/** Groups a player is an active member of */
export async function playerGroupIds(playerId: string): Promise<Set<string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin.from("group_players").select("group_id").eq("player_id", playerId).eq("is_active", true);
  if (error) throw new Error(`Could not load your groups: ${error.message}`);
  return new Set(((data || []) as { group_id: string }[]).map((r) => r.group_id));
}

/** `allowedGroupIds` null means every group on the leaderboard (admins) */
export async function loadLeaderboard(
  monthParam: string | undefined,
  allowedGroupIds: ReadonlySet<string> | null
): Promise<LeaderboardData> {
  // Cairo's month, not the server's (UTC): around midnight on the 1st they differ
  const currentMonth = cairoMonthKey(new Date());
  const month = parseMonthParam(monthParam, currentMonth);
  const { from, to } = monthRange(month);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: groupData, error: groupErr } = await admin
    .from("groups")
    .select("id, name, level, is_active, in_leaderboard")
    .order("name");
  if (groupErr) throw new Error(`Could not load groups: ${groupErr.message}`);
  const visible = groupsForViewer((groupData || []) as GroupRow[], allowedGroupIds);
  const visibleIds = visible.map((g) => g.id);

  const scores: ScoreRow[] = [];
  const players: Record<string, PlayerName> = {};
  for (let offset = 0; visibleIds.length > 0; offset += PAGE) {
    const { data, error } = await admin
      .from("king_of_court_scores")
      .select("id, player_id, group_id, schedule_session_id, session_date, points, schedule_sessions(start_time), profiles!king_of_court_scores_player_id_fkey(first_name, last_name)")
      .in("group_id", visibleIds)
      .gte("session_date", from)
      .lt("session_date", to)
      .order("session_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    // A partial month would crown the wrong player, so fail loudly rather than render it
    if (error) throw new Error(`Could not load King of Court scores: ${error.message}`);
    const rows = (data || []) as {
      player_id: string;
      group_id: string;
      schedule_session_id: string;
      session_date: string;
      points: number;
      schedule_sessions: { start_time: string } | null;
      profiles: PlayerName | null;
    }[];
    for (const r of rows) {
      scores.push({
        player_id: r.player_id,
        group_id: r.group_id,
        schedule_session_id: r.schedule_session_id,
        session_date: r.session_date,
        start_time: r.schedule_sessions?.start_time ?? "00:00:00",
        points: r.points,
      });
      if (r.profiles) players[r.player_id] = { first_name: r.profiles.first_name, last_name: r.profiles.last_name };
    }
    if (rows.length < PAGE) break;
  }

  const groups = groupsToShow(visible, new Set(scores.map((s) => s.group_id)));
  return { month, currentMonth, groups, scores, players };
}
