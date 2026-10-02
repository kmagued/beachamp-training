// Loads a month of coach attendance for the pay export. Runs in the browser with the
// signed-in admin's client; RLS on `coach_attendance` gives admins every row.

import type { SupabaseClient } from "@supabase/supabase-js";
import { monthRange } from "@/lib/king-of-court/month";
import type { CoachAttendanceRow, CoachAttendanceStatus } from "./summary";

/** PostgREST returns at most this many rows per request */
const PAGE = 1000;

/** A `coach_attendance` row as the select below returns it */
export interface RawCoachAttendance {
  coach_id: string;
  session_date: string;
  status: CoachAttendanceStatus;
  /** NUMERIC: usually a number, but a string is tolerated */
  hours: number | string | null;
  notes: string | null;
  schedule_sessions: {
    start_time: string;
    end_time: string;
    session_type: string | null;
    location: string | null;
    groups: { name: string } | null;
    player: { first_name: string; last_name: string } | null;
  } | null;
}

function sessionLabel(s: NonNullable<RawCoachAttendance["schedule_sessions"]>): string {
  if (s.session_type === "private") {
    return s.player ? `Private – ${s.player.first_name} ${s.player.last_name}` : "Private";
  }
  return s.groups?.name ?? "Session";
}

export function toCoachAttendanceRow(raw: RawCoachAttendance): CoachAttendanceRow {
  const s = raw.schedule_sessions;
  return {
    date: raw.session_date,
    status: raw.status,
    hours: raw.hours === null ? null : Number(raw.hours),
    startTime: (s?.start_time ?? "00:00").slice(0, 5),
    endTime: (s?.end_time ?? "00:00").slice(0, 5),
    sessionLabel: s ? sessionLabel(s) : "Session",
    location: s?.location ?? null,
    notes: raw.notes,
  };
}

/** Every requested coach gets an entry, so one with no attendance still shows up */
export function groupByCoach(rows: RawCoachAttendance[], coachIds: string[]): Record<string, CoachAttendanceRow[]> {
  const byCoach: Record<string, CoachAttendanceRow[]> = Object.fromEntries(coachIds.map((id) => [id, []]));
  for (const r of rows) byCoach[r.coach_id]?.push(toCoachAttendanceRow(r));
  return byCoach;
}

export async function loadCoachMonth(
  supabase: SupabaseClient,
  coachIds: string[],
  month: string
): Promise<Record<string, CoachAttendanceRow[]>> {
  const { from, to } = monthRange(month);
  // `coach_attendance` isn't in the generated types yet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;

  const rows: RawCoachAttendance[] = [];
  for (let offset = 0; coachIds.length > 0; offset += PAGE) {
    const { data, error } = await client
      .from("coach_attendance")
      .select(
        "coach_id, session_date, status, hours, notes, schedule_sessions(start_time, end_time, session_type, location, groups(name), player:profiles!schedule_sessions_player_id_fkey(first_name, last_name))"
      )
      .in("coach_id", coachIds)
      .gte("session_date", from)
      .lt("session_date", to)
      .order("session_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    // A partial month would underpay someone, so fail loudly rather than show it
    if (error) throw new Error(`Could not load coach attendance: ${error.message}`);
    const page = (data || []) as RawCoachAttendance[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  return groupByCoach(rows, coachIds);
}
