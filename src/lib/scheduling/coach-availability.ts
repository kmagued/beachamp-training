"use server";

import { createAdminClient } from "@/lib/supabase/server";
import type { CoachBlock } from "@/types/database";

export type Conflict = {
  type: 'group_session' | 'private_session_request' | 'scheduled_private';
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  label: string;
};

export type CreateBlockInput = {
  coach_id: string;
  kind: 'one_time' | 'weekly';
  start_date?: string | null;
  end_date?: string | null;
  day_of_week?: number | null;
  effective_from?: string | null;
  effective_until?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
};

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function timeStrToMinutes(t: string): number {
  return toMinutes(t.slice(0, 5));
}

function intervalsOverlap(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && e1 > s2;
}

function dowOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function dateLte(a: string, b: string): boolean { return a <= b; }
function dateGte(a: string, b: string): boolean { return a >= b; }

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Pure predicate: does this block apply to (date, [t1,t2])? */
function blockMatchesSync(block: CoachBlock, date: string, startTime: string, endTime: string): boolean {
  const t1 = toMinutes(startTime);
  const t2 = toMinutes(endTime);

  if (block.kind === 'one_time') {
    if (!block.start_date) return false;
    const endDate = block.end_date ?? block.start_date;
    if (!dateGte(date, block.start_date)) return false;
    if (!dateLte(date, endDate)) return false;

    if (block.start_time === null && block.end_time === null) return true;
    if (block.start_time === null || block.end_time === null) return false;
    return intervalsOverlap(timeStrToMinutes(block.start_time), timeStrToMinutes(block.end_time), t1, t2);
  }

  if (block.day_of_week === null || block.day_of_week === undefined) return false;
  if (block.start_time === null || block.end_time === null) return false;

  if (block.day_of_week !== dowOf(date)) return false;
  if (block.effective_from && !dateGte(date, block.effective_from)) return false;
  if (block.effective_until && !dateLte(date, block.effective_until)) return false;

  return intervalsOverlap(timeStrToMinutes(block.start_time), timeStrToMinutes(block.end_time), t1, t2);
}

/** Async wrapper for use under "use server" (server actions can't export sync functions). */
export async function blockMatches(
  block: CoachBlock,
  date: string,
  startTime: string,
  endTime: string
): Promise<boolean> {
  return blockMatchesSync(block, date, startTime, endTime);
}

/** Is a coach blocked at this exact slot? */
export async function isCoachBlocked(
  coachId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<{ blocked: boolean; matchingBlock?: { id: string; reason: string | null } }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const dow = dowOf(date);
  const { data } = await admin
    .from("coach_blocks")
    .select("*")
    .eq("coach_id", coachId)
    .or(`and(kind.eq.one_time,start_date.lte.${date},or(end_date.is.null,end_date.gte.${date})),and(kind.eq.weekly,day_of_week.eq.${dow})`);

  const blocks = (data || []) as CoachBlock[];
  for (const b of blocks) {
    if (blockMatchesSync(b, date, startTime, endTime)) {
      return { blocked: true, matchingBlock: { id: b.id, reason: b.reason } };
    }
  }
  return { blocked: false };
}

/** Fetch raw blocks overlapping the inclusive [fromDate, toDate] envelope. */
export async function getCoachBlocksInRange(
  coachId: string,
  fromDate: string,
  toDate: string
): Promise<CoachBlock[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data } = await admin
    .from("coach_blocks")
    .select("*")
    .eq("coach_id", coachId)
    .or(
      `and(kind.eq.one_time,start_date.lte.${toDate},or(end_date.is.null,end_date.gte.${fromDate})),` +
      `and(kind.eq.weekly,or(effective_from.is.null,effective_from.lte.${toDate}),or(effective_until.is.null,effective_until.gte.${fromDate}))`
    );

  return (data || []) as CoachBlock[];
}

/** For a proposed new block, find existing sessions/requests it would overlap. */
export async function findConflictsForBlock(input: CreateBlockInput): Promise<Conflict[]> {
  const conflicts: Conflict[] = [];

  const today = new Date().toISOString().slice(0, 10);
  let envelopeStart: string;
  let envelopeEnd: string;

  if (input.kind === 'one_time') {
    if (!input.start_date) return [];
    envelopeStart = input.start_date;
    envelopeEnd = input.end_date ?? input.start_date;
  } else {
    envelopeStart = input.effective_from ?? today;
    envelopeEnd = input.effective_until ?? addDays(today, 90);
  }

  const candidateDates: string[] = [];
  if (input.kind === 'one_time') {
    let d = envelopeStart;
    while (dateLte(d, envelopeEnd)) {
      candidateDates.push(d);
      d = addDays(d, 1);
    }
  } else {
    let d = envelopeStart;
    while (dateLte(d, envelopeEnd)) {
      if (dowOf(d) === input.day_of_week) candidateDates.push(d);
      d = addDays(d, 1);
    }
  }

  if (candidateDates.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const blockStart = input.start_time ? timeStrToMinutes(input.start_time) : 0;
  const blockEnd = input.end_time ? timeStrToMinutes(input.end_time) : 24 * 60;

  // Group/private recurring sessions assigned to this coach
  const { data: groupSessions } = await admin
    .from("schedule_sessions")
    .select("id, day_of_week, start_time, end_time, end_date, session_type, group_id, groups(name)")
    .eq("coach_id", input.coach_id)
    .eq("is_active", true)
    .or(`end_date.is.null,end_date.gte.${envelopeStart}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const s of (groupSessions || []) as any[]) {
    for (const date of candidateDates) {
      if (s.end_date && dateGte(date, s.end_date)) continue;
      if (s.day_of_week !== dowOf(date)) continue;

      const sStart = timeStrToMinutes(s.start_time);
      const sEnd = timeStrToMinutes(s.end_time);

      if (intervalsOverlap(sStart, sEnd, blockStart, blockEnd)) {
        conflicts.push({
          type: s.session_type === 'private' ? 'scheduled_private' : 'group_session',
          id: s.id,
          date,
          start_time: s.start_time.slice(0, 5),
          end_time: s.end_time.slice(0, 5),
          label: s.groups?.name ?? (s.session_type === 'private' ? 'Private session' : 'Group session'),
        });
      }
    }
  }

  // Pending/confirmed private session requests for this coach in the envelope
  const { data: requests } = await admin
    .from("private_session_requests")
    .select("id, requested_date, requested_day_of_week, requested_time, duration_minutes, profiles!private_session_requests_player_id_fkey(first_name, last_name)")
    .eq("coach_id", input.coach_id)
    .in("status", ["pending", "confirmed"])
    .gte("requested_date", envelopeStart)
    .lte("requested_date", envelopeEnd);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (requests || []) as any[]) {
    const date = r.requested_date;
    if (!date) continue;
    if (!candidateDates.includes(date)) continue;

    const start = timeStrToMinutes(r.requested_time);
    const end = start + (r.duration_minutes || 60);

    if (intervalsOverlap(start, end, blockStart, blockEnd)) {
      const playerName = r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : 'a player';
      const eh = Math.floor(end / 60) % 24;
      const em = end % 60;
      conflicts.push({
        type: 'private_session_request',
        id: r.id,
        date,
        start_time: r.requested_time.slice(0, 5),
        end_time: `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`,
        label: `Private session with ${playerName}`,
      });
    }
  }

  return conflicts;
}
