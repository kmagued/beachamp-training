"use client";

import { Card } from "@/components/ui";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp, Package, Activity } from "lucide-react";

interface DashboardChartsProps {
  revenueByDay: { date: string; amount: number }[];
  subsByPackage: { name: string; count: number }[];
  playersByLevel: { level: string; count: number }[];
}

const COLORS = {
  primary: "#0891B2",
  emerald: "#10B981",
  amber: "#F59E0B",
  red: "#EF4444",
  blue: "#3B82F6",
  purple: "#8B5CF6",
  indigo: "#6366F1",
};

const LEVEL_COLORS: Record<string, string> = {
  beginner: COLORS.emerald,
  intermediate: COLORS.amber,
  advanced: COLORS.red,
  professional: COLORS.purple,
};

const PACKAGE_COLORS = [COLORS.primary, COLORS.emerald, COLORS.blue, COLORS.amber, COLORS.purple, COLORS.indigo];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="text-slate-500 text-xs mb-1">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <p key={i} className="font-medium" style={{ color: p.color }}>
          {p.name}: {p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-slate-900 capitalize">{name}: {value}</p>
    </div>
  );
}

export function DashboardCharts({ revenueByDay, subsByPackage, playersByLevel }: DashboardChartsProps) {
  const totalPlayers = playersByLevel.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
      {/* Revenue Trend */}
      <Card className="sm:col-span-2">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-slate-400" />
          Revenue (Last 30 Days)
        </h2>
        {revenueByDay.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={revenueByDay} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="amount"
                name="Revenue (EGP)"
                stroke={COLORS.primary}
                strokeWidth={2}
                fill="url(#revenueGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-slate-400 text-center py-12">No revenue data for this period</p>
        )}
      </Card>

      {/* Subscriptions by Package */}
      <Card>
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
          <Package className="w-4 h-4 text-slate-400" />
          Active Subscriptions
        </h2>
        {subsByPackage.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={subsByPackage} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Subscriptions" radius={[4, 4, 0, 0]}>
                {subsByPackage.map((_, i) => (
                  <Cell key={i} fill={PACKAGE_COLORS[i % PACKAGE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-slate-400 text-center py-12">No active subscriptions</p>
        )}
      </Card>

      {/* Player Levels */}
      <Card className="sm:col-span-2 lg:col-span-1">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-slate-400" />
          Player Levels
          {totalPlayers > 0 && <span className="text-xs text-slate-400 font-normal">({totalPlayers} total)</span>}
        </h2>
        {totalPlayers > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={playersByLevel}
                dataKey="count"
                nameKey="level"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                strokeWidth={0}
              >
                {playersByLevel.map((entry) => (
                  <Cell key={entry.level} fill={LEVEL_COLORS[entry.level] || "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-xs text-slate-600 capitalize">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-slate-400 text-center py-12">No players yet</p>
        )}
      </Card>
    </div>
  );
}
