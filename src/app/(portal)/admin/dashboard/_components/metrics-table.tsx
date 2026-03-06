"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui";
import { BarChart3 } from "lucide-react";

interface MetricsTableProps {
  attendanceRecords: { status: string; session_date: string; group_id: string }[];
  subscriptions: { player_id: string; status: string; end_date: string | null; created_at: string }[];
  profiles: { id: string; created_at: string }[];
  groupPlayers: { group_id: string; player_id: string; joined_at: string; is_active: boolean }[];
  groups: { id: string; max_players: number }[];
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function MetricsTable({ attendanceRecords, subscriptions, profiles, groupPlayers, groups }: MetricsTableProps) {
  // Build month options from attendance + subscription data
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    attendanceRecords.forEach((a) => months.add(monthKey(new Date(a.session_date + "T00:00:00"))));
    subscriptions.forEach((s) => {
      if (s.end_date) months.add(monthKey(new Date(s.end_date + "T00:00:00")));
      months.add(monthKey(new Date(s.created_at)));
    });
    const currentMonth = monthKey(new Date());
    return [...months].filter((m) => m <= currentMonth).sort((a, b) => b.localeCompare(a));
  }, [attendanceRecords, subscriptions]);

  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));

  const metrics = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0); // last day of month
    const monthStartISO = monthStart.toISOString().split("T")[0];
    const monthEndISO = monthEnd.toISOString().split("T")[0];

    // Attendance rate: present players / expected players per session
    const monthAttendance = attendanceRecords.filter((a) => a.session_date >= monthStartISO && a.session_date <= monthEndISO);
    const presentAtt = monthAttendance.filter((a) => a.status === "present").length;

    // Group player counts for expected attendance (only players who had joined by that month)
    const gpCountByGroup: Record<string, number> = {};
    groupPlayers.forEach((gp) => {
      if (gp.joined_at <= monthEndISO) {
        gpCountByGroup[gp.group_id] = (gpCountByGroup[gp.group_id] || 0) + 1;
      }
    });

    // Find unique sessions (date + group) and sum expected players
    const sessionKeys = new Set<string>();
    let expectedAtt = 0;
    monthAttendance.forEach((a) => {
      const key = `${a.session_date}|${a.group_id}`;
      if (!sessionKeys.has(key)) {
        sessionKeys.add(key);
        expectedAtt += gpCountByGroup[a.group_id] || 0;
      }
    });
    const attendanceRate = expectedAtt > 0 ? Math.round((presentAtt / expectedAtt) * 100) : 0;

    // Active players at end of month: those with active subscriptions overlapping the month
    const activePlayers = new Set<string>();
    subscriptions.forEach((s) => {
      if (s.status === "active" || s.status === "expired" || s.status === "cancelled") {
        // Was active during this month?
        const created = s.created_at.split("T")[0];
        const ended = s.end_date || "9999-12-31";
        if (created <= monthEndISO && ended >= monthStartISO && s.status !== "cancelled") {
          activePlayers.add(s.player_id);
        }
        // For expired/cancelled, check if they were active during the month
        if ((s.status === "expired" || s.status === "cancelled") && ended >= monthStartISO && ended <= monthEndISO) {
          activePlayers.add(s.player_id);
        }
      }
      if (s.status === "active") {
        activePlayers.add(s.player_id);
      }
    });

    // Churned this month: subscriptions that expired/cancelled in this month
    const churnedPlayers = new Set<string>();
    subscriptions.forEach((s) => {
      if ((s.status === "expired" || s.status === "cancelled") && s.end_date) {
        if (s.end_date >= monthStartISO && s.end_date <= monthEndISO) {
          churnedPlayers.add(s.player_id);
        }
      }
    });
    const churnedCount = churnedPlayers.size;
    const activeCount = activePlayers.size;

    // Retention rate
    const retentionRate = activeCount + churnedCount > 0
      ? Math.round((activeCount / (activeCount + churnedCount)) * 100)
      : 100;

    // Churn rate
    const churnRate = activeCount + churnedCount > 0
      ? Math.round((churnedCount / (activeCount + churnedCount)) * 100)
      : 0;

    // Capacity for selected month: players who joined on or before month end and were still active (or joined during the month)
    const monthGroupPlayers = groupPlayers.filter((gp) => {
      const joined = gp.joined_at;
      // Player must have joined on or before the end of the month
      if (joined > monthEndISO) return false;
      // If still active, they were in the group during this month
      if (gp.is_active) return true;
      // If inactive, they were in the group if they joined before month end
      // (we don't have a left_at date, so assume they were present if joined before month end)
      return true;
    });
    const totalGroupPlayers = monthGroupPlayers.length;
    const totalCapacity = groups.reduce((s, g) => s + g.max_players, 0);
    const capacityRate = totalCapacity > 0 ? Math.round((totalGroupPlayers / totalCapacity) * 100) : 0;

    // New members this month
    const newMembers = profiles.filter((p) => {
      const created = p.created_at.split("T")[0];
      return created >= monthStartISO && created <= monthEndISO;
    }).length;

    return [
      { label: "Attendance Rate", value: `${attendanceRate}%`, detail: `${presentAtt} / ${expectedAtt} expected`, color: attendanceRate >= 70 ? "text-emerald-600" : attendanceRate >= 50 ? "text-amber-600" : "text-red-600" },
      { label: "Retention Rate", value: `${retentionRate}%`, detail: null, color: retentionRate >= 80 ? "text-emerald-600" : retentionRate >= 60 ? "text-amber-600" : "text-red-600" },
      { label: "Capacity", value: `${capacityRate}%`, detail: `${totalGroupPlayers} / ${totalCapacity} slots`, color: capacityRate >= 80 ? "text-red-600" : capacityRate >= 50 ? "text-amber-600" : "text-emerald-600" },
      { label: "Monthly Churn", value: `${churnRate}%`, detail: `${churnedCount} left`, color: churnRate <= 5 ? "text-emerald-600" : churnRate <= 15 ? "text-amber-600" : "text-red-600" },
      { label: "New Members", value: String(newMembers), detail: null, color: "text-blue-600" },
    ];
  }, [selectedMonth, attendanceRecords, subscriptions, profiles, groupPlayers, groups]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-400" />
          Key Metrics
        </h2>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          {monthOptions.map((key) => (
            <option key={key} value={key}>{monthLabel(key)}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto -mx-6 px-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Metric</th>
              <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Value</th>
              <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.label} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 text-slate-700 font-medium">{m.label}</td>
                <td className={`py-2.5 text-right font-bold ${m.color}`}>{m.value}</td>
                <td className="py-2.5 text-right text-slate-400 text-xs">{m.detail || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
