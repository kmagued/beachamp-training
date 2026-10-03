// Loads what the birthday rule needs: players with a date of birth, the sessions they're
// in, and cancelled dates. Runs on the server with the service-role client, because a
// coach's RLS can't see every group a player trains with, and the celebration session
// depends on all of them.

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, cairoDayKey, daysBetween } from "@/lib/utils/cairo-time";
import {
  CELEBRATION_WINDOW_DAYS,
  findBirthdays,
  type BirthdayEntry,
  type BirthdayPlayer,
  type CelebrationSession,
} from "./celebrations";

/** PostgREST returns at most this many rows per request */
const PAGE = 1000;

/** A `schedule_sessions` row as the select below returns it */
export interface RawSession {
  id: string;
  session_type: "group" | "private" | null;
  group_id: string | null;
  /** Back-compat single player of a private session; `schedule_session_players` is the source of truth */
  player_id: string | null;
  day_of_week: number;
  start_time: string;
  end_date: string | null;
  created_at: string;
  groups: { name: string } | null;
  schedule_session_players: { player_id: string }[] | null;
}

export interface RawProfile {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  date_of_birth: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `from`..`to` is a sane range to load: real dates, in order, at most ~a month */
export function isLoadableRange(from: string, to: string): boolean {
  return DATE.test(from) && DATE.test(to) && from <= to && daysBetween(from, to) <= 31;
}

export function toBirthdayPlayer(p: RawProfile): BirthdayPlayer {
  return {
    id: p.id,
    firstName: p.first_name.trim(),
    lastName: p.last_name.trim(),
    avatarUrl: p.avatar_url,
    dateOfBirth: p.date_of_birth,
  };
}

/** `members` are the active `group_players` rows */
export function toCelebrationSessions(
  rows: RawSession[],
  members: { group_id: string; player_id: string }[]
): CelebrationSession[] {
  return rows.map((s) => {
    const isPrivate = s.session_type === "private";
    const playerIds = isPrivate
      ? [...new Set([...(s.schedule_session_players ?? []).map((p) => p.player_id), ...(s.player_id ? [s.player_id] : [])])]
      : members.filter((m) => m.group_id === s.group_id).map((m) => m.player_id);
    return {
      id: s.id,
      kind: isPrivate ? "private" : "group",
      dayOfWeek: s.day_of_week,
      startTime: s.start_time.slice(0, 5),
      startsOn: cairoDayKey(new Date(s.created_at)),
      endDate: s.end_date,
      label: isPrivate ? "Private" : (s.groups?.name ?? "Group"),
      playerIds,
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await build(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Birthday entries for `from`..`to` (YYYY-MM-DD, inclusive); see findBirthdays */
export async function loadBirthdays(supabase: SupabaseClient, from: string, to: string): Promise<BirthdayEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  // Session dates the rule can look at: a celebration up to a week after a birthday a week before `from`
  const firstDate = addDays(from, -CELEBRATION_WINDOW_DAYS);
  const lastDate = addDays(to, CELEBRATION_WINDOW_DAYS);

  const [profiles, members, sessions, cancellations] = await Promise.all([
    fetchAll<RawProfile>((a, b) =>
      client
        .from("profiles")
        .select("id, first_name, last_name, avatar_url, date_of_birth")
        .not("date_of_birth", "is", null)
        .eq("is_active", true)
        .order("id")
        .range(a, b)
    ),
    fetchAll<{ group_id: string; player_id: string }>((a, b) =>
      client.from("group_players").select("group_id, player_id").eq("is_active", true).order("id").range(a, b)
    ),
    fetchAll<RawSession>((a, b) =>
      client
        .from("schedule_sessions")
        .select(
          "id, session_type, group_id, player_id, day_of_week, start_time, end_date, created_at, groups(name), schedule_session_players(player_id)"
        )
        .eq("is_active", true)
        .or(`session_type.eq.group,and(session_type.eq.private,end_date.gte.${firstDate},end_date.lte.${lastDate})`)
        .order("id")
        .range(a, b)
    ),
    fetchAll<{ schedule_session_id: string; cancelled_date: string }>((a, b) =>
      client
        .from("schedule_session_cancellations")
        .select("schedule_session_id, cancelled_date")
        .gte("cancelled_date", firstDate)
        .lte("cancelled_date", lastDate)
        .order("id")
        .range(a, b)
    ),
  ]);

  return findBirthdays({
    players: profiles.map(toBirthdayPlayer),
    sessions: toCelebrationSessions(sessions, members),
    cancelled: new Set(cancellations.map((c) => `${c.schedule_session_id}_${c.cancelled_date}`)),
    from,
    to,
  });
}
