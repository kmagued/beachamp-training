"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Package } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type RevenueView = "30d" | "monthly" | "quarterly" | "yearly";

const REVENUE_VIEWS: { key: RevenueView; label: string }[] = [
  { key: "30d", label: "30 Days" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "yearly", label: "Yearly" },
];

interface DashboardChartsProps {
  revenuePayments: { amount: number; date: string }[];
  subsByPackage: { name: string; count: number }[];
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


export function DashboardCharts({ revenuePayments, subsByPackage }: DashboardChartsProps) {
  const [revenueView, setRevenueView] = useState<RevenueView>("30d");

  const revenueChartData = useMemo(() => {
    const now = new Date();

    switch (revenueView) {
      case "30d": {
        const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const filtered = revenuePayments.filter(p => new Date(p.date) >= cutoff);
        const map: Record<string, number> = {};
        for (const p of filtered) {
          const d = new Date(p.date);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          map[key] = (map[key] || 0) + p.amount;
        }
        return Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, amount]) => {
            const d = new Date(key + "T00:00:00");
            return { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), amount };
          });
      }
      case "monthly": {
        const map: Record<string, number> = {};
        for (const p of revenuePayments) {
          const d = new Date(p.date);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          map[key] = (map[key] || 0) + p.amount;
        }
        const months = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          months.push({
            date: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
            amount: map[key] || 0,
          });
        }
        return months;
      }
      case "quarterly": {
        const map: Record<string, number> = {};
        for (const p of revenuePayments) {
          const d = new Date(p.date);
          const q = Math.floor(d.getMonth() / 3) + 1;
          const key = `${d.getFullYear()}-Q${q}`;
          map[key] = (map[key] || 0) + p.amount;
        }
        const quarters: { date: string; amount: number }[] = [];
        const seen = new Set<string>();
        for (let i = 7; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
          const q = Math.floor(d.getMonth() / 3) + 1;
          const key = `${d.getFullYear()}-Q${q}`;
          const label = `Q${q} ${d.getFullYear().toString().slice(-2)}`;
          if (!seen.has(key)) {
            seen.add(key);
            quarters.push({ date: label, amount: map[key] || 0 });
          }
        }
        return quarters;
      }
      case "yearly": {
        const map: Record<string, number> = {};
        for (const p of revenuePayments) {
          const year = new Date(p.date).getFullYear().toString();
          map[year] = (map[year] || 0) + p.amount;
        }
        return Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, amount]) => ({ date, amount }));
      }
    }
  }, [revenuePayments, revenueView]);

  return (
    <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
      {/* Revenue Trend */}
      <Card className="sm:col-span-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            Revenue
          </h2>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            {REVENUE_VIEWS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setRevenueView(key)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  revenueView === key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {revenueChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={revenueChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
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
      <Card className="sm:col-span-2">
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
    </div>
  );
}
