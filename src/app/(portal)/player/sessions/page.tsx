import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, Badge, EmptyState } from "@/components/ui";
import { CalendarDays } from "lucide-react";
import type { Attendance } from "@/types/database";

export default async function PlayerSessionsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: attendance } = await supabase
    .from("attendance")
    .select("*, groups(name)")
    .eq("player_id", currentUser.id)
    .order("session_date", { ascending: false }) as {
    data: (Attendance & { groups: { name: string } | null })[] | null;
  };

  const records = attendance || [];
  const presentCount = records.filter((r) => r.status === "present").length;
  const absentCount = records.filter((r) => r.status === "absent").length;
  const excusedCount = records.filter((r) => r.status === "excused").length;

  const statusBadge = (status: string) => {
    switch (status) {
      case "present":
        return <Badge variant="success">Present</Badge>;
      case "absent":
        return <Badge variant="danger">Absent</Badge>;
      case "excused":
        return <Badge variant="warning">Excused</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">My Sessions</h1>
        <p className="text-slate-500 text-sm">Your attendance history</p>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Badge variant="success">{presentCount} Present</Badge>
        <Badge variant="danger">{absentCount} Absent</Badge>
        <Badge variant="warning">{excusedCount} Excused</Badge>
      </div>

      {records.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                    Date
                  </th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                    Time
                  </th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                    Group
                  </th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, i) => (
                  <tr
                    key={record.id}
                    className={`border-b border-slate-100 ${i % 2 === 1 ? "bg-[#FAFBFC]" : ""}`}
                  >
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {new Date(record.session_date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {record.session_time || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {record.groups?.name || "—"}
                    </td>
                    <td className="px-4 py-3">{statusBadge(record.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<CalendarDays className="w-10 h-10" />}
            title="No Sessions Yet"
            description="Your attendance records will appear here once coaches start logging sessions."
          />
        </Card>
      )}
    </div>
  );
}
