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
  primary: "#124B5D",
  primaryDark: "#0C313A",
  secondary: "#5CACB0",
  secondaryDark: "#1596B5",
  accent: "#F7AC40",
  accentDark: "#E8901A",
  sand: "#EDDCB2",
};

const PACKAGE_COLORS = [COLORS.primary, COLORS.secondary, COLORS.accent, COLORS.secondaryDark, COLORS.accentDark, COLORS.sand];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-primary-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="text-primary-700/60 text-xs mb-1">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }, i: number) => (
        <p key={i} className="font-semibold" style={{ color: p.color }}>
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
          <h2 className="font-display text-2xl tracking-wide text-primary-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-secondary" />
            Revenue
          </h2>
          <div className="flex gap-1 bg-sand/50 rounded-lg p-0.5">
            {REVENUE_VIEWS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setRevenueView(key)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-semibold transition-colors",
                  revenueView === key
                    ? "bg-white text-primary-900 shadow-sm"
                    : "text-primary-700/60 hover:text-primary-900"
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
                  <stop offset="5%" stopColor={COLORS.secondary} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={COLORS.secondary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDDCB2" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#5A6B73" }}
                tickLine={false}
                axisLine={{ stroke: "#C4D8DE" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#5A6B73" }}
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
                strokeWidth={2.5}
                fill="url(#revenueGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-primary-700/50 text-center py-12">No revenue data for this period</p>
        )}
      </Card>

      {/* Subscriptions by Package */}
      <Card className="sm:col-span-2">
        <h2 className="font-display text-2xl tracking-wide text-primary-900 flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-secondary" />
          Active Subscriptions
        </h2>
        {subsByPackage.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={subsByPackage} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDDCB2" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#5A6B73" }}
                tickLine={false}
                axisLine={{ stroke: "#C4D8DE" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#5A6B73" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Subscriptions" radius={[6, 6, 0, 0]}>
                {subsByPackage.map((_, i) => (
                  <Cell key={i} fill={PACKAGE_COLORS[i % PACKAGE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-primary-700/50 text-center py-12">No active subscriptions</p>
        )}
      </Card>
    </div>
  );
}
