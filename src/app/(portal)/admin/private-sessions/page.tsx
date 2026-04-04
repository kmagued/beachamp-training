import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, Badge, EmptyState } from "@/components/ui";
import { UserCheck } from "lucide-react";
import { ActionButtons } from "./_components/action-buttons";

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

  const { data: requests } = await supabase
    .from("private_session_requests")
    .select(`
      *,
      player:profiles!private_session_requests_player_id_fkey(first_name, last_name, phone),
      coach:profiles!private_session_requests_coach_id_fkey(first_name, last_name)
    `)
    .order("created_at", { ascending: false });

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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          Private Sessions
          {pendingCount > 0 && (
            <span className="ml-2 bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
              {pendingCount} pending
            </span>
          )}
        </h1>
        <p className="text-slate-500 text-sm">Manage private session requests from players</p>
      </div>

      {items.length === 0 ? (
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
                        {r.status === "pending" && <ActionButtons requestId={r.id} />}
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
                    <ActionButtons requestId={r.id} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
