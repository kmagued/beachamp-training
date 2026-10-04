// The player's private sessions for the dashboard: their requests waiting for an admin, and
// their upcoming sessions with where each payment stands. Read with the service role
// because a partner can't read the payer's subscription or profile; every query is limited
// to the caller's own requests and sessions.

import { formatTime } from "@/lib/king-of-court/format";
import { paymentState, privatePackageFor, sessionWhen, type PaymentState } from "./payment";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** How many upcoming sessions the dashboard shows; the rest are on Private Sessions */
const UPCOMING_LIMIT = 3;

export interface PendingRequest {
  id: string;
  when: string;
  coach: string | null;
}

export interface UpcomingSession {
  id: string;
  when: string;
  coach: string | null;
  /** The other players' full names */
  others: string[];
  payerFirstName: string | null;
  youPay: boolean;
  /** null when no package fits the session or it has no payer */
  state: PaymentState | null;
  /** The payer's Pay button, while unpaid */
  pay: { packageId: string; price: number } | null;
}

export interface PlayerPrivateSessions {
  pending: PendingRequest[];
  upcoming: UpcomingSession[];
}

type Name = { first_name: string; last_name: string };

export interface RawSession {
  id: string;
  player_id: string | null;
  end_date: string | null;
  start_time: string;
  coach: Name | null;
  private_players: { player_id: string; profiles: Name | null }[];
}

const fullName = (n: Name) => `${n.first_name} ${n.last_name}`;

/** "Sat 10 Oct at 8:00 PM" for a request with a date, else "Sat at 8:00 PM" */
export function requestWhen(r: {
  requested_date: string | null;
  requested_day_of_week: number;
  requested_time: string;
}): string {
  return r.requested_date
    ? sessionWhen(r.requested_date, r.requested_time)
    : `${DAYS[r.requested_day_of_week]} at ${formatTime(r.requested_time)}`;
}

/** The dashboard rows for the player's upcoming sessions, nearest first. `sessions` come
 *  ordered by date; `cancelled` holds "sessionId|date" for dates cancelled on the schedule. */
export function buildUpcoming(input: {
  sessions: RawSession[];
  cancelled: Set<string>;
  linked: { private_session_id: string; status: string }[];
  packages: { id: string; price: number; private_session_players: number | null }[];
  playerId: string;
  limit: number;
  /** false when the linked payments couldn't be read: the state is unknown, not unpaid */
  paymentsKnown?: boolean;
}): UpcomingSession[] {
  return input.sessions
    .filter((s) => s.end_date && !input.cancelled.has(`${s.id}|${s.end_date}`))
    .slice(0, input.limit)
    .map((s) => {
      const pkg = privatePackageFor(s.private_players.length, input.packages);
      const statuses = input.linked.filter((l) => l.private_session_id === s.id).map((l) => l.status);
      const state = input.paymentsKnown !== false && pkg && s.player_id ? paymentState(statuses) : null;
      const youPay = s.player_id === input.playerId;
      const payer = s.private_players.find((p) => p.player_id === s.player_id)?.profiles ?? null;
      return {
        id: s.id,
        when: sessionWhen(s.end_date!, s.start_time),
        coach: s.coach ? fullName(s.coach) : null,
        others: s.private_players
          .filter((p) => p.player_id !== input.playerId && p.profiles)
          .map((p) => fullName(p.profiles!)),
        payerFirstName: payer?.first_name ?? null,
        youPay,
        state,
        pay: youPay && state === "unpaid" && pkg ? { packageId: pkg.id, price: Number(pkg.price) } : null,
      };
    });
}

export async function loadPlayerPrivateSessions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  playerId: string,
  today: string
): Promise<PlayerPrivateSessions> {
  const [{ data: requests }, { data: mine }] = await Promise.all([
    admin
      .from("private_session_requests")
      .select("id, requested_date, requested_day_of_week, requested_time, coach:profiles!private_session_requests_coach_id_fkey(first_name, last_name)")
      .eq("player_id", playerId)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    admin.from("schedule_session_players").select("schedule_session_id").eq("player_id", playerId),
  ]);

  const pending: PendingRequest[] = (
    (requests || []) as {
      id: string;
      requested_date: string | null;
      requested_day_of_week: number;
      requested_time: string;
      coach: Name | null;
    }[]
  ).map((r) => ({ id: r.id, when: requestWhen(r), coach: r.coach ? fullName(r.coach) : null }));

  const ids = [...new Set(((mine || []) as { schedule_session_id: string }[]).map((m) => m.schedule_session_id))];
  if (ids.length === 0) return { pending, upcoming: [] };

  const { data: sessions } = await admin
    .from("schedule_sessions")
    .select("id, player_id, end_date, start_time, coach:profiles!schedule_sessions_coach_id_fkey(first_name, last_name), private_players:schedule_session_players(player_id, profiles!schedule_session_players_player_id_fkey(first_name, last_name))")
    .in("id", ids)
    .eq("session_type", "private")
    .eq("is_active", true)
    .gte("end_date", today)
    .order("end_date", { ascending: true })
    .order("start_time", { ascending: true });
  const rows = (sessions || []) as RawSession[];
  if (rows.length === 0) return { pending, upcoming: [] };

  const rowIds = rows.map((s) => s.id);
  const [{ data: cancellations }, { data: linked, error: linkedError }, { data: packages }] = await Promise.all([
    admin
      .from("schedule_session_cancellations")
      .select("schedule_session_id, cancelled_date")
      .in("schedule_session_id", rowIds),
    admin.from("subscriptions").select("private_session_id, status").in("private_session_id", rowIds),
    admin
      .from("packages")
      .select("id, price, private_session_players")
      .not("private_session_players", "is", null)
      .eq("is_active", true),
  ]);

  const cancelled = new Set(
    ((cancellations || []) as { schedule_session_id: string; cancelled_date: string }[]).map(
      (c) => `${c.schedule_session_id}|${c.cancelled_date}`
    )
  );

  return {
    pending,
    upcoming: buildUpcoming({
      sessions: rows,
      cancelled,
      linked: linked || [],
      packages: packages || [],
      playerId,
      limit: UPCOMING_LIMIT,
      // e.g. a database without private_session_id yet: never offer Pay on a guess
      paymentsKnown: !linkedError,
    }),
  };
}
