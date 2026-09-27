import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { cairoMonthKey } from "@/lib/utils/cairo-time";
import { monthRange, parseMonthParam } from "@/lib/king-of-court/month";
import type { ScoreRow } from "@/lib/king-of-court/leaderboard";
import { LeaderboardClient, type LeaderboardGroup, type PlayerName } from "./_components/leaderboard-client";

/** PostgREST returns at most this many rows per request */
const PAGE = 1000;

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const sp = await searchParams;
  // Cairo's month, not the server's (UTC): around midnight on the 1st they differ
  const currentMonth = cairoMonthKey(new Date());
  const month = parseMonthParam(typeof sp.month === "string" ? sp.month : undefined, currentMonth);
  const { from, to } = monthRange(month);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const scores: ScoreRow[] = [];
  const players: Record<string, PlayerName> = {};
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("king_of_court_scores")
      .select("id, player_id, group_id, schedule_session_id, session_date, points, schedule_sessions(start_time), profiles!king_of_court_scores_player_id_fkey(first_name, last_name)")
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

  // Active groups, plus any inactive group that has scores this month
  const scoredGroupIds = new Set(scores.map((s) => s.group_id));
  const { data: groupData } = await supabase
    .from("groups")
    .select("id, name, level, is_active")
    .order("name");
  const groups: LeaderboardGroup[] = ((groupData || []) as (LeaderboardGroup & { is_active: boolean })[])
    .filter((g) => g.is_active || scoredGroupIds.has(g.id))
    .map(({ id, name, level }) => ({ id, name, level }));

  return (
    <LeaderboardClient
      month={month}
      currentMonth={currentMonth}
      groups={groups}
      scores={scores}
      players={players}
    />
  );
}
