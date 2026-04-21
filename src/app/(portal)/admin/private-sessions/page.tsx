import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, Badge, EmptyState } from "@/components/ui";
import { UserCheck, CalendarClock } from "lucide-react";
import Link from "next/link";
import { ActionButtons } from "./_components/action-buttons";
import { CreatePrivateSessionButton } from "./_components/create-private-session-button";
import { DeletePrivateSessionButton } from "./_components/delete-private-session-button";
import { PrivateSessionsTabs } from "./_components/private-sessions-tabs";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function statusBadge(status: string) {
  switch (status) {
    case "pending": return <Badge variant="warning">Pending</Badge>;
    case "confirmed": return <Badge variant="success">Confirmed</Badge>;
    case "rejected": return <Badge variant="danger">Rejected</Badge>;
    case "cancelled": return <Badge variant="neutral">Cancelled</Badge>;
    case "completed": return <Badge variant="info">Completed</Badge>;
    default: return <Badge variant="neutral">{status}</Badge>;
  }
}

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export default async function AdminPrivateSessionsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const [{ data: requests }, { data: scheduled }, { data: players }, { data: coaches }] = await Promise.all([
    supabase
      .from("private_session_requests")
      .select(`
        *,
        player:profiles!private_session_requests_player_id_fkey(first_name, last_name, phone),
        coach:profiles!private_session_requests_coach_id_fkey(first_name, last_name)
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("schedule_sessions")
      .select(`
        id, end_date, start_time, end_time, location, created_at,
        private_players:schedule_session_players(profiles!schedule_session_players_player_id_fkey(first_name, last_name, phone)),
        coach:profiles!schedule_sessions_coach_id_fkey(first_name, last_name)
      `)
      .eq("session_type", "private")
      .eq("is_active", true)
      .order("end_date", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("role", "player")
      .eq("is_active", true)
      .order("first_name"),
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("role", ["coach", "admin"])
      .eq("is_active", true)
      .order("first_name"),
  ]);

  const items = (requests || []) as {
    id: string;
    requested_day_of_week: number;
    requested_time: string;
    duration_minutes: number;
    status: string;
    notes: string | null;
    admin_notes: string | null;
    location: string | null;
    created_at: string;
    player: { first_name: string; last_name: string; phone: string | null } | null;
    coach: { first_name: string; last_name: string } | null;
  }[];

  const pendingCount = items.filter((r) => r.status === "pending").length;

  const scheduledItems = ((scheduled || []) as {
    id: string;
    end_date: string | null;
    start_time: string;
    end_time: string;
    location: string | null;
    created_at: string;
    private_players: { profiles: { first_name: string; last_name: string; phone: string | null } | null }[];
    coach: { first_name: string; last_name: string } | null;
  }[]).map((s) => {
    const players = (s.private_players || [])
      .map((pp) => pp.profiles)
      .filter((p): p is { first_name: string; last_name: string; phone: string | null } => Boolean(p));
    return { ...s, players };
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingScheduled = scheduledItems
    .filter((s) => s.end_date && new Date(s.end_date + "T00:00:00") >= today)
    .sort((a, b) => (a.end_date! < b.end_date! ? -1 : 1));
  const pastScheduled = scheduledItems
    .filter((s) => s.end_date && new Date(s.end_date + "T00:00:00") < today);

  const playerOptions = ((players || []) as { id: string; first_name: string; last_name: string }[]).map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`,
  }));
  const coachOptions = ((coaches || []) as { id: string; first_name: string; last_name: string }[]).map((c) => ({
    id: c.id,
    name: `${c.first_name} ${c.last_name}`,
  }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">
            Private Sessions
            {pendingCount > 0 && (
              <span className="ml-2 bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                {pendingCount} pending
              </span>
            )}
          </h1>
          <p className="text-slate-500 text-sm">Manage private session requests from players</p>
        </div>
        <CreatePrivateSessionButton players={playerOptions} coaches={coachOptions} />
      </div>

      <PrivateSessionsTabs
        tabs={[
          { key: "scheduled", label: "Scheduled Sessions", count: upcomingScheduled.length },
          { key: "requests", label: "Player Requests", count: pendingCount, badgeTone: "warning" },
        ]}
      >
        {{
          scheduled: (
            <>
              {scheduledItems.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="w-12 h-12" />}
            title="No Private Sessions Scheduled"
            description="Create a new private session or confirm a player request to see it here."
          />
        ) : (
          <>
            {/* Desktop */}
            <Card className="hidden sm:block overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Player</th>
                      <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Date</th>
                      <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Time</th>
                      <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Coach</th>
                      <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Location</th>
                      <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Status</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...upcomingScheduled, ...pastScheduled].map((s) => {
                      const isPast = s.end_date ? new Date(s.end_date + "T00:00:00") < today : false;
                      const dateLabel = s.end_date
                        ? new Date(s.end_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
                        : "—";
                      const playerName = s.players.length === 0
                        ? "—"
                        : s.players.length === 1
                          ? `${s.players[0].first_name} ${s.players[0].last_name}`
                          : `${s.players.length} players`;
                      const phone = s.players.length === 1 ? s.players[0].phone : null;
                      return (
                        <tr key={s.id} className={`border-b border-slate-100 ${isPast ? "opacity-60" : ""}`}>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">
                            {playerName}
                            {phone && (
                              <span className="block text-[10px] text-slate-400">{phone}</span>
                            )}
                            {s.players.length > 1 && (
                              <span className="block text-[10px] text-slate-400 max-w-[200px] truncate">
                                {s.players.map((p) => `${p.first_name} ${p.last_name}`).join(", ")}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{dateLabel}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {formatTime(s.start_time)} — {formatTime(s.end_time)}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {s.coach ? `${s.coach.first_name} ${s.coach.last_name}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{s.location || "—"}</td>
                          <td className="px-4 py-3">
                            {isPast ? (
                              <Badge variant="neutral">Past</Badge>
                            ) : (
                              <Link
                                href={`/admin/sessions/${s.id}?date=${s.end_date}`}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Open
                              </Link>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <DeletePrivateSessionButton
                              scheduleSessionId={s.id}
                              playerName={playerName}
                              dateLabel={dateLabel}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Mobile */}
            <div className="sm:hidden space-y-3">
              {[...upcomingScheduled, ...pastScheduled].map((s) => {
                const isPast = s.end_date ? new Date(s.end_date + "T00:00:00") < today : false;
                const dateLabel = s.end_date
                  ? new Date(s.end_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                  : "—";
                return (
                  <Card key={s.id} className={`p-4 ${isPast ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {s.players.length === 0
                            ? "—"
                            : s.players.length === 1
                              ? `${s.players[0].first_name} ${s.players[0].last_name}`
                              : `${s.players.length} players`}
                        </p>
                        {s.players.length === 1 && s.players[0].phone && (
                          <p className="text-[10px] text-slate-400">{s.players[0].phone}</p>
                        )}
                        {s.players.length > 1 && (
                          <p className="text-[10px] text-slate-400">
                            {s.players.map((p) => `${p.first_name} ${p.last_name}`).join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {isPast ? <Badge variant="neutral">Past</Badge> : (
                          <Link href={`/admin/sessions/${s.id}?date=${s.end_date}`} className="text-xs font-medium text-primary hover:underline">
                            Open
                          </Link>
                        )}
                        <DeletePrivateSessionButton
                          scheduleSessionId={s.id}
                          playerName={s.players.length === 0
                            ? "—"
                            : s.players.length === 1
                              ? `${s.players[0].first_name} ${s.players[0].last_name}`
                              : `${s.players.length} players`}
                          dateLabel={dateLabel}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400">Date</span>
                        <p className="text-slate-700 font-medium">{dateLabel}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Time</span>
                        <p className="text-slate-700 font-medium">{formatTime(s.start_time)} — {formatTime(s.end_time)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Coach</span>
                        <p className="text-slate-700 font-medium">
                          {s.coach ? `${s.coach.first_name} ${s.coach.last_name}` : "—"}
                        </p>
                      </div>
                      {s.location && (
                        <div>
                          <span className="text-slate-400">Location</span>
                          <p className="text-slate-700 font-medium">{s.location}</p>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
            </>
          ),
          requests: items.length === 0 ? (
            <EmptyState
              icon={<UserCheck className="w-12 h-12" />}
              title="No Private Session Requests"
              description="Requests from players will appear here."
            />
          ) : (
        <>
          {/* Desktop Table */}
          <Card className="hidden sm:block overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Player</th>
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Day</th>
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Time</th>
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Coach</th>
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Notes</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {r.player ? `${r.player.first_name} ${r.player.last_name}` : "—"}
                        {r.player?.phone && (
                          <span className="block text-[10px] text-slate-400">{r.player.phone}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-600">{DAY_NAMES[r.requested_day_of_week]}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatTime(r.requested_time)} ({r.duration_minutes}min)</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {r.coach ? `${r.coach.first_name} ${r.coach.last_name}` : "Any"}
                      </td>
                      <td className="px-4 py-3">{statusBadge(r.status)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 max-w-[200px] truncate">{r.notes || "—"}</td>
                      <td className="px-4 py-3">
                        {r.status === "pending" && <ActionButtons requestId={r.id} requestedDayOfWeek={r.requested_day_of_week} requestedTime={r.requested_time} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {items.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {r.player ? `${r.player.first_name} ${r.player.last_name}` : "—"}
                    </p>
                    {r.player?.phone && (
                      <p className="text-[10px] text-slate-400">{r.player.phone}</p>
                    )}
                  </div>
                  {statusBadge(r.status)}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Day</span>
                    <p className="text-slate-700 font-medium">{DAY_NAMES[r.requested_day_of_week]}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Time</span>
                    <p className="text-slate-700 font-medium">{formatTime(r.requested_time)} ({r.duration_minutes}min)</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Coach</span>
                    <p className="text-slate-700 font-medium">
                      {r.coach ? `${r.coach.first_name} ${r.coach.last_name}` : "Any"}
                    </p>
                  </div>
                </div>
                {r.notes && (
                  <div className="mt-2 pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-400">Notes: </span>
                    <span className="text-slate-600">{r.notes}</span>
                  </div>
                )}
                {r.status === "pending" && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <ActionButtons requestId={r.id} requestedDayOfWeek={r.requested_day_of_week} requestedTime={r.requested_time} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      ),
        }}
      </PrivateSessionsTabs>
    </div>
  );
}
