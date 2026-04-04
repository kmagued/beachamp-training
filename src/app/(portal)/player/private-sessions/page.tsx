import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, Badge, EmptyState, Button } from "@/components/ui";
import { UserCheck, Plus } from "lucide-react";
import { CancelButton } from "./_components/cancel-button";

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

export default async function PlayerPrivateSessionsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: requests } = await supabase
    .from("private_session_requests")
    .select("*, profiles!private_session_requests_coach_id_fkey(first_name, last_name)")
    .eq("player_id", currentUser.id)
    .order("created_at", { ascending: false });

  const items = (requests || []) as (Record<string, unknown> & {
    id: string;
    requested_day_of_week: number;
    requested_time: string;
    duration_minutes: number;
    status: string;
    notes: string | null;
    admin_notes: string | null;
    location: string | null;
    profiles: { first_name: string; last_name: string } | null;
  })[];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Private Sessions</h1>
          <p className="text-slate-500 text-sm">Request and manage private training sessions</p>
        </div>
        <Link href="/player/private-sessions/request">
          <Button size="sm">
            <span className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Request Session</span>
            </span>
          </Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<UserCheck className="w-12 h-12" />}
          title="No Private Session Requests"
          description="Request a private session with a coach to get personalized training."
        />
      ) : (
        <>
          {/* Desktop Table */}
          <Card className="hidden sm:block overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
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
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">{DAY_NAMES[r.requested_day_of_week]}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatTime(r.requested_time)} ({r.duration_minutes}min)</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : "Any coach"}
                      </td>
                      <td className="px-4 py-3">{statusBadge(r.status)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 max-w-[200px] truncate">
                        {r.admin_notes || r.notes || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {r.status === "pending" && <CancelButton requestId={r.id} />}
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
                  <p className="text-sm font-semibold text-slate-900">{DAY_NAMES[r.requested_day_of_week]}</p>
                  {statusBadge(r.status)}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Time</span>
                    <p className="text-slate-700 font-medium">{formatTime(r.requested_time)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Duration</span>
                    <p className="text-slate-700 font-medium">{r.duration_minutes} min</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Coach</span>
                    <p className="text-slate-700 font-medium">
                      {r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : "Any"}
                    </p>
                  </div>
                </div>
                {(r.admin_notes || r.notes) && (
                  <div className="mt-2 pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-400">Notes: </span>
                    <span className="text-slate-600">{r.admin_notes || r.notes}</span>
                  </div>
                )}
                {r.status === "pending" && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <CancelButton requestId={r.id} />
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
