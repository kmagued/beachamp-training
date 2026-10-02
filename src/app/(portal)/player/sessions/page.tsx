import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
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

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        {[
          { label: "Present", value: presentCount, className: "text-emerald-600" },
          { label: "Absent", value: absentCount, className: "text-red-500" },
          { label: "Excused", value: excusedCount, className: "text-amber-500" },
        ].map((t) => (
          <div key={t.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
            <p className={`font-display text-3xl sm:text-4xl leading-none ${t.className}`}>{t.value}</p>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">{t.label}</p>
          </div>
        ))}
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
