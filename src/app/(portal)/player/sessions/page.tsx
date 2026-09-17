import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, Badge, EmptyState } from "@/components/ui";
import { CalendarDays } from "lucide-react";
import { SessionsTable, type SessionRecord } from "./_components/sessions-table";
import type { Attendance } from "@/types/database";

export default async function PlayerSessionsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: attendance } = await supabase
    .from("attendance")
    .select("id, session_date, session_time, status, groups(name)")
    .eq("player_id", currentUser.id)
    .order("session_date", { ascending: false }) as {
    data: (Attendance & { groups: { name: string } | null })[] | null;
  };

  const rows = attendance || [];
  const records: SessionRecord[] = rows.map((r) => ({
    id: r.id,
    session_date: r.session_date,
    session_time: r.session_time,
    status: r.status,
    group_name: r.groups?.name ?? null,
  }));
  const presentCount = records.filter((r) => r.status === "present").length;
  const absentCount = records.filter((r) => r.status === "absent").length;
  const excusedCount = records.filter((r) => r.status === "excused").length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">My Sessions</h1>
        <p className="text-slate-500 text-sm">Your attendance history</p>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Badge variant="success">{presentCount} Present</Badge>
        <Badge variant="danger">{absentCount} Absent</Badge>
        <Badge variant="warning">{excusedCount} Excused</Badge>
      </div>

      {records.length > 0 ? (
        <SessionsTable records={records} />
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
